-- Rappels J-30 / J-15 / J-7 (queue_reminders, version 0004) avec « aujourd'hui » simulé, demandes d'éléments et deadlines.
-- OK = attendu et vérifié (le script s'arrête sinon) ; BUG = défaut constaté (le script continue) ; CORRIGÉ ? = le défaut a disparu.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK   %', label; end $$;
create function pg_temp.bug(cond boolean, label text) returns void language plpgsql as $$
begin if cond is true then raise notice 'BUG  %', label; else raise notice 'CORRIGÉ ? %', label; end if; end $$;
create function pg_temp.info(label text) returns void language plpgsql as $$ begin raise notice 'INFO %', label; end $$;
-- copie de queue_reminders avec now() remplacé par une heure simulée
do $$ declare src text := pg_get_functiondef('public.queue_reminders()'::regprocedure);
begin
  src := replace(src, 'public.queue_reminders()', 'public.queue_reminders_at()');
  src := replace(src, 'now()', 'current_setting(''kp.now'')::timestamptz');
  execute src;
end $$;
create function pg_temp.run_at(ts text) returns int language plpgsql as $$
begin perform set_config('kp.now', ts, false); return public.queue_reminders_at(); end $$;
create function pg_temp.n(title_like text, who text default null) returns bigint language sql as $$
  select count(*) from public.outbox o join public.profiles p on p.id = o.user_id where o.title like title_like and (who is null or p.nom = who) $$;
create function pg_temp.who(title_like text) returns text[] language sql as $$
  select coalesce(array_agg(p.nom order by p.nom), '{}') from public.outbox o join public.profiles p on p.id = o.user_id where o.title like title_like $$;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'julien@kedgebs.com'), ('00000000-0000-0000-0000-000000000002', 'estelle@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000003', 'aurelie@kedgebs.com'), ('00000000-0000-0000-0000-000000000004', 'stephane@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000005', 'louise@kedgebs.com'), ('00000000-0000-0000-0000-000000000006', 'hugo@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000007', 'marc@kedgebs.com');
update public.profiles set chef = true, media = true, notif_all = true where nom = 'Julien';
update public.profiles set chef = true where nom = 'Estelle';
update public.profiles set svc = 'rp' where nom in ('Aurelie', 'Hugo');
update public.profiles set svc = 'rs' where nom = 'Stephane';
update public.profiles set svc = 'video', media = true where nom = 'Louise';
update public.profiles set svc = 'rp', chef = true where nom = 'Marc';
insert into public.partners (k, nom) values ('major', 'Major Prépa');
create temp table it (k text primary key, id uuid default gen_random_uuid());
grant select on it to authenticated;
create function pg_temp.i(k text) returns uuid language sql as $$ select id from it where it.k = i.k $$;
grant execute on function pg_temp.i(text) to authenticated;
-- ajoute une fiche (auteur Julien) ; pg_temp.mk(clé, kind, titre, date, svc, flou, tf, st, partner, per)
create function pg_temp.mk(k text, kind text, t text, d date, svc text, flou text default '', tf text default null, st text default 'planifie', partner text default null, per smallint[] default '{}') returns void language plpgsql as $$
begin
  insert into it (k) values (k) on conflict do nothing;
  insert into public.items (id, kind, t, date, flou, per, svc, partner, st, tf, author)
  values (pg_temp.i(k), kind, t, d, flou, per, svc, partner, st, pg_temp.i(tf), '00000000-0000-0000-0000-000000000001');
end $$;

-- ============ jeu de départ : aujourd'hui = dim. 25 oct. 2026 (passage à l'heure d'hiver) ============
select pg_temp.mk('j30', 'action', 'CP J-30', '2026-11-24', 'rp');
select pg_temp.mk('j16', 'action', 'CP J-16', '2026-11-10', 'rp');
select pg_temp.mk('j15', 'action', 'CP J-15', '2026-11-09', 'rp');
select pg_temp.mk('j8', 'action', 'CP J-8', '2026-11-02', 'rp');
select pg_temp.mk('j5', 'action', 'Créée à J-5', '2026-10-30', 'rp');
select pg_temp.mk('j1', 'action', 'Demain', '2026-10-26', 'rp');
select pg_temp.mk('j0', 'action', 'Le jour même', '2026-10-25', 'rp');
select pg_temp.mk('j31', 'action', 'CP J-31', '2026-11-25', 'rp');
select pg_temp.mk('mois', 'action', 'Au mois seulement', '2026-11-01', 'rp', 'Nov.');
select pg_temp.mk('conf', 'action', 'Date à confirmer', '2026-11-01', 'rp', 'Date à confirmer');
select pg_temp.mk('chef', 'action', 'Action chefs J-10', '2026-11-04', 'chef');
select pg_temp.mk('pay', 'action', 'Partenariat J-10', '2026-11-04', 'chef', '', null, 'planifie', 'major');
select pg_temp.mk('recu', 'action', 'Éléments déjà reçus J-10', '2026-11-04', 'rs');
-- famille temps fort : TF JPO (14 nov.), relais RP « CP JPO », relais RS « Live JPO », relais vidéo retiré « Story »
select pg_temp.mk('tf', 'tf', 'JPO', '2026-11-14', 'chef');
select pg_temp.mk('cpjpo', 'action', 'CP JPO', '2026-11-09', 'rp', '', 'tf');
select pg_temp.mk('live', 'action', 'Live JPO', '2026-11-09', 'rs', '', 'tf');
select pg_temp.mk('story', 'action', 'Story JPO', '2026-11-10', 'video', '', 'tf', 'retire');
select pg_temp.mk('reel', 'action', 'Reel JPO', '2026-11-11', 'video', '', 'tf');
-- sujet de période 2 et son relais
select pg_temp.mk('suj', 'tf', 'Sujet Alumni', '2026-11-01', 'chef', '', null, 'planifie', null, '{2}');
select pg_temp.mk('sujrel', 'action', 'Relais du sujet', '2026-11-12', 'rs', '', 'suj');
-- éléments déjà demandés ET reçus par Stéphane
insert into public.reqs (item, asker, dest, type, pour, st) values (pg_temp.i('recu'), '00000000-0000-0000-0000-000000000004', 'chef', 'Visuels', '2026-11-02', 'recue');
-- Stéphane demande pour « Live JPO » (relais) ; la vidéo demande sur la « Story » retirée ; RS demande pour le sujet lui-même
insert into public.reqs (item, asker, dest, type, pour) values (pg_temp.i('live'), '00000000-0000-0000-0000-000000000004', 'chef', 'Visuels', '2026-11-02');
insert into public.reqs (item, asker, dest, type, pour) values (pg_temp.i('story'), '00000000-0000-0000-0000-000000000005', 'rp', 'Contact', '2026-11-02');
insert into public.reqs (item, asker, dest, type, pour) values (pg_temp.i('suj'), '00000000-0000-0000-0000-000000000004', 'chef', 'Programme', '2026-11-02');
-- Hugo : « Pas besoin » au jalon 15 de CP J-15 (clé id-date-jalon) ; Aurélie : ancienne clé id-15 (avant 0004)
insert into public.answers (user_id, key, val) values ('00000000-0000-0000-0000-000000000006', pg_temp.i('j15') || '-2026-11-09-15', 'non');
insert into public.answers (user_id, key, val) values ('00000000-0000-0000-0000-000000000003', pg_temp.i('j16') || '-30', 'non');
-- ancien dédoublonnage (avant 0004) : Aurélie a déjà eu le rappel J-15 de CP J-15 sous l'ancienne forme
insert into public.outbox (user_id, title, dedupe, sent_at) values ('00000000-0000-0000-0000-000000000003', 'ancien rappel', 'rappel:' || pg_temp.i('j15') || ':15:00000000-0000-0000-0000-000000000003', now());
delete from public.outbox where dedupe is null;

select pg_temp.run_at('2026-10-25 07:00:00+00');
select pg_temp.run_at('2026-10-25 07:00:00+00');
select pg_temp.run_at('2026-10-25 15:00:00+00');
select pg_temp.run_at('2026-10-24 23:30:00+00'); -- 1 h 30 à Paris le 25 (heure d'été encore) : même jour
select p.nom, o.title, o.dedupe from public.outbox o join public.profiles p on p.id = o.user_id where o.title like 'J-%' and o.created_at > now() - interval '1 hour' order by 2, 1;
select pg_temp.check((select count(*) - count(distinct dedupe) from public.outbox) = 0, '4 passages le 25 oct. (dont 1 h 30 Paris) : aucun doublon');
select pg_temp.check(pg_temp.who('J-30 : CP J-30') = '{Aurelie,Hugo,Marc}', 'J-30 : RP (Aurélie, Hugo, Marc chef+RP)');
select pg_temp.check(pg_temp.n('J-16 : CP J-16') = 3 and pg_temp.n('J-16 : CP J-16', 'Aurelie') = 1, 'J-16 = jalon 30 (titre J-16) ; l''ancienne réponse « id-30 » d''Aurélie ne compte plus (clé changée)');
select pg_temp.check(pg_temp.who('J-15 : CP J-15') = '{Marc}', 'J-15 : Hugo a dit « Pas besoin » (clé datée), Aurélie bloquée par l''ancien dédoublonnage rappel:<id>:15');
select pg_temp.check(pg_temp.n('J-8 : CP J-8') = 3 and pg_temp.n('J-5 : Créée à J-5') = 3 and pg_temp.n('J-1 : Demain') = 3, 'rattrapage : J-8 (jalon 15), J-5 et J-1 (jalon 7)');
select pg_temp.check(pg_temp.n('%Le jour même%') + pg_temp.n('%CP J-31%') = 0, 'J-0 et J-31 : rien');
select pg_temp.check(pg_temp.n('%Au mois seulement%') + pg_temp.n('%Date à confirmer%') = 0, 'date au mois / à confirmer : pas de rappel');
select pg_temp.check(pg_temp.who('J-10 : Action chefs J-10') = '{Estelle,Julien,Marc}', 'action chef : les chefs');
select pg_temp.check(pg_temp.who('J-10 : Partenariat J-10') = '{Julien,Louise}', 'partenariat : les comptes média');
select pg_temp.check(pg_temp.n('%Éléments déjà reçus%') = 0, 'éléments déjà demandés et reçus : plus de rappel (ancien défaut corrigé)');
select pg_temp.check(pg_temp.n('%Live JPO%') = 0, 'relais où RS a demandé : pas de rappel à RS');
select pg_temp.check(pg_temp.who('J-15 : CP JPO') = '{Aurelie,Hugo,Marc}', 'relais RP : les demandes de RS / vidéo dans la famille ne coupent pas le rappel de RP');
select pg_temp.check(pg_temp.n('%Reel JPO%') = 0, 'relais vidéo : Louise a demandé sur un frère retiré (Story) → pas de rappel');
select pg_temp.check(pg_temp.n('%Relais du sujet%') = 0, 'relais d''un sujet : demande faite sur le sujet → pas de rappel');
select pg_temp.check(pg_temp.n('%JPO') - pg_temp.n('%CP JPO') - pg_temp.n('%Live JPO') - pg_temp.n('%Reel JPO') - pg_temp.n('%Story JPO') = 0 and pg_temp.n('%Sujet Alumni%') = 0 and pg_temp.n('%Story JPO%') = 0, 'temps fort, sujet, relais retiré : pas de rappel');
select pg_temp.check((select bool_and(body = 'As-tu besoin d''éléments ? C''est le moment de les demander.' and url = '#afaire') from public.outbox where title like 'J-%' and sent_at is null), 'texte et lien');

-- chef sans service : Estelle a demandé pour l'action des chefs ; Julien (chef, autre « service » chef) est-il encore relancé ?
insert into public.reqs (item, asker, dest, type, pour) values (pg_temp.i('chef'), '00000000-0000-0000-0000-000000000002', 'rp', 'Contact', '2026-11-01');
delete from public.outbox where title = 'Demande d''éléments';
-- ============ 26 oct. : même jalons, pas de nouveau ; CP J-16 passe à J-15 → 2e rappel le lendemain ============
select pg_temp.run_at('2026-10-26 07:00:00+00');
select pg_temp.check(pg_temp.n('J-29 : CP J-30') = 0 and pg_temp.n('J-4 : Créée à J-5') = 0 and pg_temp.n('J-7 : CP J-8') = 3, '26 oct. : même jalon le lendemain, rien de nouveau');
select pg_temp.check(pg_temp.n('J-15 : CP J-16') = 3, '26 oct. : CP J-16 atteint J-15 → nouveau rappel (deux jours de suite J-16 puis J-15)');
select pg_temp.info('jours consécutifs pour une action créée à J-16 ou J-8 : rappel « J-16 » puis « J-15 » le lendemain (ou J-8 puis J-7)');
select pg_temp.check(pg_temp.n('J-9 : Action chefs J-10', 'Julien') + pg_temp.n('J-9 : Action chefs J-10', 'Estelle') = 0, 'action chefs : rien de nouveau le 26');

-- ============ matin manqué : J-30 le 26, cron en panne, passage le 27 → J-29 ============
select pg_temp.mk('panne', 'action', 'J-30 le 26', '2026-11-25', 'rs');
select pg_temp.run_at('2026-10-27 07:00:00+00');
select pg_temp.check(pg_temp.n('J-29 : J-30 le 26', 'Stephane') = 1, 'matin manqué : rattrapé le 27 (« J-29 »)');
-- action posée à J-31 la veille : J-30 le lendemain normal
select pg_temp.check(pg_temp.n('J-30 : CP J-31') = 3 and pg_temp.n('J-29 : CP J-31') = 0, 'CP J-31 : J-30 le 26, rien de plus le 27');

-- ============ date repoussée ============
-- CP J-8 (2 nov., jalon 15 envoyé le 25) : Aurélie dit « Pas besoin » au jalon 7 du 2 nov. puis l'action passe au 20 nov.
insert into public.answers (user_id, key, val) values ('00000000-0000-0000-0000-000000000003', pg_temp.i('j8') || '-2026-11-02-7', 'non');
update public.items set date = '2026-11-20' where id = pg_temp.i('j8');
select pg_temp.run_at('2026-10-28 07:00:00+00');
select pg_temp.check(pg_temp.n('J-7 : Action chefs J-10') = 0, 'action des chefs : Estelle a demandé, aucun chef n''est plus relancé');
select pg_temp.check(pg_temp.n('J-23 : CP J-8') = 3, 'repoussée au 20 nov. (J-23) : nouveau rappel jalon 30');
select pg_temp.run_at('2026-11-05 07:00:00+00');
select pg_temp.check(pg_temp.n('J-15 : CP J-8') = 3, 'nouveau jalon 15');
select pg_temp.run_at('2026-11-13 07:00:00+00');
select pg_temp.check(pg_temp.n('J-7 : CP J-8') = 6 and pg_temp.n('J-7 : CP J-8', 'Aurelie') = 2, 'nouveau jalon 7 (3 de l''ancienne date + 3) : le « Pas besoin » de l''ancienne date ne compte pas (ancien défaut corrigé)');
-- décalée d'un seul jour : tous les jalons repartent
select pg_temp.mk('shift', 'action', 'Décalée d''un jour', '2026-11-20', 'rs');
select pg_temp.run_at('2026-11-14 07:00:00+00'); -- J-6 : jalon 7
update public.items set date = '2026-11-21' where id = pg_temp.i('shift');
select pg_temp.run_at('2026-11-15 07:00:00+00'); -- J-6 à nouveau
select pg_temp.info('action décalée d''un jour dans la dernière semaine : ' || pg_temp.n('%Décalée d''un jour', 'Stephane') || ' rappels reçus (un par décalage)');
-- ancien dédoublonnage : il bloque aussi une action décalée
select pg_temp.mk('legacy', 'action', 'Ancienne action décalée', '2026-11-30', 'rs');
insert into public.outbox (user_id, title, dedupe, sent_at) values ('00000000-0000-0000-0000-000000000004', 'ancien rappel', 'rappel:' || pg_temp.i('legacy') || ':7:00000000-0000-0000-0000-000000000004', now());
select pg_temp.run_at('2026-11-25 07:00:00+00');
select pg_temp.bug(pg_temp.n('J-5 : Ancienne action décalée') = 0, 'ancien dédoublonnage rappel:<id>:7 (envoyé pour l''ancienne date) bloque aussi le jalon 7 de la nouvelle date (transitoire, 60 jours)');

-- ============ suppression par une demande ============
select pg_temp.mk('sup', 'action', 'Suppr', '2026-12-20', 'rp');
select pg_temp.mk('tf2', 'tf', 'Salon', '2026-12-22', 'chef');
select pg_temp.mk('sib1', 'action', 'Relais A', '2026-12-20', 'rp', '', 'tf2');
select pg_temp.mk('sib2', 'action', 'Relais B', '2026-12-21', 'rs', '', 'tf2');
select pg_temp.mk('sib3', 'action', 'Relais C', '2026-12-21', 'rs', '', 'tf2');
-- Hugo (RP) demande sur Suppr : tout RP coupé ; Aurélie demande sur le TF Salon : RP coupé pour Relais A ; Stéphane sur Relais B : RS coupé pour Relais C
select pg_temp.as_user('00000000-0000-0000-0000-000000000006');
insert into public.reqs (item, dest, type, pour) values (pg_temp.i('sup'), 'chef', 'Visuels', '2026-12-10');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.reqs (item, dest, type, pour) values (pg_temp.i('tf2'), 'rs', 'Contexte', '2026-12-10');
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.reqs (item, dest, type, pour) values (pg_temp.i('sib2'), 'rp', 'Contact', '2026-12-10');
select pg_temp.admin();
select pg_temp.run_at('2026-11-25 07:00:00+00');
select pg_temp.check(pg_temp.n('%: Suppr') = 0, 'collègue du même service a demandé : personne du service relancé');
select pg_temp.check(pg_temp.n('%: Relais A') = 0, 'demande sur le temps fort : relais RP coupé');
select pg_temp.check(pg_temp.n('%: Relais C') = 0 and pg_temp.n('%: Relais B') = 0, 'demande sur un relais frère : RS coupé sur les deux');

-- ============ demandes : notification, doublon, limite ============
delete from public.outbox;
select pg_temp.mk('rq', 'action', 'Action demandes', '2026-12-15', 'rs');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.reqs (item, dest, type, pour) values (pg_temp.i('rq'), 'chef', 'Visuels', '2026-12-01');
select pg_temp.check(pg_temp.err($$insert into public.reqs (item, dest, type, pour) values (pg_temp.i('rq'), 'chef', 'Visuels', '2026-12-02')$$) = 'déjà demandé', 'même demande encore ouverte : refusée');
select pg_temp.as_user('00000000-0000-0000-0000-000000000006');
select pg_temp.check(pg_temp.err($$insert into public.reqs (item, dest, type, pour) values (pg_temp.i('rq'), 'chef', 'Visuels', '2026-12-02')$$) = 'déjà demandé', 'même demande par un collègue : refusée');
select pg_temp.admin();
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id where o.title = 'Demande d''éléments') = '{Estelle,Julien,Marc}'
  and (select bool_and(body = 'Aurelie demande : Visuels pour « Action demandes », avant le 01/12') from public.outbox where title = 'Demande d''éléments'), 'notification aux chefs, avec « avant le 01/12 »');
-- Julien envoie : Aurélie prévenue ; puis Aurélie redemande des visuels (nouvelle demande, le même jour)
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.reqs set st = 'recue' where item = pg_temp.i('rq');
select pg_temp.admin();
select pg_temp.check(pg_temp.n('Éléments reçus', 'Aurelie') = 1, 'chef marque envoyé : Aurélie prévenue');
update public.outbox set title = 'vu:' || title; -- garde les clés de dédoublonnage
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.reqs (item, dest, type, quoi, pour) values (pg_temp.i('rq'), 'chef', 'Visuels', 'Les photos de la soirée en plus', '2026-12-05');
select pg_temp.admin();
select pg_temp.bug(pg_temp.n('Demande d''éléments') = 0, 'nouvelle demande de visuels le même jour après réception de la 1re : acceptée mais aucun chef prévenu (dédoublonnage req:item:dest:type:jour)');
-- marquée reçue par elle-même : pas de notification à soi
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
update public.reqs set st = 'recue' where item = pg_temp.i('rq') and st = 'ouverte';
select pg_temp.admin();
select pg_temp.check(pg_temp.n('Éléments reçus') = 0, 'marquée reçue par la personne qui demande : pas de notification à elle-même (ancien défaut corrigé)');
-- limite : 10 demandes en 10 minutes
select pg_temp.mk('lim', 'action', 'Limite', '2026-12-15', 'rs');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ declare t text; begin
  foreach t in array array['Programme','Contexte','Éléments de langage','Visuels','Contact','Rushs','Autre'] loop
    insert into public.reqs (item, dest, type, pour) values (pg_temp.i('lim'), 'rs', t, '2026-12-01');
  end loop;
  foreach t in array array['Programme','Contexte','Visuels'] loop
    insert into public.reqs (item, dest, type, pour) values (pg_temp.i('lim'), 'video', t, '2026-12-01');
  end loop; end $$;
select pg_temp.check(pg_temp.err($$insert into public.reqs (item, dest, type, pour) values (pg_temp.i('lim'), 'video', 'Rushs', '2026-12-01')$$) like 'trop de demandes%', '11e demande en 10 min : refusée');
select pg_temp.admin();

-- contournement : Marc envoie lui-même « at » dans le passé
select pg_temp.mk('lim2', 'action', 'Limite 2', '2026-12-15', 'rs');
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
create temp table lim_ok (n int); insert into lim_ok values (0); grant all on lim_ok to authenticated;
do $$ declare t text; d text; begin
  foreach d in array array['video','chef'] loop foreach t in array array['Programme','Contexte','Éléments de langage','Visuels','Contact','Rushs','Autre'] loop
    begin
      insert into public.reqs (item, dest, type, pour, at) values (pg_temp.i('lim2'), d, t, '2026-12-01', '2020-01-01');
      update lim_ok set n = n + 1;
    exception when sqlstate '54000' then null; end;
  end loop; end loop; end $$;
select pg_temp.admin();
select pg_temp.check((select n from lim_ok) = 10 and (select count(*) from public.reqs where asker = '00000000-0000-0000-0000-000000000007' and at < now() - interval '1 day') = 0,
  '« at » envoyé dans le passé : la base garde son heure, la limite de 10 demandes tient');
-- ============ deadline ============
update public.outbox set title = 'vu:' || title, user_id = user_id;
select pg_temp.mk('dl', 'action', 'Action deadline', '2026-12-10', 'rs');
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.reqs (item, dest, type, pour) values (pg_temp.i('dl'), 'rp', 'Contact', '2026-12-01');
-- deadline après l'action, ou passée : la base l'accepte
select pg_temp.info('deadline après l''action acceptée par la base : ' || (pg_temp.err($$update public.reqs set pour = '2026-12-31' where item = pg_temp.i('dl')$$) is null));
select pg_temp.info('deadline dans le passé acceptée par la base : ' || (pg_temp.err($$update public.reqs set pour = '2020-01-01' where item = pg_temp.i('dl')$$) is null));
select pg_temp.admin(); update public.outbox set title = 'vu:' || title, user_id = user_id; select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.reqs set pour = '2026-12-03' where item = pg_temp.i('dl');
select pg_temp.admin();
select pg_temp.check(pg_temp.who('Nouvelle deadline') = '{Aurelie,Hugo,Marc}' and (select bool_and(body = 'Contact pour « Action deadline » : avant le 03/12') from public.outbox where title = 'Nouvelle deadline'), 'deadline changée par Stéphane : RP prévenu, « avant le 03/12 »');
-- Hugo (service sollicité) essaie : sans effet, sans notification
update public.outbox set title = 'vu:' || title, user_id = user_id;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006');
update public.reqs set pour = '2026-12-09' where item = pg_temp.i('dl');
select pg_temp.admin();
select pg_temp.check((select pour from public.reqs where item = pg_temp.i('dl')) = '2026-12-03' and pg_temp.n('Nouvelle deadline') = 0, 'le service sollicité ne change pas la deadline (gardée), rien envoyé');
-- Estelle (chef) change : RP prévenu, mais Stéphane (qui a demandé) ?
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.reqs set pour = '2026-12-05' where item = pg_temp.i('dl');
select pg_temp.admin();
select pg_temp.check(pg_temp.who('Nouvelle deadline') = '{Aurelie,Hugo,Marc,Stephane}', 'chef change la deadline : RP prévenu, et Stéphane qui a demandé');
-- retour à une deadline déjà utilisée : dédoublonnée, pas de notification (l'appli affiche « est prévenu »)
update public.outbox set title = 'vu:' || title, user_id = user_id;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.reqs set pour = '2026-12-03' where item = pg_temp.i('dl');
select pg_temp.admin();
select pg_temp.check(pg_temp.n('Nouvelle deadline') = 3, 'deadline remise à une date déjà annoncée (03/12 → 05/12 → 03/12) : RP prévenu du retour au 03/12');
select pg_temp.check((select count(*) from public.journal where item = pg_temp.i('dl') and kind = 'deadline') >= 3, 'chaque changement de deadline s''inscrit dans l''historique de la fiche');
-- la personne qui demande change le service sollicité : le nouveau service n'est pas prévenu
update public.outbox set title = 'vu:' || title, user_id = user_id;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.reqs set dest = 'video' where item = pg_temp.i('dl');
select pg_temp.admin();
select pg_temp.info('dest changé par la personne qui demande (pas proposé dans l''appli) : ' || (pg_temp.n('Demande%') + pg_temp.n('Nouvelle%')) || ' notification(s) à la vidéo');
