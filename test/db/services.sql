-- Vérifie les corrections des tests par service (migration 0007) : chaque responsable joue son rôle.
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
-- notifications reçues par un compte depuis le dernier vidage de la boîte d'envoi
create function pg_temp.got(u text, titre text) returns boolean language sql as $$
  select exists (select 1 from public.outbox where user_id = u::uuid and title like titre) $$;

-- l'équipe : Julien (chef, média, prévenu de tout), Estelle (chef), Aurélie et Hugo (RP), Stéphane (RS), Louise (Vidéo)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'julien.s@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'estelle.s@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'aurelie.s@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000c4', 'hugo.s@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000c5', 'stephane.s@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000c6', 'louise.s@kedgebs.com');
update public.profiles set chef = true, media = true, notif_all = true where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set chef = true where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set svc = 'rp' where id in ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4');
update public.profiles set svc = 'rs' where id = '00000000-0000-0000-0000-0000000000c5';
update public.profiles set svc = 'video' where id = '00000000-0000-0000-0000-0000000000c6';

-- =====================================================================
-- 1. Une action retirée : ses demandes ouvertes sont retirées et le service sollicité est prévenu
-- =====================================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
insert into public.items (id, kind, t, date, svc, m) values ('5e000000-0000-0000-0000-000000000001', 'action', 'Live annulé', current_date + 20, 'rs', '{2}');
insert into public.reqs (id, item, dest, type, pour) values
  ('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000001', 'video', 'Rushs', current_date + 10),
  ('5e000000-0000-0000-0000-0000000000f2', '5e000000-0000-0000-0000-000000000001', 'rp', 'Contact', current_date + 10);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
update public.reqs set st = 'recue', reponse = 'Le contact est dans le dossier' where id = '5e000000-0000-0000-0000-0000000000f2';
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
update public.items set st = 'retire' where id = '5e000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '5e000000-0000-0000-0000-0000000000f1') = 'annulee', 'Stéphane retire son live : sa demande de rushs est retirée');
select pg_temp.check((select st = 'recue' and reponse = 'Le contact est dans le dossier' from public.reqs where id = '5e000000-0000-0000-0000-0000000000f2'), 'la demande déjà reçue garde sa réponse');
select pg_temp.check((select body from public.outbox where user_id = '00000000-0000-0000-0000-0000000000c6' and title = 'Demande retirée') like '%a retiré « Live annulé » : plus besoin de Rushs',
  'Louise est prévenue : plus besoin des rushs');
select pg_temp.check(exists (select 1 from public.journal where item = '5e000000-0000-0000-0000-000000000001' and kind = 'retrait'), 'le retrait de la demande est dans l''historique');

-- un chef retire l'action d'un service : même chose
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
insert into public.items (id, kind, t, date, svc, m) values ('5e000000-0000-0000-0000-000000000002', 'action', 'Film annulé', current_date + 20, 'video', '{3}');
insert into public.reqs (id, item, dest, type, pour) values ('5e000000-0000-0000-0000-0000000000f3', '5e000000-0000-0000-0000-000000000002', 'chef', 'Programme', current_date + 10);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
update public.items set st = 'retire' where id = '5e000000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '5e000000-0000-0000-0000-0000000000f3') = 'annulee', 'Estelle retire le film de Louise : la demande aux chefs est retirée');

-- un relais retiré d'un temps fort encore actif : ses demandes servent au temps fort et restent ouvertes
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.items (id, kind, t, date, svc) values ('5e000000-0000-0000-0000-000000000010', 'tf', 'Salon Studyrama', current_date + 40, 'chef');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.items (id, kind, t, date, svc, m, tf) values ('5e000000-0000-0000-0000-000000000011', 'action', 'CP Studyrama', current_date + 30, 'rp', '{1}', '5e000000-0000-0000-0000-000000000010');
insert into public.reqs (id, item, dest, type, pour) values ('5e000000-0000-0000-0000-0000000000f4', '5e000000-0000-0000-0000-000000000011', 'rs', 'Visuels', current_date + 20);
update public.items set st = 'retire' where id = '5e000000-0000-0000-0000-000000000011';
select pg_temp.admin();
select pg_temp.check((select st from public.reqs where id = '5e000000-0000-0000-0000-0000000000f4') = 'ouverte', 'un relais retiré d''un temps fort actif : la demande reste pour le temps fort');
update public.items set st = 'planifie' where id = '5e000000-0000-0000-0000-000000000011';

-- =====================================================================
-- 5b. Une demande reçue ne se rouvre pas et ne se retire plus
-- =====================================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
update public.reqs set st = 'recue', reponse = 'Premier' where id = '5e000000-0000-0000-0000-0000000000f4';
update public.reqs set st = 'ouverte' where id = '5e000000-0000-0000-0000-0000000000f4';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
update public.reqs set st = 'annulee' where id = '5e000000-0000-0000-0000-0000000000f4';
select pg_temp.admin();
select pg_temp.check((select st = 'recue' and reponse = 'Premier' from public.reqs where id = '5e000000-0000-0000-0000-0000000000f4'), 'une demande reçue reste reçue, avec sa réponse');

-- =====================================================================
-- 2. Rappel : une demande retirée ne compte plus comme « déjà demandé »
-- =====================================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
insert into public.items (id, kind, t, date, svc, m) values ('5e000000-0000-0000-0000-000000000003', 'action', 'Film campus', current_date + 15, 'video', '{3}');
insert into public.reqs (id, item, dest, type, pour) values ('5e000000-0000-0000-0000-0000000000f5', '5e000000-0000-0000-0000-000000000003', 'rp', 'Contact', current_date + 10);
select pg_temp.admin();
delete from public.outbox; select public.queue_reminders();
select pg_temp.check(not pg_temp.got('00000000-0000-0000-0000-0000000000c6', 'J-15 : Film campus'), 'Louise a demandé : pas de rappel J-15');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
update public.reqs set st = 'annulee' where id = '5e000000-0000-0000-0000-0000000000f5';
select pg_temp.admin();
delete from public.outbox; select public.queue_reminders();
select pg_temp.check(pg_temp.got('00000000-0000-0000-0000-0000000000c6', 'J-15 : Film campus'), 'Louise retire sa demande : le rappel J-15 revient');

-- =====================================================================
-- 3. Réponse avec un document : la personne qui a demandé reçoit une seule notification
-- =====================================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.reqs (id, item, dest, type, pour) values ('5e000000-0000-0000-0000-0000000000f6', '5e000000-0000-0000-0000-000000000011', 'video', 'Rushs', current_date + 20);
select pg_temp.admin();
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
insert into public.links (item, nom, url, req) values ('5e000000-0000-0000-0000-000000000010', 'Rushs', 'https://kedgebs.sharepoint.com/rushs', '5e000000-0000-0000-0000-0000000000f6');
update public.reqs set st = 'recue', reponse = 'Les rushs sont là' where id = '5e000000-0000-0000-0000-0000000000f6';
select pg_temp.admin();
select pg_temp.check((select count(*) from public.outbox where user_id = '00000000-0000-0000-0000-0000000000c3') = 1 and pg_temp.got('00000000-0000-0000-0000-0000000000c3', 'Éléments reçus'),
  'Aurélie reçoit seulement « Éléments reçus »');
select pg_temp.check(pg_temp.got('00000000-0000-0000-0000-0000000000c4', 'Nouveau document') and pg_temp.got('00000000-0000-0000-0000-0000000000c1', 'Nouveau document'),
  'Hugo (RP) et Julien voient toujours le nouveau document');

-- =====================================================================
-- 5a. Passer en visiteur garde la règle des droits
-- =====================================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_fail($$update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-0000000000c1'$$, 'Estelle (pas média) passe Julien en visiteur');
select pg_temp.expect_fail($$update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-0000000000c2'$$, 'Estelle se passe elle-même en visiteur');
update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-0000000000c4';
select pg_temp.admin();
select pg_temp.check((select media and chef from public.profiles where id = '00000000-0000-0000-0000-0000000000c1')
  and (select chef and not visiteur from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'), 'Julien et Estelle gardent leurs droits');
select pg_temp.check((select visiteur and svc is null from public.profiles where id = '00000000-0000-0000-0000-0000000000c4'), 'Estelle passe Hugo en visiteur');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
update public.profiles set visiteur = false, svc = 'rp' where id = '00000000-0000-0000-0000-0000000000c4';
update public.profiles set visiteur = true where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.admin();
select pg_temp.check((select visiteur and not chef from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'), 'Julien (média) passe Estelle en visiteur');
