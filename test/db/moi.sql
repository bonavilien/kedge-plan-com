-- Vérifie la demande à soi-même (migration 0013) : chefs seulement, personne d'autre n'est prévenu.
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


-- Julien se note le programme à fournir pour une action RP
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('40000000-0000-0000-0000-000000000001', 'action', 'Live portes ouvertes', current_date + 25, 'rp', '{1}');
reset role;
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.reqs (id, item, dest, type, pour) values ('40000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-000000000001', 'moi', 'Programme', current_date + 10);
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('40000000-0000-0000-0000-000000000001', 'moi', 'Programme', current_date + 11)$$, 'la même note deux fois');
reset role;
select pg_temp.check(not exists (select 1 from public.outbox), 'personne n''est prévenu');

-- Estelle (chef) peut se noter la même chose ; Aurélie (RP) ne peut pas
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into public.reqs (item, dest, type, pour) values ('40000000-0000-0000-0000-000000000001', 'moi', 'Programme', current_date + 10);
reset role;
select pg_temp.check((select count(*) from public.reqs where item = '40000000-0000-0000-0000-000000000001' and dest = 'moi') = 2, 'Estelle se note la même chose de son côté');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('40000000-0000-0000-0000-000000000001', 'moi', 'Contexte', current_date + 10)$$, 'un service se note une demande à lui-même');
reset role;

-- Julien la marque faite : pas de notification non plus
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.reqs set st = 'recue', reponse = 'Programme envoyé' where id = '40000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.check((select st = 'recue' and reponse = 'Programme envoyé' from public.reqs where id = '40000000-0000-0000-0000-0000000000b1'), 'Julien la marque faite');
select pg_temp.check(not exists (select 1 from public.outbox), 'toujours personne de prévenu');
select pg_temp.expect_fail($$insert into public.services (k, nom, court, ordre) values ('moi', 'Moi', 'Moi', 9)$$, 'un service nommé « moi »');
