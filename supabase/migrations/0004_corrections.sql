-- Corrections après la campagne de tests du 25 octobre 2026 :
-- droits resserrés (comptes sans service, champs figés, partenariats), notifications manquantes,
-- rappels J-30 / J-15 / J-7 rattrapés et liés à la date, envoi réessayé après une panne.

-- =====================================================================
-- Droits
-- =====================================================================
-- un compte sans service n'a aucun service : null n'est égal à rien, donc il ne publie ni ne modifie rien
create or replace function public.my_svc() returns text
language sql stable security definer set search_path = public as $$
  select svc from public.profiles where id = auth.uid()
$$;

-- un partenariat est porté par le chef de projet : c'est le droit « média » qui compte, pas le service
drop policy publier on public.items;
create policy publier on public.items for insert to authenticated with check (
  author = auth.uid()
  and ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()))
);

-- seuls les comptes « média » gèrent la liste des partenaires
drop policy gerer on public.partners;
create policy gerer on public.partners for all to authenticated using (public.is_media()) with check (public.is_media());

-- les documents : ceux qui publient (service, chef, média) ; un compte en lecture seule demande des éléments
drop policy ajouter on public.links;
create policy ajouter on public.links for insert to authenticated
  with check (author = auth.uid() and (public.is_chef() or public.is_media() or public.my_svc() is not null));

-- lever un blocage : les chefs, l'auteur du blocage, ceux qui peuvent modifier la fiche
drop policy lever on public.blocks;
create policy lever on public.blocks for update to authenticated
  using (public.is_chef() or author = auth.uid() or exists (select 1 from public.items i where i.id = item
    and ((i.partner is null and i.svc = public.my_svc()) or (i.partner is not null and public.is_media()))))
  with check (leve);

-- ce qu'on ne réécrit pas après coup. Seuls les comptes connectés sont tenus (le tableau de bord Supabase reste libre).
create function public.keep_items() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.at := now(); return new; end if;
  new.author := old.author; new.at := old.at; new.kind := old.kind;
  return new;
end $$;
create trigger items_keep before insert or update on public.items for each row execute function public.keep_items();

-- une demande : le service sollicité ne fait que répondre ; la personne qui demande (ou un chef) peut changer quoi et la deadline
create function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  return new;
end $$;
create trigger reqs_keep before update on public.reqs for each row execute function public.keep_reqs();

-- un blocage se lève, il ne se réécrit pas
create function public.keep_blocks() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.item := old.item; new.author := old.author; new.why := old.why; new.at := old.at;
  return new;
end $$;
create trigger blocks_keep before update on public.blocks for each row execute function public.keep_blocks();

-- le droit « média » ne se donne et ne se retire que par un compte média (Julien reste seul à saisir les partenariats)
create function public.keep_profiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.media is distinct from old.media and not public.is_media() then
    raise exception 'seul un compte « Partenariats média » peut changer ce droit' using errcode = '42501';
  end if;
  if new.id = auth.uid() and new.chef is distinct from old.chef then
    raise exception 'un autre chef de projet doit changer tes droits de chef' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_keep before update on public.profiles for each row execute function public.keep_profiles();

-- un abonnement de téléphone passe à la personne qui l'active (téléphone partagé, compte changé sans se déconnecter)
create function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'connecte-toi' using errcode = '42501'; end if;
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke execute on function public.save_push(text, text, text) from public, anon;
grant execute on function public.save_push(text, text, text) to authenticated;

-- =====================================================================
-- Cohérence des fiches
-- =====================================================================
-- service porteur connu, temps fort lié qui en est bien un, messages connus, « Incontournable » seul
create function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  if new.tf is not null and (new.tf = new.id or not exists (select 1 from public.items where id = new.tf and kind = 'tf')) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort ou un sujet' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'INC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  if 'INC' = any (new.m) and cardinality(new.m) > 1 then
    new.m := array['INC'];
  end if;
  return new;
end $$;
create trigger items_check before insert or update of svc, tf, m on public.items for each row execute function public.check_item();

-- un service renommé : ses fiches, ses citations et ses demandes suivent (les profils suivent déjà)
create function public.on_service_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.k is distinct from old.k then
    update public.items set svc = new.k where svc = old.k;
    update public.items set cc = array_replace(cc, old.k, new.k) where old.k = any (cc);
    update public.reqs set dest = new.k where dest = old.k;
  end if;
  return new;
end $$;
create trigger services_rename after update of k on public.services for each row execute function public.on_service_rename();

-- les périodes ne se chevauchent pas
create function public.check_period() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.periods p where p.n <> new.n and p.du <= new.au and p.au >= new.du) then
    raise exception 'cette période chevauche une autre période' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger periods_check before insert or update on public.periods for each row execute function public.check_period();

-- =====================================================================
-- Notifications
-- =====================================================================
-- à la création : le service porteur aussi (une action posée par un chef pour RP prévient RP),
-- les chefs pour une action du chef de projet, les comptes média pour un partenariat
create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = any (new.cc)
      or (new.kind = 'action' and new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

-- après coup : un service ajouté à « Qui prévenir » est prévenu ; une fiche retirée prévient ceux qui la suivaient
create function public.on_item_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[] := array(select x from unnest(new.cc) as x where not (x = any (old.cc)));
  quoi text := case when new.kind = 'tf' and cardinality(new.per) > 0 then 'le sujet' when new.kind = 'tf' then 'le temps fort' else 'l''action' end;
begin
  if cardinality(added) > 0 and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and svc = any (added)),
      'Ton service est cité', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'cite:' || new.id || ':' || array_to_string(added, ',') || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Retiré : ' || new.t, public.nom_de(auth.uid()) || ' a retiré ' || quoi || '.', '#item=' || new.id,
      'retire:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;
create trigger items_changed after update of cc, st on public.items for each row execute function public.on_item_changed();

-- demande d'éléments : la même demande deux fois le même jour ne notifie qu'une fois ;
-- « éléments reçus » ne prévient pas la personne qui le note elle-même
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.item || ':' || new.dest || ':' || new.type || ':' || to_char(now(), 'YYYY-MM-DD'));
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus', new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  end if;
  return new;
end $$;

-- une deadline changée : le service sollicité est prévenu
create function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || new.pour);
  end if;
  return new;
end $$;
create trigger reqs_pour after update of pour on public.reqs for each row execute function public.on_req_pour();

-- une demande identique encore ouverte est refusée, et on ne peut pas en envoyer des dizaines d'affilée
create function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger reqs_check before insert on public.reqs for each row execute function public.check_req();

-- document ajouté : le service porteur, les services cités, ceux des relais d'un temps fort,
-- les chefs pour une fiche du chef de projet, les comptes média pour un partenariat, les prévenus de tout
create or replace function public.on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select id, t, svc, cc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = it.svc or svc = any (it.cc) or (it.svc = 'chef' and chef) or (it.partner is not null and media)
      or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire'))),
    'Nouveau document', public.nom_de(new.author) || ' a ajouté « ' || new.nom || ' » sur « ' || it.t || ' »', '#item=' || new.item);
  return new;
end $$;

-- prévenir à nouveau : un double appui n'écrit ni n'envoie deux fois, et pas plus de 5 relances par heure et par fiche
create or replace function public.renotify(p_item uuid, p_quoi text) returns int
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  dests uuid[];
  k text;
begin
  select * into it from public.items where id = p_item;
  if it.id is null then raise exception 'fiche introuvable'; end if;
  if not ((it.partner is null and (public.is_chef() or it.svc = public.my_svc())) or (it.partner is not null and public.is_media())) then
    raise exception 'pas le droit de prévenir pour cette fiche' using errcode = '42501';
  end if;
  p_quoi := left(btrim(coalesce(p_quoi, '')), 300);
  if p_quoi = '' then raise exception 'rien à dire'; end if;
  k := 'modif:' || it.id || ':' || md5(p_quoi || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  if exists (select 1 from public.outbox where dedupe like k || ':%') then return 0; end if;
  if (select count(*) from public.journal where item = it.id and kind = 'prevenu' and author = auth.uid() and at > now() - interval '1 hour') >= 5 then
    raise exception 'déjà prévenu plusieurs fois cette heure-ci' using errcode = '54000';
  end if;
  dests := array(select id from public.profiles where id is distinct from auth.uid() and (
    notif_all or svc = any (it.cc) or svc = it.svc or (it.svc = 'chef' and chef) or (it.partner is not null and media)
    or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire')));
  perform public.notify(dests, 'Modifié : ' || it.t, public.nom_de(auth.uid()) || ' : ' || p_quoi, '#item=' || it.id, k);
  insert into public.journal (item, kind, diff) values (it.id, 'prevenu', jsonb_build_object('quoi', p_quoi, 'n', cardinality(dests)));
  return cardinality(dests);
end $$;

-- le journal note l'heure de la base, pas celle du téléphone
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  foreach k in array array['t', 'date', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;

-- =====================================================================
-- Rappels J-30, J-15, J-7
-- =====================================================================
-- Chaque matin, pour chaque action datée au jour près dans les 30 jours : le jalon le plus proche déjà atteint
-- (30, 15 ou 7), s'il n'a pas encore été envoyé pour cette date. Une action créée à J-5, ou un matin manqué,
-- reçoit donc son rappel au passage suivant ; une action décalée repart avec ses nouveaux jalons.
-- Pas de rappel pour celui qui a déjà demandé des éléments sur la fiche ou son temps fort (lui ou son service),
-- ni pour celui qui a répondu « Pas besoin » pour cette date et ce jalon.
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
                              where (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)))
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id)),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- =====================================================================
-- Envoi : un message qui n'a pu partir (panne passagère) est réessayé à la minute suivante, cinq fois au plus
-- =====================================================================
alter table public.outbox add column tries smallint not null default 0;

revoke execute on function public.keep_items() from public, anon, authenticated;
revoke execute on function public.keep_reqs() from public, anon, authenticated;
revoke execute on function public.keep_blocks() from public, anon, authenticated;
revoke execute on function public.keep_profiles() from public, anon, authenticated;
revoke execute on function public.check_item() from public, anon, authenticated;
revoke execute on function public.check_req() from public, anon, authenticated;
revoke execute on function public.check_period() from public, anon, authenticated;
revoke execute on function public.on_service_rename() from public, anon, authenticated;
revoke execute on function public.on_item_changed() from public, anon, authenticated;
revoke execute on function public.on_req_pour() from public, anon, authenticated;
