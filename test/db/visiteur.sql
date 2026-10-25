-- Vérifie le compte visiteur (migration 0005) : il lit tout, n'écrit rien, et ne garde aucun droit.
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

-- le compte visiteur@example.com, créé dans Supabase, est visiteur d'office
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'visiteur@example.com');
select pg_temp.check((select visiteur and nom = 'Visiteur' from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'visiteur@example.com : visiteur dès sa création');

-- un chef peut aussi passer un autre compte en visiteur dans Équipe : il perd service et droits
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'invite@kedgebs.com');
update public.profiles set svc = 'rp', notif_all = true where id = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-0000000000f2';
reset role;
select pg_temp.check((select visiteur and svc is null and not notif_all and not chef and not media from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'),
  'passé en visiteur par Estelle : plus de service ni de droit');

-- il lit tout
create temp table avant as select id, st from public.reqs;
grant select on avant to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select count(*) from public.items) > 0 and (select count(*) from public.reqs) > 0 and (select count(*) from public.profiles) > 0, 'le visiteur lit les fiches, les demandes et l''équipe');
select pg_temp.check(not public.is_chef() and not public.is_media() and public.my_svc() is null and public.is_visiteur(), 'aucun droit');
-- il n'écrit rien
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc) values ('action', 'Visite', current_date + 10, 'rp')$$, 'visiteur publie une action');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc) values ('tf', 'Visite', current_date + 10, 'chef')$$, 'visiteur publie un temps fort');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ((select id from public.items limit 1), 'rp', 'Visuels', current_date + 5)$$, 'visiteur demande des éléments');
select pg_temp.expect_fail($$insert into public.blocks (item, why) values ((select id from public.items limit 1), 'visite')$$, 'visiteur signale un blocage');
select pg_temp.expect_fail($$insert into public.links (item, nom, url) values ((select id from public.items limit 1), 'Doc', 'https://kedgebs.sharepoint.com/x')$$, 'visiteur ajoute un document');
select pg_temp.expect_fail($$select public.renotify((select id from public.items limit 1), 'visite')$$, 'visiteur relance');
update public.items set t = 'Piraté';
update public.profiles set nom = 'Piraté';
update public.reqs set st = 'recue';
reset role;
select pg_temp.check(not exists (select 1 from public.items where t = 'Piraté') and not exists (select 1 from public.profiles where nom = 'Piraté')
  and not exists (select 1 from public.reqs r join avant a using (id) where r.st <> a.st), 'rien de modifié');

-- un droit coché par erreur ne lui est jamais donné ; seul un chef le rend ordinaire
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.profiles set notif_all = true, chef = true, svc = 'rs' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select pg_temp.check((select visiteur and svc is null and not notif_all and not chef from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'un droit coché pour le visiteur est retiré');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.profiles set visiteur = false where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select pg_temp.check((select visiteur from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'le visiteur ne sort pas lui-même du mode visiteur');

-- un compte sans service garde le droit de demander des éléments
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
insert into public.reqs (item, dest, type, pour) values ((select id from public.items where kind = 'action' limit 1), 'chef', 'Autre', current_date + 5);
reset role;
select pg_temp.check(exists (select 1 from public.reqs where asker = '00000000-0000-0000-0000-000000000005' and type = 'Autre'), 'un compte sans service demande toujours');
