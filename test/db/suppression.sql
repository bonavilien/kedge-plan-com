-- Vérifie la suppression d'une fiche retirée (migration 0008).
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
create function pg_temp.gone(q text) returns boolean language plpgsql as $$
declare n int;
begin execute q; get diagnostics n = row_count; return n = 0; end $$;

-- les comptes de services.sql : c1 Julien (chef, média), c2 Estelle (redevenue visiteur), c3 Aurélie (RP), c5 Stéphane (RS)
-- Aurélie : une action RP avec document, demande et blocage
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m) values ('5d000000-0000-0000-0000-000000000001', 'action', 'Interview à supprimer', current_date + 20, 'rp', '{1}');
insert into public.links (item, nom, url) values ('5d000000-0000-0000-0000-000000000001', 'Doc', 'https://kedgebs.sharepoint.com/d');
insert into public.reqs (item, dest, type, pour) values ('5d000000-0000-0000-0000-000000000001', 'rs', 'Visuels', current_date + 10);
insert into public.blocks (item, why) values ('5d000000-0000-0000-0000-000000000001', 'en attente');
-- pas retirée : elle ne se supprime pas
select pg_temp.check(pg_temp.gone($$delete from public.items where id = '5d000000-0000-0000-0000-000000000001'$$), 'une fiche pas retirée ne se supprime pas');
update public.items set st = 'retire' where id = '5d000000-0000-0000-0000-000000000001';
-- RS ne supprime pas l'action RP
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
select pg_temp.check(pg_temp.gone($$delete from public.items where id = '5d000000-0000-0000-0000-000000000001'$$), 'Stéphane (RS) ne supprime pas une action RP');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(not pg_temp.gone($$delete from public.items where id = '5d000000-0000-0000-0000-000000000001'$$), 'Aurélie supprime son action retirée');
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.links where item = '5d000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.reqs where item = '5d000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.blocks where item = '5d000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.journal where item = '5d000000-0000-0000-0000-000000000001'), 'documents, demandes, blocages et historique partent avec elle');

-- un temps fort retiré supprimé par un chef : ses relais restent, sans temps fort
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc) values ('5d000000-0000-0000-0000-000000000002', 'tf', 'TF à supprimer', current_date + 30, 'chef');
insert into public.items (id, kind, t, date, svc, m, tf) values ('5d000000-0000-0000-0000-000000000003', 'action', 'Relais gardé', current_date + 25, 'rp', '{1}', '5d000000-0000-0000-0000-000000000002');
update public.items set st = 'retire' where id = '5d000000-0000-0000-0000-000000000002';
select pg_temp.check(not pg_temp.gone($$delete from public.items where id = '5d000000-0000-0000-0000-000000000002'$$), 'Julien supprime le temps fort retiré');
select pg_temp.admin();
select pg_temp.check((select tf is null and st = 'planifie' from public.items where id = '5d000000-0000-0000-0000-000000000003'), 'son relais reste, sans temps fort');

-- un partenariat retiré : seul un compte média le supprime
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc, m, partner, st) values ('5d000000-0000-0000-0000-000000000004', 'action', 'Pub retirée', current_date + 25, 'chef', '{1}', 'major', 'retire');
select pg_temp.admin();
update public.profiles set chef = true, visiteur = false where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(pg_temp.gone($$delete from public.items where id = '5d000000-0000-0000-0000-000000000004'$$), 'Estelle (chef, pas média) ne supprime pas un partenariat');
select pg_temp.admin();
