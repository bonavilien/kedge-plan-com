-- Corrections après les tests par service du 25 octobre 2026 :
-- demandes d'une fiche retirée, rappels après un retrait de demande, une seule notification par réponse,
-- droits gardés lors d'un passage en visiteur, réponse qui ne se rouvre pas.

-- =====================================================================
-- Une fiche retirée : ses demandes encore ouvertes sont retirées, le service sollicité est prévenu.
-- Sauf une action liée à un temps fort (ou un sujet) encore actif : ses demandes servent à tout le temps fort et restent.
-- =====================================================================
create function public.on_item_retire_reqs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'retire' and old.st <> 'retire'
     and not (new.tf is not null and exists (select 1 from public.items t where t.id = new.tf and t.st <> 'retire')) then
    perform set_config('kplan.retrait', '1', true);
    update public.reqs set st = 'annulee' where item = new.id and st = 'ouverte';
    perform set_config('kplan.retrait', '', true);
  end if;
  return new;
end $$;
create trigger items_retire_reqs after update of st on public.items for each row execute function public.on_item_retire_reqs();
revoke execute on function public.on_item_retire_reqs() from public, anon, authenticated;

-- ce qu'on ne réécrit pas après coup : une demande reçue reste reçue (sa réponse ne disparaît pas),
-- une demande retirée reste retirée ; la fiche retirée retire elle-même ses demandes
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if coalesce(current_setting('kplan.retrait', true), '') = '1' then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
    return new;
  end if;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if old.st in ('annulee', 'recue') then
    new.st := old.st;
  elsif new.st = 'annulee' and not (public.is_chef() or old.asker = auth.uid()) then
    raise exception 'seule la personne qui a demandé, ou un chef, retire la demande' using errcode = '42501';
  end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    new.reponse := left(btrim(coalesce(new.reponse, '')), 1000); new.repondu_par := auth.uid(); new.repondu_at := now();
  else
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
  end if;
  if (new.dest, new.type) is distinct from (old.dest, old.type) and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- notifications : une demande retirée avec sa fiche le dit
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || new.type
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

-- =====================================================================
-- Rappels J-30, J-15, J-7 : une demande retirée ne compte plus comme « déjà demandé » (comme dans l'appli)
-- =====================================================================
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee'
                                and (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- =====================================================================
-- Document joint à une réponse : la personne qui a demandé a déjà « Éléments reçus », pas de second message
-- =====================================================================
create or replace function public.on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select id, t, svc, cc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author
      and id is distinct from (select asker from public.reqs where id = new.req) and (
      notif_all or svc = it.svc or svc = any (it.cc) or (it.svc = 'chef' and it.partner is null and chef) or (it.partner is not null and media)
      or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire'))),
    'Nouveau document', public.nom_de(new.author) || ' a ajouté « ' || new.nom || ' » sur « ' || it.t || ' »', '#item=' || new.item);
  return new;
end $$;

-- =====================================================================
-- Passer quelqu'un en visiteur lui retire ses droits : le droit média ne se retire que par un compte média,
-- et ses propres droits de chef par un autre chef (comme quand on décoche l'interrupteur)
-- =====================================================================
create or replace function public.keep_profiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  -- ce qu'il restera une fois le visiteur appliqué (keep_visiteur passe après)
  if (new.media and not new.visiteur) is distinct from old.media and not public.is_media() then
    raise exception 'seul un compte « Partenariats média » peut changer ce droit' using errcode = '42501';
  end if;
  if new.id = auth.uid() and (new.chef and not new.visiteur) is distinct from old.chef then
    raise exception 'un autre chef de projet doit changer tes droits de chef' using errcode = '42501';
  end if;
  return new;
end $$;
