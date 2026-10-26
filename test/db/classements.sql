-- Vérifie les classements (migration 0011).
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
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when check_violation or insufficient_privilege then return true; end $$;

-- Julien (chef) : le SIGEM, publié en septembre, KEDGE 10e, objectif top 7
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, flou, svc, rang, cible, cc) values ('c1a55e00-0000-0000-0000-0000000000a1', 'classement', 'SIGEM 2027', current_date + 60, 'Sept.', 'chef', 10, 7, '{rp}');
select pg_temp.admin();
select pg_temp.check((select rang = 10 and cible = 7 from public.items where id = 'c1a55e00-0000-0000-0000-0000000000a1'), 'un classement garde le rang et l''objectif');
select pg_temp.check(exists (select 1 from public.outbox where title = 'Nouveau classement' and url = '#item=c1a55e00-0000-0000-0000-0000000000a1'), 'les services cités sont prévenus d''un nouveau classement');

-- Aurélie (RP) : une action en relais du classement, mais pas de classement à elle
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.items (id, kind, t, date, svc, m, tf) values ('c1a55e00-0000-0000-0000-0000000000b1', 'action', 'Communiqué SIGEM', current_date + 61, 'rp', '{5}', 'c1a55e00-0000-0000-0000-0000000000a1');
select pg_temp.check((select tf from public.items where id = 'c1a55e00-0000-0000-0000-0000000000b1') = 'c1a55e00-0000-0000-0000-0000000000a1', 'une action peut relayer un classement');
select pg_temp.check(pg_temp.fails($$insert into public.items (kind, t, date, svc) values ('classement', 'FT', current_date + 5, 'rp')$$), 'un service ne saisit pas de classement');
select pg_temp.check(pg_temp.fails($$update public.items set rang = 9 where id = 'c1a55e00-0000-0000-0000-0000000000a1'$$)
  or (select rang from public.items where id = 'c1a55e00-0000-0000-0000-0000000000a1') = 10, 'un service ne change pas le rang');

-- Estelle (cheffe) : met le rang à jour à la publication ; un classement n'a ni message, ni rang hors bornes, ni dernier jour
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.items set rang = 8 where id = 'c1a55e00-0000-0000-0000-0000000000a1';
select pg_temp.check(pg_temp.fails($$insert into public.items (kind, t, date, svc, m) values ('classement', 'FT', current_date + 5, 'chef', '{5}')$$), 'un classement n''a pas de message');
select pg_temp.check(pg_temp.fails($$update public.items set rang = 0 where id = 'c1a55e00-0000-0000-0000-0000000000a1'$$), 'un rang commence à 1');
select pg_temp.check(pg_temp.fails($$update public.items set fin = date + 2 where id = 'c1a55e00-0000-0000-0000-0000000000a1'$$), 'un classement tient en un jour');
select pg_temp.check(pg_temp.fails($$update public.items set rang = 3 where id = 'c1a55e00-0000-0000-0000-0000000000b1'$$), 'une action n''a pas de rang');
select pg_temp.check(pg_temp.fails($$update public.items set tf = 'c1a55e00-0000-0000-0000-0000000000b1' where id = 'c1a55e00-0000-0000-0000-0000000000a1'$$), 'un classement n''est lié à rien');
update public.items set st = 'retire' where id = 'c1a55e00-0000-0000-0000-0000000000a1';
select pg_temp.admin();
select pg_temp.check((select diff -> 'rang' = '[10, 8]'::jsonb from public.journal where item = 'c1a55e00-0000-0000-0000-0000000000a1' and kind = 'modif' and diff ? 'rang'), 'l''historique note le nouveau rang');
select pg_temp.check(exists (select 1 from public.outbox where body like '% a retiré le classement.'), 'retirer un classement dit « le classement »');
delete from public.items where id in ('c1a55e00-0000-0000-0000-0000000000a1', 'c1a55e00-0000-0000-0000-0000000000b1');
