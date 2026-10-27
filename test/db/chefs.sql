-- Vérifie la demande à un chef nommé (migration 0014) : lui seul est prévenu, il y répond.
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

-- Aurélie (RP) demande le planning à Julien seulement
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.items (id, kind, t, date, svc, m) values ('50000000-0000-0000-0000-000000000001', 'action', 'Interview directeur', current_date + 25, 'rp', '{1}');
reset role;
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.reqs (id, item, dest, type, pour) values ('50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Contexte', current_date + 10);
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Contexte', current_date + 12)$$, 'la même demande deux fois à Julien');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Contexte', current_date + 12)$$, 'une demande à une personne qui n''est pas chef');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Visuel', current_date + 12)$$, 'une demande à soi-même par son identifiant');
reset role;
select pg_temp.check((select array_agg(user_id) from public.outbox) = array['00000000-0000-0000-0000-000000000001'::uuid], 'seul Julien est prévenu');

-- Estelle (chef) peut demander à Julien ; Julien ne se demande pas à lui-même par son identifiant (il a « Moi »)
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into public.reqs (item, dest, type, pour) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Visuel', current_date + 10);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Programme', current_date + 10)$$, 'Julien se demande à lui-même par son identifiant');
reset role;

-- Stéphane (RS) n'y répond pas à la place de Julien ; Julien répond, Aurélie est prévenue
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.reqs set st = 'recue', reponse = 'pas moi' where id = '50000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.check((select st from public.reqs where id = '50000000-0000-0000-0000-0000000000b1') = 'ouverte', 'un autre service ne répond pas à la place de Julien');
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.reqs set st = 'recue', reponse = 'Contexte dans le dossier' where id = '50000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.check((select st = 'recue' and repondu_par = '00000000-0000-0000-0000-000000000001' from public.reqs where id = '50000000-0000-0000-0000-0000000000b1'), 'Julien y répond');
select pg_temp.check((select array_agg(user_id) from public.outbox) = array['00000000-0000-0000-0000-000000000003'::uuid], 'Aurélie est prévenue de la réponse');
