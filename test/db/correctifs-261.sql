-- Vérifie la migration 0032 (2.6.1, corrections de la campagne de tests du 20 novembre) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/correctifs-261.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;
set timezone to 'Europe/Paris';
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
\set PIL '''26100000-0000-0000-0000-000000000001'''
\set RP '''26100000-0000-0000-0000-000000000002'''
\set RS '''26100000-0000-0000-0000-000000000003'''
\set VIS '''26100000-0000-0000-0000-000000000004'''
\set IT '''26110000-0000-0000-0000-000000000001'''
\set IT2 '''26110000-0000-0000-0000-000000000002'''
insert into auth.users (id, email) values (:PIL, 'p.261@example.com'), (:RP, 'rp.261@example.com'), (:RS, 'rs.261@example.com'), (:VIS, 'v.261@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true where id = :PIL;
update public.profiles set nom = 'Aurelie', svc = 'rp' where id = :RP;
update public.profiles set nom = 'Stephane', svc = 'rs' where id = :RS;
update public.profiles set nom = 'Ancien RS', svc = 'rs', visiteur = true where id = :VIS;

select pg_temp.as_user(:PIL);
insert into public.items (id, kind, t, date, svc, m) values (:IT, 'action', 'Teaser 261', current_date + 7, 'rs', '{2}');
insert into public.items (id, kind, t, date, svc, m, st) values (:IT2, 'action', 'Brève 261', current_date - 3, 'rp', '{3}', 'diffuse');
select pg_temp.admin();
delete from public.outbox;

-- 1. le même pour info peut être réécrit ; une demande datée identique reste refusée
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'Le teaser est en ligne', null);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'Le teaser est en ligne', null);
select pg_temp.check((select count(*) from public.reqs where item = :IT and quoi = 'Le teaser est en ligne') = 2, 'le même pour info, deux fois');
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Visuels', 'Les visuels HD', current_date + 2);
select pg_temp.refus($$insert into public.reqs (item, dest, type, quoi, pour) values ('26110000-0000-0000-0000-000000000001', 'rp', 'Visuels', 'Les visuels HD', current_date + 3)$$, 'la même demande datée deux fois');

-- 4. chaque message entre dans l'historique, sans son texte ; pas un rappel pour soi
select pg_temp.admin();
select pg_temp.check((select count(*) from public.journal where item = :IT and kind = 'message') = 3, 'trois messages dans l''historique');
select pg_temp.check(not exists (select 1 from public.journal where item = :IT and kind = 'message' and diff::text like '%Teaser est en ligne%'), 'l''historique ne garde pas le texte');
select pg_temp.check((select diff ->> 'dest' from public.journal where item = :IT and kind = 'message' order by id limit 1) = 'rp', 'l''historique garde à qui');
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'moi', 'Autre', 'Relancer le photographe', current_date + 1);
select pg_temp.admin();
select pg_temp.check((select count(*) from public.journal where item = :IT and kind = 'message') = 3, 'un rappel pour soi n''entre pas dans l''historique');

-- 3. on ne répond pas à un pour info ; le retirer ne prévient personne
select pg_temp.as_user(:RP);
select pg_temp.refus($$update public.reqs set st = 'recue', reponse = 'ok' where quoi = 'Le teaser est en ligne'$$, 'répondre à un pour info');
select pg_temp.admin(); delete from public.outbox;
select pg_temp.as_user(:PIL);
update public.reqs set st = 'annulee' where quoi = 'Le teaser est en ligne';
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox where title = 'Demande retirée'), 'retirer un pour info : pas de « Demande retirée »');
select pg_temp.as_user(:PIL);
update public.reqs set st = 'annulee' where quoi = 'Les visuels HD';
select pg_temp.admin();
select pg_temp.check(exists (select 1 from public.outbox where title = 'Demande retirée' and user_id = :RP), 'retirer une demande datée : prévenu');
-- la réponse garde qui avait demandé (pour la cloche du demandeur)
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Programme', 'Le programme', current_date + 2);
select pg_temp.as_user(:RP);
update public.reqs set st = 'recue', reponse = 'Voilà' where quoi = 'Le programme';
select pg_temp.admin();
select pg_temp.check((select diff ->> 'asker' from public.journal where item = :IT and kind = 'reponse' order by id desc limit 1) = :PIL, 'la réponse garde le demandeur');

-- 2. un pour info écrit par le service n'efface pas son rappel J-7
delete from public.outbox; delete from public.answers;
select pg_temp.as_user(:RS);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'On tourne demain', null);
select pg_temp.admin();
select public.queue_reminders();
select pg_temp.check(exists (select 1 from public.outbox where user_id = :RS and title like 'J-7 : Teaser 261'), 'pour info : le rappel J-7 reste');
select pg_temp.check(not exists (select 1 from public.outbox where user_id = :VIS), 'un visiteur ne reçoit pas les rappels');
-- une vraie demande datée par le service, elle, compte
delete from public.outbox;
select pg_temp.as_user(:RS);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Visuels', 'Les photos', current_date + 3);
select pg_temp.admin();
delete from public.outbox where title <> 'Demande';
select public.queue_reminders();
select pg_temp.check(not exists (select 1 from public.outbox where user_id = :RS and title like 'J-7 : Teaser 261'), 'demande datée : plus de rappel J-7');

-- 6. un visiteur ne reçoit pas les messages d'un service et ne répond pas
select pg_temp.check(not exists (select 1 from public.req_dests('rs') d where d = :VIS), 'req_dests sans visiteur');
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rs', 'Rushs', 'Les rushs', current_date + 2);
select pg_temp.as_user(:VIS);
update public.reqs set st = 'recue', reponse = 'moi' where quoi = 'Les rushs';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where quoi = 'Les rushs') = 'ouverte', 'le visiteur ne répond pas');

-- 5. set_res fusionne ; mêmes droits que la fiche
select pg_temp.as_user(:RP);
select public.set_res(:IT2, '{"vues": 9000}'::jsonb);
select public.set_res(:IT2, '{"inscrits": 40}'::jsonb);
select pg_temp.admin();
select pg_temp.check((select res from public.items where id = :IT2) = '{"vues": 9000, "inscrits": 40}'::jsonb, 'deux notes : les deux restent');
select pg_temp.as_user(:RP);
select public.set_res(:IT2, '{}'::jsonb, array['vues']);
select pg_temp.admin();
select pg_temp.check((select res from public.items where id = :IT2) = '{"inscrits": 40}'::jsonb, 'retirer une unité');
select pg_temp.as_user(:RS);
select pg_temp.refus($$select public.set_res('26110000-0000-0000-0000-000000000002', '{"vues": 1}'::jsonb)$$, 'un autre service note les chiffres');
select pg_temp.as_user(:VIS);
select pg_temp.refus($$select public.set_res('26110000-0000-0000-0000-000000000002', '{"vues": 1}'::jsonb)$$, 'un visiteur note les chiffres');
select pg_temp.as_user(:RP);
select pg_temp.refus($$select public.set_res('26110000-0000-0000-0000-000000000002', '{"vues": -5}'::jsonb)$$, 'un chiffre négatif');
select pg_temp.refus($$select public.set_res('26110000-0000-0000-0000-000000000002', '{"vues": 2000000000}'::jsonb)$$, 'un chiffre trop grand');
select pg_temp.admin();
select pg_temp.check((select res from public.items where id = :IT2) = '{"inscrits": 40}'::jsonb, 'rien n''a changé après les refus');

rollback;
\echo 'corrections 2.6.1 : bon'
