-- Vérifie la migration 0034 (2.7, la photo de profil) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/photo.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); execute 'set local role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
create function pg_temp.refus(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK refusé : %', label; return; end;
  raise exception 'ATTENDU REFUSÉ : %', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
\set PIL '''27000000-0000-0000-0000-000000000001'''
\set RP '''27000000-0000-0000-0000-000000000002'''
\set RS '''27000000-0000-0000-0000-000000000003'''
insert into auth.users (id, email) values (:PIL, 'p.27@example.com'), (:RP, 'rp.27@example.com'), (:RS, 'rs.27@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true where id = :PIL;
update public.profiles set nom = 'Aurelie', svc = 'rp' where id = :RP;
update public.profiles set nom = 'Stephane', svc = 'rs' where id = :RS;

select pg_temp.check((select count(*) = 1 from kplan_private.migrations where name = '0034_photo_profil.sql'), 'installation.sql note 0034 comme fait');

-- Aurélie (service RP, pas chef) met sa propre photo, puis la retire
select pg_temp.as_user(:RP);
update public.profiles set photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==' where id = :RP;
select pg_temp.check((select photo like 'data:image/jpeg;base64,%' from public.profiles where id = :RP), 'chacun met sa propre photo');
select pg_temp.check((select count(*) = 3 from public.profiles where id in (:PIL, :RP, :RS)), 'tout le monde voit les profils (et donc les photos)');
-- elle ne touche pas à celle de Stéphane
update public.profiles set photo = 'data:image/jpeg;base64,AAAA' where id = :RS;
select pg_temp.admin();
select pg_temp.check((select photo is null from public.profiles where id = :RS), 'pas la photo d''un collègue');
-- formats refusés par la base
select pg_temp.as_user(:RP);
select pg_temp.refus($q$update public.profiles set photo = 'https://exemple.fr/moi.jpg' where id = '27000000-0000-0000-0000-000000000002'$q$, 'un lien au lieu d''une image');
select pg_temp.refus($q$update public.profiles set photo = 'data:image/svg+xml;base64,PHN2Zz4=' where id = '27000000-0000-0000-0000-000000000002'$q$, 'une image SVG');
select pg_temp.refus($q$update public.profiles set photo = 'data:image/jpeg;base64,AA"onerror="x' where id = '27000000-0000-0000-0000-000000000002'$q$, 'du texte glissé dans la photo');
select pg_temp.refus($q$update public.profiles set photo = 'data:image/jpeg;base64,' || repeat('A', 60001) where id = '27000000-0000-0000-0000-000000000002'$q$, 'une photo trop lourde');
update public.profiles set photo = null where id = :RP;
select pg_temp.admin();
select pg_temp.check((select photo is null from public.profiles where id = :RP), 'retirer sa photo');
-- ses droits restent intouchables, même avec une photo dans la même modification
select pg_temp.as_user(:RP);
select pg_temp.refus($q$update public.profiles set photo = 'data:image/jpeg;base64,AAAA', chef = true where id = '27000000-0000-0000-0000-000000000002'$q$, 'une photo ne fait pas passer chef');
-- un chef de projet peut corriger la photo de quelqu'un
select pg_temp.as_user(:PIL);
update public.profiles set photo = 'data:image/jpeg;base64,BBBB' where id = :RS;
select pg_temp.admin();
select pg_temp.check((select photo = 'data:image/jpeg;base64,BBBB' from public.profiles where id = :RS), 'un chef corrige la photo d''un collègue');
select 'photo de profil : bon' as resultat;
rollback;
