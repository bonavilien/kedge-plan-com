-- Vérifie la migration 0026 (2.0.2) sur une base où les migrations sont passées (sh test/v2/base.sh). Tout est annulé à la fin.
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); execute 'set local role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
grant execute on all functions in schema pg_temp to authenticated;
\set PIL '''22000000-0000-0000-0000-000000000001'''
\set RP '''22000000-0000-0000-0000-000000000002'''
\set RS '''22000000-0000-0000-0000-000000000003'''
\set TF '''22100000-0000-0000-0000-000000000001'''
insert into auth.users (id, email) values (:PIL, 'pilote.v2@example.com'), (:RP, 'rp.v2@example.com'), (:RS, 'rs.v2@example.com') on conflict do nothing;
update public.profiles set nom = 'Pilote', chef = true where id = :PIL;
update public.profiles set nom = 'Presse', svc = 'rp' where id = :RP;
update public.profiles set nom = 'Reseaux', svc = 'rs' where id = :RS;

select pg_temp.as_user(:PIL);
insert into public.items (id, kind, t, date, svc, m) values (:TF, 'tf', 'Gala test', current_date + 20, 'chef', '{2}');

-- un rappel pour soi de Presse, et une demande de Presse à Réseaux
select pg_temp.as_user(:RP);
insert into public.reqs (id, item, dest, type, quoi, pour) values ('22900000-0000-0000-0000-000000000001', :TF, 'moi', 'Autre', 'appeler le photographe', current_date + 3);
insert into public.reqs (id, item, dest, type, quoi, pour) values ('22900000-0000-0000-0000-000000000002', :TF, 'rs', 'Visuels', '', current_date + 5);
-- l'auteur modifie son rappel (texte et date)
update public.reqs set quoi = 'appeler la photographe', pour = current_date + 4 where id = '22900000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select quoi || pour from public.reqs where id = '22900000-0000-0000-0000-000000000001') = 'appeler la photographe' || (current_date + 4), 'l''auteur modifie le texte et la date de son rappel');
select pg_temp.check(not exists (select 1 from public.journal where diff->>'dest' = 'moi'), 'modifier un rappel ne laisse aucune trace dans l''historique');

-- un pilote, même par une requête sans filtre, ne touche pas au rappel d'un autre
select pg_temp.as_user(:PIL);
update public.reqs set pour = current_date + 30, quoi = 'piraté' where item = :TF;
select pg_temp.admin();
select pg_temp.check((select quoi from public.reqs where id = '22900000-0000-0000-0000-000000000001') = 'appeler la photographe', 'un pilote ne modifie pas le rappel d''un autre');

-- cocher son rappel : pas de « a répondu » visible des autres
select pg_temp.as_user(:RP);
update public.reqs set st = 'recue', reponse = 'Fait' where id = '22900000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.journal where diff->>'dest' = 'moi'), 'cocher un rappel ne laisse aucune trace');

-- relancer : seul le demandeur ; Réseaux est prévenu ; une seule fois par jour
select pg_temp.as_user(:RS);
do $$ begin perform public.relancer('22900000-0000-0000-0000-000000000002'); raise exception 'ATTENDU REFUSÉ'; exception when insufficient_privilege then raise notice 'OK refusé : un autre ne relance pas'; end $$;
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user(:RP);
select public.relancer('22900000-0000-0000-0000-000000000002');
select public.relancer('22900000-0000-0000-0000-000000000002');
select pg_temp.admin();
select pg_temp.check((select count(*) from public.outbox where user_id = '22000000-0000-0000-0000-000000000003') = 1, 'Réseaux reçoit une relance, une seule par jour');
select pg_temp.check(exists (select 1 from public.journal where kind = 'relance' and item = '22100000-0000-0000-0000-000000000001'), 'la relance reste dans l''historique de la fiche');

-- annuler la fiche : la demande est annulée, un rappel pour soi ouvert reste ouvert
select pg_temp.as_user(:RP);
insert into public.reqs (id, item, dest, type, quoi, pour) values ('22900000-0000-0000-0000-000000000003', :TF, 'moi', 'Autre', 'autre rappel', current_date + 2);
select pg_temp.as_user(:PIL);
update public.items set st = 'retire' where id = :TF;
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '22900000-0000-0000-0000-000000000003') = 'ouverte', 'annuler la fiche garde les rappels pour soi');
select pg_temp.check((select st from public.reqs where id = '22900000-0000-0000-0000-000000000002') = 'annulee', 'annuler la fiche annule les demandes');

-- supprimer le compte qui a annulé : accepté, le motif reste
delete from auth.users where id = '22000000-0000-0000-0000-000000000001';
select pg_temp.check((select annule_par is null and st = 'retire' from public.items where id = :TF), 'on supprime un compte qui a annulé une fiche');
rollback;
\echo 'migration 0026 : tout est bon'
