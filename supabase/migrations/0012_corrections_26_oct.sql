-- Corrections après la campagne de tests du 26 octobre 2026, et demandes à la « Resp. offre ».

-- =====================================================================
-- La responsable de l'offre (Estelle) reçoit des demandes d'éléments, comme un service (dest 'offre').
-- Un chef coche « Resp. offre » dans Équipe ; un profil dont la fonction est « Responsable de l'offre » l'est d'office.
-- =====================================================================
alter table public.profiles add column offre boolean not null default false;
update public.profiles set offre = true where fonction ilike 'responsable de l%offre%' and not visiteur;
alter table public.services add constraint services_pas_offre check (k <> 'offre');

create function public.is_offre() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select offre from public.profiles where id = auth.uid()), false)
$$;

-- elle répond aux demandes qui lui sont faites
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()))
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()));

-- un visiteur ne reçoit rien
create or replace function public.keep_visiteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visiteur then new.svc := null; new.chef := false; new.media := false; new.notif_all := false; new.offre := false; end if;
  return new;
end $$;

-- destinataires d'une demande : un service, les chefs, la responsable de l'offre (la Direction du Programme : personne)
create function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where (p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
$$;
revoke execute on function public.req_dests(text) from public, anon, authenticated;

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest not in ('chef', 'programme', 'offre') and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from auth.uid()),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || new.type
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || old.pour || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- =====================================================================
-- Une demande garde son destinataire : le changer après coup contournait la règle « Direction du Programme : chefs
-- seulement », et le service d'arrivée n'était jamais prévenu. Pour demander à quelqu'un d'autre, on retire et on redemande.
-- Exceptions : un service renommé (0004), une fiche supprimée qui confie ses demandes à son temps fort (kplan.transfert, plus bas).
-- =====================================================================
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  -- un service renommé (son code change) et une fiche supprimée qui confie ses demandes : seuls cas où dest ou item bougent
  if coalesce(current_setting('kplan.transfert', true), '') = '1' or coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at; new.dest := old.dest;
  if coalesce(current_setting('kplan.retrait', true), '') = '1' then
    new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
    return new;
  end if;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
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
  if new.type is distinct from old.type and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- =====================================================================
-- Supprimer une fiche ne fait plus perdre ce qui sert encore ailleurs :
-- - un relais d'un temps fort encore actif : ses demandes (ouvertes ou reçues) passent sur le temps fort ;
-- - un temps fort : les documents envoyés en réponse aux demandes de ses relais restent, sur ces relais.
-- =====================================================================
create function public.on_item_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tf is not null and exists (select 1 from public.items t where t.id = old.tf and t.st <> 'retire') then
    perform set_config('kplan.transfert', '1', true);
    update public.reqs set item = old.tf where item = old.id and st <> 'annulee';
    perform set_config('kplan.transfert', '', true);
  end if;
  update public.links l set item = q.item from public.reqs q where l.item = old.id and l.req = q.id and q.item <> old.id;
  return old;
end $$;
create trigger items_delete before delete on public.items for each row execute function public.on_item_delete();
revoke execute on function public.on_item_delete() from public, anon, authenticated;

-- =====================================================================
-- Un dernier jour seulement pour un temps fort daté au jour près (ni sujet, ni date connue au mois)
-- =====================================================================
update public.items set fin = null
  where fin is not null and not (kind = 'tf' and fin > date and coalesce(cardinality(per), 0) = 0 and (flou = '' or flou ~ '^\d'));
alter table public.items drop constraint items_fin;
alter table public.items add constraint items_fin check (
  fin is null or (kind = 'tf' and fin > date and coalesce(cardinality(per), 0) = 0 and (flou = '' or flou ~ '^\d')));
