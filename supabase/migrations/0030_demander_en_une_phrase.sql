-- 2.5.0 : « Demander en une phrase ». Sur la fiche, une seule ligne : « @Estelle les visuels pour vendredi dans 2 semaines ».
-- Une phrase sans date part « pour info » : la personne est prévenue, sans échéance, sans rappel, sans réponse attendue.
-- La veille de l'échéance, la personne à qui on a demandé reçoit un rappel.

-- 1. Une demande sans date = un message pour info (jamais pour un rappel pour soi, qui a toujours sa date)
alter table public.reqs alter column pour drop not null;

-- 2. On peut écrire plusieurs messages à la même personne sur la même fiche : seul le même texte, encore ouvert, est refusé
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest = 'moi' and new.pour is null then
    raise exception 'un rappel pour soi a toujours une date' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type
      and quoi = new.quoi and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 3. Les notifications disent la phrase elle-même ; « Pour info » quand il n'y a pas de date
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre text := (select t from public.items where id = new.item);
  quoi text := left(coalesce(nullif(btrim(new.quoi), ''), new.type), 140);
begin
  if tg_op = 'INSERT' then
    if new.pour is null then
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Pour info', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »)',
        '#item=' || new.item, 'req:' || new.id);
    else
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Demande', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »), pour le ' || to_char(new.pour, 'DD/MM'),
        '#item=' || new.item, 'req:' || new.id);
    end if;
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      public.nom_de(auth.uid()) || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from auth.uid()),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || quoi
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || quoi || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

-- 4. Une nouvelle date : prévenu ; une date retirée (le message devient pour info) : rien
create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.dest = 'moi' or new.pour is null then return new; end if;
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', left(coalesce(nullif(btrim(new.quoi), ''), new.type), 140) || ' (« ' || titre || ' ») : pour le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || coalesce(old.pour::text, '') || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- 5. Relancer : seulement une demande qui a une date (un message pour info n'attend rien)
create or replace function public.relancer(p_req uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reqs; titre text;
begin
  select * into r from public.reqs where id = p_req;
  if r.id is null or r.asker is distinct from auth.uid() then raise exception 'seule la personne qui a demandé relance' using errcode = '42501'; end if;
  if r.st <> 'ouverte' or r.dest = 'moi' or r.pour is null then raise exception 'cette demande n''attend plus de réponse' using errcode = '22023'; end if;
  titre := (select t from public.items where id = r.item);
  perform public.notify(
    array(select id from public.req_dests(r.dest) as id where id is distinct from auth.uid()),
    'Demande', 'Relance de ' || public.nom_de(auth.uid()) || ' : ' || left(coalesce(nullif(btrim(r.quoi), ''), r.type), 140) || ' (« ' || titre || ' »)', '#item=' || r.item,
    'relance:' || r.id || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (r.item, 'relance', jsonb_build_object('type', r.type, 'dest', r.dest));
end $$;
revoke execute on function public.relancer(uuid) from public, anon;
grant execute on function public.relancer(uuid) to authenticated;

-- 6. Les nouveaux titres comptent comme des « demandes » (chacun peut les couper dans Mon profil)
create or replace function public.notify(p_users uuid[], p_title text, p_body text, p_url text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  cat text := case
    when p_title in ('Demande d''éléments', 'Demande', 'Pour info', 'Pour demain', 'Éléments reçus', 'Demande retirée', 'Nouvelle deadline') then 'demandes'
    when p_title like 'Reporté : %' or p_title like 'Retiré : %' or p_title like 'Remis : %' then 'changements' end;
begin
  insert into public.outbox (user_id, title, body, url, dedupe)
  select u, p_title, p_body, p_url, case when p_dedupe is null then null else p_dedupe || ':' || u end
  from unnest(p_users) as u
  where u is not null
    and (cat is null or exists (select 1 from public.profiles p where p.id = u
          and case cat when 'demandes' then p.notif_demandes else p.notif_changements end))
  on conflict (dedupe) do nothing;
end $$;
revoke execute on function public.notify(uuid[], text, text, text, text) from public, anon, authenticated;

-- 7. La veille de l'échéance, un rappel à qui on a demandé (à 8 h, avec les rappels J-30 / J-15 / J-7)
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path to 'public' as $function$
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
                              where q.st <> 'annulee' and q.dest <> 'moi'
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
  -- la veille d'une échéance encore ouverte
  for r in
    select q.id, q.dest, q.asker, q.item, q.pour, left(coalesce(nullif(btrim(q.quoi), ''), q.type), 140) as quoi, i.t
    from public.reqs q join public.items i on i.id = q.item
    where q.st = 'ouverte' and q.dest <> 'moi' and q.pour = today + 1 and i.st <> 'retire'
  loop
    perform public.notify(
      array(select d from public.req_dests(r.dest) d where d is distinct from r.asker),
      'Pour demain', public.nom_de(r.asker) || ' attend : ' || r.quoi || ' (« ' || r.t || ' »)', '#item=' || r.item,
      'veille:' || r.id || ':' || r.pour);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;
