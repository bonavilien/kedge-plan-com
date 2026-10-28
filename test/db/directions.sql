-- Vérifie les demandes à la Direction marketing et recrutement (migration 0018) : comme la Resp. offre, les profils cochés reçoivent et répondent.
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
insert into public.items (id, kind, t, date, svc, m) values ('48000000-0000-0000-0000-000000000001', 'action', 'Campagne recrutement', current_date + 25, 'rs', '{1}');
select pg_temp.admin();
-- Julien coche Aurélie « Dir. marketing et recrutement »
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.profiles set marketing = true where id = '00000000-0000-0000-0000-000000000003';
select pg_temp.admin();
delete from public.outbox;
-- Stéphane (RS) lui demande des visuels
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.reqs (id, item, dest, type, pour) values ('48000000-0000-0000-0000-0000000000b1', '48000000-0000-0000-0000-000000000001', 'marketing', 'Visuels', current_date + 10);
select pg_temp.admin();
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id) = '{Aurelie}', 'seule la personne cochée est prévenue');
-- Hugo (RP, pas coché) ne peut pas y répondre ; Aurélie oui
select pg_temp.as_user('00000000-0000-0000-0000-000000000006');
update public.reqs set st = 'recue' where id = '48000000-0000-0000-0000-0000000000b1';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '48000000-0000-0000-0000-0000000000b1') = 'ouverte', 'une personne non cochée ne répond pas');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
update public.reqs set st = 'recue', reponse = 'Visuels dans le dossier' where id = '48000000-0000-0000-0000-0000000000b1';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '48000000-0000-0000-0000-0000000000b1') = 'recue', 'Aurélie (cochée) répond');
select pg_temp.expect_fail($$insert into public.services (k, nom, court, ordre) values ('marketing', 'Marketing', 'Mkt', 9)$$, 'un service nommé « marketing »');
update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-000000000003';
select pg_temp.check(not (select marketing from public.profiles where id = '00000000-0000-0000-0000-000000000003'), 'un visiteur perd la case');
update public.profiles set visiteur = false, svc = 'rp' where id = '00000000-0000-0000-0000-000000000003';
delete from public.reqs where item = '48000000-0000-0000-0000-000000000001';
delete from public.items where id = '48000000-0000-0000-0000-000000000001';
