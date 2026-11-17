-- Vérifie les migrations de la V2 (0019 à 0022) : Content et Recrutement, report et annulation avec motif,
-- carnet de lieux et de contacts, profil modifiable par chacun et version utilisée.
-- Se suffit à lui-même : crée ses propres comptes.
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

insert into auth.users (id, email) values
  ('22000000-0000-0000-0000-000000000001', 'pilote.v2@example.com'),
  ('22000000-0000-0000-0000-000000000002', 'rp.v2@example.com'),
  ('22000000-0000-0000-0000-000000000003', 'rs.v2@example.com'),
  ('22000000-0000-0000-0000-000000000004', 'lecteur.v2@example.com')
on conflict do nothing;
update public.profiles set nom = 'Pilote', chef = true, media = true where id = '22000000-0000-0000-0000-000000000001';
update public.profiles set nom = 'Presse', svc = 'rp' where id = '22000000-0000-0000-0000-000000000002';
update public.profiles set nom = 'Reseaux', svc = 'rs' where id = '22000000-0000-0000-0000-000000000003';
update public.profiles set nom = 'Lecteur', visiteur = true where id = '22000000-0000-0000-0000-000000000004';

-- ---------- 0019 : Content et Recrutement ----------
select pg_temp.check(exists (select 1 from public.services where k = 'content'), 'le service Content existe');
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
update public.profiles set svc = 'content' where id = '22000000-0000-0000-0000-000000000001';
insert into public.items (id, kind, t, date, svc, m) values ('22100000-0000-0000-0000-000000000001', 'tf', 'Journée portes ouvertes', current_date + 30, 'chef', '{REC}');
insert into public.items (id, kind, t, date, svc, m, tf) values ('22100000-0000-0000-0000-000000000002', 'action', 'Article JPO', current_date + 25, 'content', '{REC,1}', '22100000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m, rang, cible) values ('22100000-0000-0000-0000-000000000003', 'classement', 'SIGEM', current_date + 200, 'chef', '{5}', 10, 7);
select pg_temp.admin();
select pg_temp.check((select m from public.items where id = '22100000-0000-0000-0000-000000000002') = '{REC,1}', 'Recrutement se cumule avec un message');
select pg_temp.check((select m from public.items where id = '22100000-0000-0000-0000-000000000003') = '{5}', 'un classement porte le message Réputation');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc, m) values ('action', 'x', current_date, 'rp', '{INC}')$$, '« Incontournable » n''existe plus');
select pg_temp.check((select chef and svc = 'content' from public.profiles where id = '22000000-0000-0000-0000-000000000001'), 'un chef de projet est aussi rattaché à Content');

-- ---------- 0020 : report et annulation ----------
-- Presse relaie la JPO
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
insert into public.items (id, kind, t, date, svc, m, tf) values ('22100000-0000-0000-0000-000000000004', 'action', 'Invitation presse', current_date + 20, 'rp', '{1}', '22100000-0000-0000-0000-000000000001');
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
update public.items set date = current_date + 44, report_de = '28 nov.', report_motif = 'Salle indisponible' where id = '22100000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select report_par = '22000000-0000-0000-0000-000000000001' and report_at is not null from public.items where id = '22100000-0000-0000-0000-000000000001'), 'la base note qui reporte et quand');
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id where o.title like 'Reporté%' and p.id::text like '22000000%') = '{Presse}', 'le service qui relaie est prévenu du report, pas l''auteur');
select pg_temp.check((select body from public.outbox where title like 'Reporté%' limit 1) like '%Salle indisponible', 'la notification donne le motif');
select pg_temp.check(exists (select 1 from public.journal where item = '22100000-0000-0000-0000-000000000001' and diff ? 'report_motif'), 'l''historique garde le motif du report');
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$update public.items set report_motif = 'sans changer la date' where id = '22100000-0000-0000-0000-000000000001'$$, 'un report sans changement de date');
-- personne ne se fait passer pour un autre
update public.items set note = 'x', report_par = '22000000-0000-0000-0000-000000000002' where id = '22100000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select report_par from public.items where id = '22100000-0000-0000-0000-000000000001') = '22000000-0000-0000-0000-000000000001', 'l''auteur du report ne se réécrit pas');
-- annuler puis rétablir
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
update public.items set st = 'retire', annule_motif = 'Le journaliste ne vient plus' where id = '22100000-0000-0000-0000-000000000004';
select pg_temp.admin();
select pg_temp.check((select annule_par = '22000000-0000-0000-0000-000000000002' and annule_at is not null and annule_motif <> '' from public.items where id = '22100000-0000-0000-0000-000000000004'), 'annulation : motif, qui et quand');
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
update public.items set st = 'confirmer' where id = '22100000-0000-0000-0000-000000000004';
select pg_temp.admin();
select pg_temp.check((select annule_motif = '' and annule_par is null and annule_at is null from public.items where id = '22100000-0000-0000-0000-000000000004'), 'rétablir efface le motif d''annulation');

-- ---------- 0021 : carnet ----------
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
insert into public.lieux (nom) values ('Campus de Bordeaux');
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail($$insert into public.lieux (nom) values ('Campus de Marseille')$$, 'un service n''ajoute pas de lieu');
insert into public.contacts (id, nom, role, mail) values ('22200000-0000-0000-0000-000000000001', 'Claire Morel', 'Admissions', 'claire.morel@example.com');
insert into public.item_contacts (item, contact) values ('22100000-0000-0000-0000-000000000004', '22200000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$insert into public.item_contacts (item, contact) values ('22100000-0000-0000-0000-000000000002', '22200000-0000-0000-0000-000000000001')$$, 'pas de contact sur la fiche d''un autre service');
update public.contacts set tel = '05 56 00 00 01' where id = '22200000-0000-0000-0000-000000000001';
select pg_temp.as_user('22000000-0000-0000-0000-000000000003');
update public.contacts set nom = 'Autre' where id = '22200000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from public.contacts) = 1 and (select count(*) from public.lieux) = 1, 'tout le monde lit le carnet');
select pg_temp.as_user('22000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($$insert into public.contacts (nom) values ('Intrus')$$, 'un lecteur n''ajoute pas de contact');
select pg_temp.admin();
select pg_temp.check((select nom = 'Claire Morel' and tel <> '' from public.contacts where id = '22200000-0000-0000-0000-000000000001'), 'un contact se corrige par qui l''a ajouté, pas par un autre service');
delete from public.items where id = '22100000-0000-0000-0000-000000000004';
select pg_temp.check((select count(*) from public.item_contacts) = 0 and (select count(*) from public.contacts) = 1, 'supprimer une fiche retire le lien, pas le contact');

-- ---------- 0022 : profil ----------
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
update public.profiles set nom = 'Presse B', fonction = 'Attachée de presse', notif_changements = false, version = '2.0.0' where id = '22000000-0000-0000-0000-000000000002';
select pg_temp.expect_fail($$update public.profiles set svc = 'rs' where id = '22000000-0000-0000-0000-000000000002'$$, 'on ne change pas son propre service');
select pg_temp.expect_fail($$update public.profiles set chef = true where id = '22000000-0000-0000-0000-000000000002'$$, 'on ne se nomme pas chef');
update public.profiles set nom = 'Piraté' where id = '22000000-0000-0000-0000-000000000003';
select pg_temp.as_user('22000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($$update public.profiles set nom = 'Autre' where id = '22000000-0000-0000-0000-000000000004'$$, 'le compte lecteur ne change pas son nom');
update public.profiles set version = '2.0.0' where id = '22000000-0000-0000-0000-000000000004';
select pg_temp.admin();
select pg_temp.check((select nom = 'Presse B' and not notif_changements and version = '2.0.0' and version_at is not null from public.profiles where id = '22000000-0000-0000-0000-000000000002'), 'chacun modifie son nom, ses notifications, et sa version est notée');
select pg_temp.check((select nom from public.profiles where id = '22000000-0000-0000-0000-000000000003') = 'Reseaux', 'on ne modifie pas le profil d''un autre');
select pg_temp.check((select version from public.profiles where id = '22000000-0000-0000-0000-000000000004') = '2.0.0', 'la version du lecteur est notée aussi');
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
update public.profiles set svc = 'rs' where id = '22000000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.check((select svc from public.profiles where id = '22000000-0000-0000-0000-000000000002') = 'rs', 'un chef règle le service de quelqu''un');

-- ---------- 0023 : demandes ----------
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('22100000-0000-0000-0000-000000000009', 'action', 'Dossier', current_date + 15, 'content', '{1}');
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
-- à une personne nommée qui n'est pas chef : elle seule est prévenue, et elle répond
insert into public.reqs (id, item, dest, type, pour) values ('22300000-0000-0000-0000-000000000001', '22100000-0000-0000-0000-000000000009', '22000000-0000-0000-0000-000000000003', 'Visuels', current_date + 5);
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', 'programme', 'Programme', current_date + 5)$$, 'la Direction du Programme n''est plus un destinataire');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', 'marketing', 'Visuels', current_date + 5)$$, 'la Dir. marketing n''est plus un destinataire');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', '22000000-0000-0000-0000-000000000004', 'Contact', current_date + 5)$$, 'on ne demande rien au compte lecteur');
select pg_temp.admin();
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id where p.id::text like '22000000%') = '{Reseaux}', 'seule la personne nommée est prévenue');
select pg_temp.as_user('22000000-0000-0000-0000-000000000003');
update public.reqs set st = 'recue', reponse = 'Dans le dossier partagé' where id = '22300000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '22300000-0000-0000-0000-000000000001') = 'recue', 'la personne nommée répond');

-- ---------- 0024 : ménage et choix de notifications ----------
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc, st) values ('action', 'x', current_date, 'rp', 'idee')$$, 'le statut « idée » n''existe plus');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc, cc) values ('action', 'x', current_date, 'rp', '{rs}')$$, 'plus de services prévenus');
select pg_temp.check((select media from public.profiles where id = '22000000-0000-0000-0000-000000000001') and not (select media from public.profiles where id = '22000000-0000-0000-0000-000000000002'), 'un pilote gère les partenariats, un service non');
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', 'offre', 'Contact', current_date + 5)$$, 'la Resp. offre n''est plus un destinataire');
select pg_temp.expect_fail($$insert into public.blocks (item, why) values ('22100000-0000-0000-0000-000000000009', 'en attente du budget')$$, 'plus de blocage');
insert into public.blocks (item, why) values ('22100000-0000-0000-0000-000000000009', 'à trancher en réunion');
-- Reseaux ne veut plus les notifications de demandes : il ne reçoit pas la suivante, mais reçoit toujours une création
select pg_temp.as_user('22000000-0000-0000-0000-000000000003');
update public.profiles set notif_demandes = false where id = '22000000-0000-0000-0000-000000000003';
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', '22000000-0000-0000-0000-000000000003', 'Rushs', current_date + 6);
insert into public.reqs (item, dest, type, pour) values ('22100000-0000-0000-0000-000000000009', '22000000-0000-0000-0000-000000000002', 'Rushs', current_date + 6);
insert into public.items (kind, t, date, svc, m) values ('action', 'Story du jour', current_date + 3, 'rs', '{1}');
select pg_temp.admin();
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id where o.title = 'Demande d''éléments' and p.id::text like '22000000%') = '{"Presse B"}', 'qui a coupé les demandes ne les reçoit plus, les autres oui');
select pg_temp.check(exists (select 1 from public.outbox o where o.user_id = '22000000-0000-0000-0000-000000000003' and o.title = 'Nouvelle action'), 'il reçoit toujours ce qui est confié à son service');
delete from public.items where t = 'Story du jour';

-- 0025 : le rappel pour soi, ouvert à tous, privé, plusieurs par fiche
select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
insert into public.reqs (item, dest, type, quoi, pour) values ('22100000-0000-0000-0000-000000000001', 'moi', 'Autre', 'Appeler le programme', current_date + 2);
insert into public.reqs (item, dest, type, quoi, pour) values ('22100000-0000-0000-0000-000000000001', 'moi', 'Autre', 'Relire le texte', current_date + 3);
select pg_temp.check((select count(*) from public.reqs where dest = 'moi' and asker = auth.uid()) = 2, 'un service se note deux rappels sur la même fiche');
update public.reqs set st = 'recue' where dest = 'moi' and quoi = 'Relire le texte';
select pg_temp.check((select count(*) from public.reqs where dest = 'moi' and st = 'recue') = 1, 'il coche son rappel');
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.reqs where dest = 'moi' and asker = '22000000-0000-0000-0000-000000000002') = 0, 'même un pilote ne lit pas le rappel d''un autre');
select pg_temp.as_user('22000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($$insert into public.reqs (item, dest, type, quoi, pour) values ('22100000-0000-0000-0000-000000000001', 'moi', 'Autre', 'x', current_date + 2)$$, 'un visiteur ne se note rien');
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.outbox where body like '%Appeler le programme%' or title like '%Appeler le programme%'), 'un rappel ne prévient personne');

-- ménage
delete from public.items where id::text like '22100000%';
delete from public.contacts; delete from public.lieux;
delete from auth.users where id::text like '22000000%';
