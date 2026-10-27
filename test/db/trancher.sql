-- Vérifie le titre de la notification d'un sujet à trancher (migration 0015) ; un blocage garde le sien.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK %', label;
end $$;

select from pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('5a000000-0000-0000-0000-0000000000f1', 'action', 'CP rentrée', current_date + 20, 'rp', '{1}');
reset role;
delete from public.outbox;
-- Aurélie (RP) propose son action en réunion : les chefs sont prévenus
select from pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.blocks (item, why) values ('5a000000-0000-0000-0000-0000000000f1', 'à trancher en réunion');
reset role;
select from pg_temp.check((select count(*) from public.outbox) > 0 and not exists (select 1 from public.outbox where title <> 'Sujet à trancher'), 'titre « Sujet à trancher »');
select from pg_temp.check(exists (select 1 from public.outbox where body like '% met « CP rentrée » à l''ordre du jour de la réunion'), 'texte de la notification');
delete from public.outbox;
select from pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.blocks (item, why) values ('5a000000-0000-0000-0000-0000000000f1', 'rushs pas reçus');
reset role;
select from pg_temp.check(not exists (select 1 from public.outbox where title <> 'Blocage') and exists (select 1 from public.outbox), 'un blocage reste « Blocage »');
