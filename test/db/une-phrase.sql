-- Vérifie la migration 0030 (2.5.0, « Demander en une phrase ») sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/une-phrase.sh
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
\set PIL '''23000000-0000-0000-0000-000000000001'''
\set RP '''23000000-0000-0000-0000-000000000002'''
\set RS '''23000000-0000-0000-0000-000000000003'''
\set IT '''23100000-0000-0000-0000-000000000001'''
insert into auth.users (id, email) values (:PIL, 'pilote.p@example.com'), (:RP, 'rp.p@example.com'), (:RS, 'rs.p@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true where id = :PIL;
update public.profiles set nom = 'Aurelie', svc = 'rp' where id = :RP;
update public.profiles set nom = 'Stephane', svc = 'rs' where id = :RS;

select pg_temp.as_user(:PIL);
insert into public.items (id, kind, t, date, svc, m) values (:IT, 'action', 'Teaser de la journee', current_date + 20, 'rs', '{2}');
select pg_temp.admin();
delete from public.outbox;

-- 1. une phrase sans date part pour info
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'Le teaser est validé', null);
select pg_temp.admin();
select pg_temp.check((select count(*) from public.outbox where user_id = :RP and title = 'Pour info' and body = 'Julien : Le teaser est validé (« Teaser de la journee »)') = 1, 'pour info : Aurélie prévenue, avec la phrase');
select pg_temp.check(not exists (select 1 from public.outbox where user_id = :PIL), 'l''auteur n''est pas prévenu');

-- 2. une demande avec date : la phrase et la date dans la notification
delete from public.outbox;
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, :RS, 'Visuels', 'Tu peux m''envoyer des visuels pour vendredi dans 2 semaines ?', current_date + 15);
select pg_temp.admin();
select pg_temp.check((select body from public.outbox where user_id = :RS and title = 'Demande') = 'Julien : Tu peux m''envoyer des visuels pour vendredi dans 2 semaines ? (« Teaser de la journee »), pour le ' || to_char(current_date + 15, 'DD/MM'), 'demande : la phrase et sa date');

-- 3. plusieurs messages à la même personne ; le même texte encore ouvert est refusé
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, :RS, 'Visuels', 'Et une bannière pour LinkedIn', current_date + 16);
select pg_temp.refus($$insert into public.reqs (item, dest, type, quoi, pour) values ('23100000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000003', 'Visuels', 'Et une bannière pour LinkedIn', current_date + 17)$$, 'le même message deux fois');
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'Le brief est à jour', null);
select pg_temp.check((select count(*) from public.reqs where item = :IT and asker = :PIL and st = 'ouverte') = 4, 'quatre messages ouverts sur la fiche');

-- 4. un rappel pour soi a toujours une date ; on ne relance pas une info
select pg_temp.refus($$insert into public.reqs (item, dest, type, quoi, pour) values ('23100000-0000-0000-0000-000000000001', 'moi', 'Autre', 'Relancer Aurélie', null)$$, 'un rappel pour soi sans date');
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'moi', 'Autre', 'Relancer Aurélie', current_date + 1);
select pg_temp.refus($$select public.relancer((select id from public.reqs where quoi = 'Le teaser est validé'))$$, 'relancer un message pour info');
select public.relancer((select id from public.reqs where quoi like 'Tu peux%'));
select pg_temp.admin();
select pg_temp.check((select count(*) from public.outbox where user_id = :RS and title = 'Demande' and body like 'Relance de Julien : Tu peux%') = 1, 'relance d''une demande datée');

-- 5. retirer la date d'une demande : rien d'envoyé, pas d'erreur ; une nouvelle date : prévenu
delete from public.outbox;
select pg_temp.as_user(:PIL);
update public.reqs set pour = null where quoi = 'Et une bannière pour LinkedIn';
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox), 'date retirée : personne n''est prévenu');
select pg_temp.as_user(:PIL);
update public.reqs set pour = current_date + 1 where quoi = 'Et une bannière pour LinkedIn';
select pg_temp.admin();
select pg_temp.check((select count(*) from public.outbox where user_id = :RS and title = 'Nouvelle deadline') = 1, 'nouvelle date : Stéphane prévenu');

-- 6. la veille de l'échéance : un rappel à qui on a demandé, une seule fois ; ni l'info, ni le rappel pour soi
delete from public.outbox;
select public.queue_reminders();
select pg_temp.check((select count(*) from public.outbox where title = 'Pour demain') = 1, 'un seul rappel la veille');
select pg_temp.check((select user_id from public.outbox where title = 'Pour demain') = :RS and (select body from public.outbox where title = 'Pour demain') = 'Julien attend : Et une bannière pour LinkedIn (« Teaser de la journee »)', 'rappel la veille : à Stéphane, avec la phrase');
select public.queue_reminders();
select pg_temp.check((select count(*) from public.outbox where title = 'Pour demain') = 1, 'pas de second rappel le même jour');
-- une demande reçue ou retirée n'a plus de rappel
update public.reqs set st = 'recue' where quoi = 'Et une bannière pour LinkedIn';
delete from public.outbox;
select public.queue_reminders();
select pg_temp.check(not exists (select 1 from public.outbox where title = 'Pour demain'), 'demande reçue : plus de rappel');

-- 7. les nouveaux titres se coupent avec les autres demandes (Mon profil)
update public.profiles set notif_demandes = false where id = :RP;
delete from public.outbox;
select pg_temp.as_user(:PIL);
insert into public.reqs (item, dest, type, quoi, pour) values (:IT, 'rp', 'Info', 'Encore une info', null);
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox where user_id = :RP), 'notifications de demandes coupées : pas de « Pour info »');

rollback;
\echo 'une phrase : bon'
