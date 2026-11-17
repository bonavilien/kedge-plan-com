-- 2.0.2 : corrections de la campagne de tests du 17 novembre.
-- Le « Rappel pour moi » reste vraiment privé, une demande se relance pour de vrai,
-- et un compte qui a reporté ou annulé une fiche peut être supprimé.

-- 1. Personne d'autre que son auteur ne modifie un rappel pour soi, même un pilote, même par une requête sans filtre
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using ((dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text))
  with check ((dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text));

-- 2. Un rappel pour soi ne laisse aucune trace dans l'historique (que tout le monde lit)
create or replace function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest));
  end if;
  return new;
end $$;

create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.dest = 'moi' then return new; end if;
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || old.pour || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- les traces déjà laissées par des rappels pour soi
delete from public.journal where diff->>'dest' = 'moi';

-- 3. Annuler une fiche n'efface pas les rappels pour soi : leur auteur décide
create or replace function public.on_item_retire_reqs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'retire' and old.st <> 'retire'
     and not (new.tf is not null and exists (select 1 from public.items t where t.id = new.tf and t.st <> 'retire')) then
    perform set_config('kplan.retrait', '1', true);
    update public.reqs set st = 'annulee' where item = new.id and st = 'ouverte' and dest <> 'moi';
    perform set_config('kplan.retrait', '', true);
  end if;
  return new;
end $$;

-- 4. Un rappel pour soi ne coupe pas les rappels J-30 / J-15 / J-7 du service
CREATE OR REPLACE FUNCTION public.queue_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  return n;
end $function$;

-- 5. Les rappels pour soi ne comptent pas dans la limite de 10 demandes en 10 minutes
CREATE OR REPLACE FUNCTION public.check_req()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $function$;

-- 6. Supprimer un compte qui a reporté ou annulé une fiche : la base remet « par qui » à vide au lieu de refuser
create or replace function public.keep_motifs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.report_de := ''; new.report_motif := ''; new.report_par := null; new.report_at := null;
    new.annule_par := case when new.st = 'retire' then auth.uid() end;
    new.annule_at := case when new.st = 'retire' then now() end;
    if new.st <> 'retire' then new.annule_motif := ''; end if;
    return new;
  end if;
  if new.report_motif is distinct from old.report_motif or new.report_de is distinct from old.report_de then
    if new.report_motif = '' and new.report_de = '' then
      new.report_par := null; new.report_at := null;
    elsif new.date is distinct from old.date or new.flou is distinct from old.flou then
      new.report_par := auth.uid(); new.report_at := now();
    else
      raise exception 'un report change la date' using errcode = '23514';
    end if;
  else
    new.report_par := old.report_par; new.report_at := old.report_at;
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    new.annule_par := auth.uid(); new.annule_at := now();
  elsif new.st <> 'retire' then
    new.annule_motif := ''; new.annule_par := null; new.annule_at := null;
  else
    new.annule_par := old.annule_par; new.annule_at := old.annule_at;
  end if;
  -- le compte n'existe plus (il vient d'être supprimé) : on garde le motif, sans le nom
  if new.report_par is not null and not exists (select 1 from public.profiles where id = new.report_par) then new.report_par := null; end if;
  if new.annule_par is not null and not exists (select 1 from public.profiles where id = new.annule_par) then new.annule_par := null; end if;
  return new;
end $$;
revoke execute on function public.keep_motifs() from public, anon, authenticated;

-- 7. Relancer une demande : seule la personne qui l'a faite, une fois par jour ; le destinataire est prévenu
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check check (kind = any (array['creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait', 'relance']));
create or replace function public.relancer(p_req uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reqs; titre text;
begin
  select * into r from public.reqs where id = p_req;
  if r.id is null or r.asker is distinct from auth.uid() then raise exception 'seule la personne qui a demandé relance' using errcode = '42501'; end if;
  if r.st <> 'ouverte' or r.dest = 'moi' then raise exception 'cette demande n''attend plus de réponse' using errcode = '22023'; end if;
  titre := (select t from public.items where id = r.item);
  perform public.notify(
    array(select id from public.req_dests(r.dest) as id where id is distinct from auth.uid()),
    'Demande d''éléments', 'Relance de ' || public.nom_de(auth.uid()) || ' : ' || r.type || ' pour « ' || titre || ' »', '#item=' || r.item,
    'relance:' || r.id || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (r.item, 'relance', jsonb_build_object('type', r.type, 'dest', r.dest));
end $$;
revoke execute on function public.relancer(uuid) from public, anon;
grant execute on function public.relancer(uuid) to authenticated;

-- 8. Un prénom et une fonction de taille raisonnable (les comptes existants ne sont pas vérifiés)
alter table public.profiles add constraint profiles_nom_court check (char_length(coalesce(nom, '')) <= 60) not valid;
alter table public.profiles add constraint profiles_fonction_courte check (char_length(coalesce(fonction, '')) <= 120) not valid;

-- 9. Qui est prévenu à la création (décision de Julien, 17 novembre) :
--    un temps fort, un sujet ou un classement prévient tous les services et les pilotes ;
--    une action ne prévient que son service (et qui a coché « à chaque nouvelle fiche ») : elle se lit sous son temps fort.
create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'classement' then 'Nouveau classement'
                    when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and not visiteur and (
      notif_all
      or (new.kind in ('tf', 'classement') and (svc is not null or chef))
      or (new.kind = 'action' and new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

-- 10. « Prévenir » : sur une action, l'auteur alerte un service précis (une fois par jour et par service)
create or replace function public.prevenir(p_item uuid, p_svc text) returns void
language plpgsql security definer set search_path = public as $$
declare titre text;
begin
  if auth.uid() is null or public.is_visiteur() then raise exception 'le compte visiteur ne prévient pas' using errcode = '42501'; end if;
  titre := (select t from public.items where id = p_item);
  if titre is null then raise exception 'fiche introuvable' using errcode = '23503'; end if;
  if not exists (select 1 from public.services where k = p_svc) and p_svc <> 'chef' then raise exception 'service inconnu' using errcode = '23503'; end if;
  perform public.notify(
    array(select id from public.req_dests(p_svc) as id where id is distinct from auth.uid()),
    'Pour info', public.nom_de(auth.uid()) || ' te signale « ' || titre || ' »', '#item=' || p_item,
    'prevenir:' || p_item || ':' || p_svc || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (p_item, 'prevenu', jsonb_build_object('svc', p_svc));
end $$;
revoke execute on function public.prevenir(uuid, text) from public, anon;
grant execute on function public.prevenir(uuid, text) to authenticated;
