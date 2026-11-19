-- Base KEDGE, avant de publier la 2.2 : SQL Editor, New query, coller tout, Run.
-- 0027 (premier compte = pilote, sans effet chez toi) et 0028 (de 1 à 9 messages, étiquette Recrutement réglable).
begin;
-- 2.2.0 : une nouvelle copie de l'appli démarre sans aucun pilote. Le tout premier compte créé dans Supabase
-- (Authentication > Add user) devient donc pilote tout seul : il peut ensuite tout régler depuis l'appli.
-- Sur une base qui a déjà un pilote (celle de KEDGE), rien ne change.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_premier boolean := not exists (select 1 from public.profiles where chef);
begin
  insert into public.profiles (id, nom, visiteur, chef)
  values (new.id, initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '.', 1)),
    lower(coalesce(new.email, '')) = 'visiteur@example.com',
    v_premier and lower(coalesce(new.email, '')) <> 'visiteur@example.com')
  on conflict (id) do nothing;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0027_premier_pilote.sql') on conflict do nothing;
-- 2.2.0 : une autre équipe n'a pas forcément 5 messages clés. De 1 à 9 messages, réglés dans Réglages > Messages.
-- L'étiquette hors messages (« Recrutement » chez KEDGE, code 'REC' sur les fiches) devient la ligne n = 0 de la table :
-- son nom et sa précision se règlent aussi.
alter table public.messages add constraint messages_n_borne check (n between 0 and 9);
insert into public.messages (n, nom, info) values (0, 'Recrutement', 'JPO, admissibles : à couvrir, hors des messages clés') on conflict (n) do nothing;

-- une fiche ne cite que des messages qui existent (ou l'étiquette hors messages)
create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0) then
    raise exception 'un classement est saisi par un chef de projet' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ (array['REC'] || array(select n::text from public.messages where n > 0)) then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  return new;
end $$;

-- un message encore cité par des fiches ne se supprime pas ; l'étiquette hors messages non plus
create or replace function public.check_message_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.n = 0 then raise exception 'l''étiquette hors messages se renomme, elle ne se supprime pas' using errcode = '23514'; end if;
  if exists (select 1 from public.items where old.n::text = any (m)) then
    raise exception 'ce message est cité par des fiches : retire-le d''abord de ces fiches' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger messages_delete before delete on public.messages for each row execute function public.check_message_delete();
insert into kplan_private.migrations (name) values ('0028_messages_libres.sql') on conflict do nothing;
commit;
