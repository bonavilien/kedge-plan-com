-- Vérifie la demande à la Direction du Programme (migration 0009) : notée par un chef pour lui-même, personne n'est notifié.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK %', label;
end $$;
create function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'OK refusé : %', label;
    return;
  end;
  raise exception 'ATTENDU REFUSÉ : %', label;
end $$;

-- comptes de services.sql : c1 Julien (chef), c2 Estelle (chef depuis suppression.sql), c3 Aurélie (RP)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc, m) values ('5c000000-0000-0000-0000-000000000001', 'action', 'Webinar PGE', current_date + 20, 'chef', '{1}');
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.reqs (id, item, dest, type, pour) values ('5c000000-0000-0000-0000-0000000000f1', '5c000000-0000-0000-0000-000000000001', 'programme', 'Programme', current_date + 10);
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox), 'Julien note une demande à la Direction du Programme : personne n''est notifié');
-- un service ne peut pas
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('5c000000-0000-0000-0000-000000000001', 'programme', 'Contexte', current_date + 10)$$, 'Aurélie (RP) note une demande à la Direction du Programme');
-- Julien la marque reçue : pas de notification non plus
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
update public.reqs set st = 'recue', reponse = 'Programme validé' where id = '5c000000-0000-0000-0000-0000000000f1';
select pg_temp.admin();
select pg_temp.check((select st = 'recue' and reponse = 'Programme validé' from public.reqs where id = '5c000000-0000-0000-0000-0000000000f1') and not exists (select 1 from public.outbox),
  'Julien la marque reçue, sans notification');
-- un service ne peut pas s'appeler « programme »
select pg_temp.expect_fail($$insert into public.services (k, nom, court) values ('programme', 'X', 'X')$$, 'service nommé « programme »');
