-- Base KEDGE : seulement si le fichier 2.6 (0031) a été collé AVANT la 2.6.1. Sinon, inutile : le fichier 2.6 contient déjà tout.
-- SQL Editor, New query, coller tout, Run. Peut être collé deux fois sans risque.
begin;
do $$ begin
  if not exists (select 1 from kplan_private.migrations where name = '0031_resultats_budget.sql') then
    raise exception 'Il faut d''abord coller le fichier de la 2.6 (2.6_0031_resultats_budget.sql), qui contient déjà ces corrections.';
  end if;
end $$;
-- 2.6.1 : corrections de la campagne de tests du 20 novembre (version 2.6).
-- 1. Un message « pour info » peut être réécrit à la même personne : seul le même texte d'une demande datée encore ouverte est refusé.
-- 2. Un « pour info » n'efface plus le rappel J-7 « As-tu besoin d'éléments ? ».
-- 3. On ne « répond » pas à un message pour info, et le retirer ne prévient personne d'une « demande retirée ».
-- 4. Chaque message écrit laisse une ligne dans l'historique : la cloche de l'appli le montre au destinataire.
-- 5. Les résultats se fusionnent dans la base : deux personnes qui notent en même temps ne s'effacent plus.
-- 6. Un compte passé visiteur ne reçoit plus les rappels « Pour demain » et ne répond plus.

-- 1. « déjà demandé » : seulement une demande datée, même texte, encore ouverte
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
  if new.dest <> 'moi' and new.pour is not null and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type
      and quoi = new.quoi and st = 'ouverte' and pour is not null) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de messages d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 3a. Un message pour info n'attend pas de réponse
create or replace function public.check_req_info() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.st = 'recue' and old.st = 'ouverte' and old.pour is null and old.dest <> 'moi' then
    raise exception 'un message pour info n''attend pas de réponse : écris un nouveau message' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists reqs_info on public.reqs;
create trigger reqs_info before update of st on public.reqs for each row execute function public.check_req_info();

-- 3b. Notifications : retirer un message pour info (ou annuler sa fiche) ne prévient personne
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
  elsif new.st = 'annulee' and old.st = 'ouverte' and new.pour is not null then
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

-- 4. Un message écrit (demande ou pour info) entre dans l'historique, sans son texte : à qui, quoi, pour quand
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check check (kind = any (array['creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait', 'relance', 'message']));
create or replace function public.on_req_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  insert into public.journal (item, author, kind, diff) values (new.item, new.asker, 'message', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', new.pour));
  return new;
end $$;
revoke execute on function public.on_req_message() from public, anon, authenticated;
drop trigger if exists reqs_message on public.reqs;
create trigger reqs_message after insert on public.reqs for each row execute function public.on_req_message();
-- la réponse garde qui avait demandé : la cloche du demandeur la montre
create or replace function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'asker', new.asker, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest, 'info', new.pour is null));
  end if;
  return new;
end $$;

-- 2. Rappels du matin : un message pour info ne compte pas comme une demande d'éléments
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
            where not p.visiteur
              and ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee' and q.dest <> 'moi' and q.pour is not null
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

-- 6. Un visiteur ne reçoit pas les messages d'un service, et ne répond pas
create or replace function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where not visiteur and ((p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
    or (p_dest = 'marketing' and marketing) or id::text = p_dest)
$$;
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (not public.is_visiteur() and (dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text))
  with check (not public.is_visiteur() and (dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text));

-- 5. Noter des résultats : seules les unités touchées changent, ce qu'un collègue vient de noter reste.
-- Mêmes droits qu'une modification de la fiche (la règle d'accès de items s'applique : security invoker).
create or replace function public.set_res(p_item uuid, p_pose jsonb, p_retire text[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  if jsonb_typeof(coalesce(p_pose, '{}'::jsonb)) <> 'object' then raise exception 'résultats illisibles' using errcode = '22023'; end if;
  update public.items set res = (coalesce(res, '{}'::jsonb) || coalesce(p_pose, '{}'::jsonb)) - coalesce(p_retire, '{}'::text[])
  where id = p_item returning res into r;
  if not found then raise exception 'tu n''as pas le droit de modifier cette fiche, ou elle a été supprimée' using errcode = '42501'; end if;
  return r;
end $$;
revoke execute on function public.set_res(uuid, jsonb, text[]) from public, anon;
grant execute on function public.set_res(uuid, jsonb, text[]) to authenticated;
insert into kplan_private.migrations (name) values ('0032_correctifs_2_6_1.sql') on conflict do nothing;
commit;
