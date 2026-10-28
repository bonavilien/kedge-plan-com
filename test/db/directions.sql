-- Vérifie les demandes à la Direction marketing et au Recrutement (migration 0018) : chefs seulement, personne n'est prévenu.
\set ON_ERROR_STOP on
set client_min_messages = warning;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
create function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK refusé : %', label; return; end;
  raise exception 'ATTENDU REFUSÉ : %', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('48000000-0000-0000-0000-000000000001', 'action', 'Campagne recrutement', current_date + 25, 'rp', '{1}');
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.reqs (id, item, dest, type, pour) values ('48000000-0000-0000-0000-0000000000b1', '48000000-0000-0000-0000-000000000001', 'marketing', 'Visuels', current_date + 10);
insert into public.reqs (id, item, dest, type, pour) values ('48000000-0000-0000-0000-0000000000b2', '48000000-0000-0000-0000-000000000001', 'recrutement', 'Contexte', current_date + 10);
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox), 'marketing et recrutement : personne n''est prévenu');
-- un autre chef la marque reçue
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.reqs set st = 'recue' where id = '48000000-0000-0000-0000-0000000000b1';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '48000000-0000-0000-0000-0000000000b1') = 'recue', 'Estelle (chef) la marque reçue');
-- un service ne peut pas
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('48000000-0000-0000-0000-000000000001', 'marketing', 'Programme', current_date + 10)$$, 'un service note une demande à la Direction marketing');
select pg_temp.admin();
select pg_temp.expect_fail($$insert into public.services (k, nom, court, ordre) values ('recrutement', 'Recrutement', 'Recrut.', 9)$$, 'un service nommé « recrutement »');
delete from public.reqs where item = '48000000-0000-0000-0000-000000000001';
delete from public.items where id = '48000000-0000-0000-0000-000000000001';
