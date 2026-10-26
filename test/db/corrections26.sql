-- Vérifie les corrections du 26 octobre (migration 0012) : demandes à la Resp. offre, destinataire figé,
-- suppression qui garde les demandes et documents partagés, dernier jour réservé aux temps forts datés.
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

-- c1 Julien (chef, média), c2 Estelle (chef, Resp. offre), c3 Aurélie (RP), c5 Stéphane (RS), c6 Louise (Vidéo), f1 visiteur
select pg_temp.admin();
select pg_temp.check((select offre from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'la fonction « Responsable de l''offre » rend Resp. offre d''office');
update public.profiles set chef = true, visiteur = false, offre = true where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set offre = false where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set offre = true where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.check(not (select offre from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'un visiteur n''est jamais Resp. offre');

-- ---------- Resp. offre ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m) values ('12000000-0000-0000-0000-000000000001', 'action', 'Interview offre', current_date + 20, 'rp', '{1}');
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'offre', 'Contexte', current_date + 10);
select pg_temp.admin();
select pg_temp.check((select array_agg(user_id order by user_id)::text from public.outbox where dedupe like 'req:12100000-0000-0000-0000-000000000001:%')
  = '{00000000-0000-0000-0000-0000000000c2}', 'une demande à la Resp. offre prévient Estelle, et elle seule');
-- Stéphane (RS) ne répond pas à sa place
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
update public.reqs set st = 'recue' where id = '12100000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '12100000-0000-0000-0000-000000000001') = 'ouverte', 'un service ne répond pas à une demande faite à la Resp. offre');
-- nouvelle deadline : Estelle est prévenue
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
update public.reqs set pour = current_date + 12 where id = '12100000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check(exists (select 1 from public.outbox where title = 'Nouvelle deadline' and user_id = '00000000-0000-0000-0000-0000000000c2'
  and dedupe like 'pour:12100000-0000-0000-0000-000000000001:%'), 'une nouvelle deadline prévient la Resp. offre');
-- elle répond
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
update public.reqs set st = 'recue', reponse = 'Le contexte est sur SharePoint' where id = '12100000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select st = 'recue' and repondu_par = '00000000-0000-0000-0000-0000000000c2' from public.reqs where id = '12100000-0000-0000-0000-000000000001'), 'la Resp. offre répond à la demande');
select pg_temp.check(exists (select 1 from public.outbox where title = 'Éléments reçus' and user_id = '00000000-0000-0000-0000-0000000000c3' and body like 'Contexte%'), 'Aurélie apprend que c''est reçu');
-- « offre » ne peut pas devenir le code d'un service
select pg_temp.expect_fail($$insert into public.services (k, nom, court, ordre) values ('offre', 'Offre', 'Offre', 9)$$, 'un service ne s''appelle pas « offre »');

-- ---------- le destinataire d'une demande ne change plus ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', 'rs', 'Visuels', current_date + 10);
update public.reqs set dest = 'programme' where id = '12100000-0000-0000-0000-000000000002';
update public.reqs set dest = 'nimporte' where id = '12100000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.check((select dest from public.reqs where id = '12100000-0000-0000-0000-000000000002') = 'rs', 'Aurélie ne transforme pas sa demande en demande à la Direction du Programme');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000001', 'programme', 'Programme', current_date + 10);
update public.reqs set dest = 'rp' where id = '12100000-0000-0000-0000-000000000003';
select pg_temp.admin();
select pg_temp.check((select dest from public.reqs where id = '12100000-0000-0000-0000-000000000003') = 'programme', 'un chef ne change pas non plus le destinataire');
-- changer le type reste possible pour la personne qui demande
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
update public.reqs set type = 'Contact' where id = '12100000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.check((select type from public.reqs where id = '12100000-0000-0000-0000-000000000002') = 'Contact', 'la personne qui demande change encore le type');

-- ---------- supprimer un relais retiré d'un temps fort actif : ses demandes restent sur le temps fort ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc) values ('12000000-0000-0000-0000-000000000010', 'tf', 'TF actif', current_date + 30, 'chef');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m, tf) values ('12000000-0000-0000-0000-000000000011', 'action', 'Relais RP 1', current_date + 25, 'rp', '{1}', '12000000-0000-0000-0000-000000000010');
insert into public.items (id, kind, t, date, svc, m, tf) values ('12000000-0000-0000-0000-000000000012', 'action', 'Relais RP 2', current_date + 26, 'rp', '{1}', '12000000-0000-0000-0000-000000000010');
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000011', '12000000-0000-0000-0000-000000000011', 'video', 'Rushs', current_date + 10);
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000012', '12000000-0000-0000-0000-000000000011', 'rs', 'Visuels', current_date + 10);
-- Stéphane répond avec un document, rangé sur le temps fort
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
insert into public.links (item, nom, url, req) values ('12000000-0000-0000-0000-000000000010', 'Visuels RS', 'https://kedgebs.sharepoint.com/v', '12100000-0000-0000-0000-000000000012');
update public.reqs set st = 'recue' where id = '12100000-0000-0000-0000-000000000012';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
update public.items set st = 'retire' where id = '12000000-0000-0000-0000-000000000011';
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
delete from public.items where id = '12000000-0000-0000-0000-000000000011';
select pg_temp.admin();
select pg_temp.check((select item = '12000000-0000-0000-0000-000000000010' and st = 'ouverte' and dest = 'video' from public.reqs where id = '12100000-0000-0000-0000-000000000011'),
  'la demande ouverte du relais supprimé passe sur le temps fort, toujours ouverte');
select pg_temp.check((select item = '12000000-0000-0000-0000-000000000010' and st = 'recue' from public.reqs where id = '12100000-0000-0000-0000-000000000012'),
  'la demande reçue passe aussi sur le temps fort, avec sa réponse');
select pg_temp.check((select req = '12100000-0000-0000-0000-000000000012' from public.links where nom = 'Visuels RS'), 'le document reste attaché à sa demande');
select pg_temp.check(not exists (select 1 from public.outbox), 'personne n''est prévenu d''un retrait qui n''a pas eu lieu');

-- un relais d'un temps fort retiré : ses demandes partent avec lui (elles ont été retirées au retrait)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc, st) values ('12000000-0000-0000-0000-000000000020', 'tf', 'TF retiré', current_date + 30, 'chef', 'retire');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m, tf) values ('12000000-0000-0000-0000-000000000021', 'action', 'Relais d''un TF retiré', current_date + 25, 'rp', '{1}', '12000000-0000-0000-0000-000000000020');
insert into public.reqs (item, dest, type, pour) values ('12000000-0000-0000-0000-000000000021', 'video', 'Rushs', current_date + 10);
update public.items set st = 'retire' where id = '12000000-0000-0000-0000-000000000021';
delete from public.items where id = '12000000-0000-0000-0000-000000000021';
select pg_temp.admin();
select pg_temp.check(not exists (select 1 from public.reqs where item in ('12000000-0000-0000-0000-000000000021', '12000000-0000-0000-0000-000000000020')), 'un relais d''un temps fort retiré emporte ses demandes');

-- ---------- supprimer un temps fort : les documents envoyés pour ses relais restent sur les relais ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc) values ('12000000-0000-0000-0000-000000000030', 'tf', 'TF à supprimer', current_date + 30, 'chef');
insert into public.links (item, nom, url) values ('12000000-0000-0000-0000-000000000030', 'Doc du TF', 'https://kedgebs.sharepoint.com/tf');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m, tf) values ('12000000-0000-0000-0000-000000000031', 'action', 'Relais gardé', current_date + 25, 'rp', '{1}', '12000000-0000-0000-0000-000000000030');
insert into public.reqs (id, item, dest, type, pour) values ('12100000-0000-0000-0000-000000000031', '12000000-0000-0000-0000-000000000031', 'rs', 'Visuels', current_date + 10);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
insert into public.links (item, nom, url, req) values ('12000000-0000-0000-0000-000000000030', 'Réponse RS', 'https://kedgebs.sharepoint.com/r', '12100000-0000-0000-0000-000000000031');
update public.reqs set st = 'recue' where id = '12100000-0000-0000-0000-000000000031';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
update public.items set st = 'retire' where id = '12000000-0000-0000-0000-000000000030';
delete from public.items where id = '12000000-0000-0000-0000-000000000030';
select pg_temp.admin();
select pg_temp.check((select item = '12000000-0000-0000-0000-000000000031' and req = '12100000-0000-0000-0000-000000000031' from public.links where nom = 'Réponse RS'),
  'le document envoyé en réponse au relais reste, sur le relais');
select pg_temp.check(not exists (select 1 from public.links where nom = 'Doc du TF'), 'les documents du temps fort lui-même partent avec lui');

-- ---------- un dernier jour seulement pour un temps fort daté au jour près ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, fin, svc, per) values ('tf', 'Sujet avec fin', '2026-11-01', '2026-11-05', 'chef', '{2}')$$, 'un sujet n''a pas de dernier jour');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, fin, flou, svc) values ('tf', 'TF au mois', '2026-11-01', '2026-11-05', 'Nov.', 'chef')$$, 'un temps fort connu au mois n''a pas de dernier jour');
insert into public.items (id, kind, t, date, fin, svc) values ('12000000-0000-0000-0000-000000000040', 'tf', 'Semaine séminaire', '2026-11-09', '2026-11-13', 'chef');
select pg_temp.expect_fail($$update public.items set per = '{2}' where id = '12000000-0000-0000-0000-000000000040'$$, 'un temps fort sur plusieurs jours ne devient pas sujet avec sa fin');
select pg_temp.admin();
