-- Vérifie les temps forts sur plusieurs jours (migration 0010).
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
begin execute q; return false; exception when check_violation then return true; end $$;

-- Julien (chef) : une semaine séminaire du lundi au vendredi
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, fin, svc) values ('f1000000-0000-0000-0000-0000000000a1', 'tf', 'Semaine séminaire', current_date + 30, current_date + 34, 'chef');
select pg_temp.check((select fin - date from public.items where id = 'f1000000-0000-0000-0000-0000000000a1') = 4, 'un temps fort garde son dernier jour');
select pg_temp.check(pg_temp.fails($$update public.items set fin = date where id = 'f1000000-0000-0000-0000-0000000000a1'$$), 'le dernier jour tombe après le premier');
select pg_temp.check(pg_temp.fails($$insert into public.items (kind, t, date, fin, svc, m) values ('action', 'Action', current_date + 3, current_date + 5, 'chef', '{1}')$$), 'une action n''a pas de dernier jour');
update public.items set fin = current_date + 35 where id = 'f1000000-0000-0000-0000-0000000000a1';
select pg_temp.admin();
select pg_temp.check((select diff ? 'fin' from public.journal where item = 'f1000000-0000-0000-0000-0000000000a1' and kind = 'modif' order by id desc limit 1), 'l''historique note le changement de dernier jour');
update public.items set fin = null where id = 'f1000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select fin is null from public.items where id = 'f1000000-0000-0000-0000-0000000000a1'), 'un temps fort redevient d''un jour');
