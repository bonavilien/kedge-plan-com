-- Vérifie les corrections de 0004 (campagne de tests du 25 octobre 2026), avec les comptes de rules.sql :
-- 1 Julien (chef, média, prévenu de tout), 2 Estelle (chef), 3 Aurélie (RP), 4 Stéphane (RS), 5 Nouveau (sans service).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set J '00000000-0000-0000-0000-000000000001'
\set E '00000000-0000-0000-0000-000000000002'
\set A '00000000-0000-0000-0000-000000000003'
\set S '00000000-0000-0000-0000-000000000004'
\set N '00000000-0000-0000-0000-000000000005'

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
-- revenir au compte d'administration (sans jeton)
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.ok(c boolean, label text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
create function pg_temp.refused(q text, label text) returns void language plpgsql as $$
declare n int;
begin
  begin execute q; get diagnostics n = row_count;
  exception when others then raise notice 'OK refusé : %', label; return; end;
  if n > 0 then raise exception 'ÉCHEC, accepté : %', label; end if;
  raise notice 'OK sans effet : %', label;
end $$;
-- les noms des destinataires de la boîte d'envoi
create function pg_temp.dest() returns text[] language sql as $$
  select coalesce(array_agg(p.nom order by p.nom), '{}') from public.outbox o join public.profiles p on p.id = o.user_id $$;
grant execute on all functions in schema pg_temp to authenticated;
set client_min_messages = notice;

-- ===================== Droits =====================
select pg_temp.as_user(:'N');
select pg_temp.refused($$insert into public.items (kind, t, date, svc) values ('action', 'Fiche fantôme', current_date + 9, '-')$$, 'un compte sans service ne publie pas');
select pg_temp.refused($$insert into public.links (item, nom, url) values ((select id from public.items limit 1), 'X', 'https://x.sharepoint.com/a')$$, 'un compte sans service n''ajoute pas de document');
select pg_temp.admin();

-- Estelle (chef sans média) ne se donne pas le droit média, ne gère pas les partenaires
select pg_temp.as_user(:'E');
select pg_temp.refused($$update public.profiles set media = true where id = '00000000-0000-0000-0000-000000000002'$$, 'Estelle ne se donne pas le droit média');
select pg_temp.refused($$insert into public.partners (nom) values ('Le Monde')$$, 'Estelle ne crée pas de partenaire');
select pg_temp.admin();
-- un compte média non chef publie un partenariat (porté par le chef de projet)
update public.profiles set media = true where id = :'S';
select pg_temp.as_user(:'S');
insert into public.items (id, kind, t, date, svc, partner, m) values ('60000000-0000-0000-0000-000000000001', 'action', 'Guide prépa', current_date + 20, 'chef', 'major', '{4}');
select pg_temp.ok(exists (select 1 from public.items where id = '60000000-0000-0000-0000-000000000001'), 'un compte média non chef publie un partenariat');
select pg_temp.admin();
update public.profiles set media = false where id = :'S';

-- champs figés : auteur et date de création d'une fiche ; demandeur et type d'une demande pour le service sollicité ; texte d'un blocage
select pg_temp.as_user(:'A');
insert into public.items (id, kind, t, date, svc, m, at) values ('60000000-0000-0000-0000-000000000002', 'action', 'CP rentrée', current_date + 20, 'rp', '{1}', '2020-01-01');
update public.items set author = :'J', at = '2020-01-01' where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.ok((select author = :'A' and at > now() - interval '1 minute' from public.items where id = '60000000-0000-0000-0000-000000000002'), 'auteur et date de création ne se réécrivent pas');
select pg_temp.ok((select at > now() - interval '1 minute' from public.journal where item = '60000000-0000-0000-0000-000000000002' and kind = 'creation'), 'le journal note l''heure de la base');
select pg_temp.as_user(:'S');
insert into public.reqs (id, item, dest, type, pour) values ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'rp', 'Visuels', current_date + 10);
select pg_temp.admin();
select pg_temp.as_user(:'A');
update public.reqs set asker = :'A', type = 'Rushs', pour = current_date + 2 where id = '61000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.ok((select asker = :'S' and type = 'Visuels' and pour = current_date + 10 from public.reqs where id = '61000000-0000-0000-0000-000000000001'), 'le service sollicité ne réécrit ni le demandeur, ni le type, ni la deadline');
truncate public.outbox;
select pg_temp.as_user(:'S');
update public.reqs set pour = current_date + 5 where id = '61000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.ok((select pour = current_date + 5 from public.reqs where id = '61000000-0000-0000-0000-000000000001'), 'la personne qui demande change la deadline');
select pg_temp.ok(pg_temp.dest() = '{Aurelie}' and (select title from public.outbox) = 'Nouvelle deadline', 'deadline changée : le service sollicité est prévenu');
select pg_temp.as_user(:'S');
insert into public.blocks (id, item, why) values ('62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Rushs pas reçus');
select pg_temp.admin();
select pg_temp.as_user(:'A');
update public.blocks set why = 'autre chose', item = '60000000-0000-0000-0000-000000000001', leve = true where id = '62000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.ok((select why = 'Rushs pas reçus' and item = '60000000-0000-0000-0000-000000000002' and leve from public.blocks where id = '62000000-0000-0000-0000-000000000001'), 'lever un blocage ne le réécrit pas');

-- téléphone partagé : l'abonnement passe à la personne qui active les notifications
select pg_temp.as_user(:'A');
select public.save_push('https://push.exemple/telephone-partage', 'cle', 'auth');
select pg_temp.admin();
select pg_temp.as_user(:'S');
select public.save_push('https://push.exemple/telephone-partage', 'cle2', 'auth2');
select pg_temp.admin();
select pg_temp.ok((select user_id = :'S' from public.push_subs where endpoint = 'https://push.exemple/telephone-partage'), 'téléphone partagé : l''abonnement passe à Stephane');

-- cohérence : temps fort lié qui en est un, messages connus, « Incontournable » seul
select pg_temp.as_user(:'J');
select pg_temp.refused($$update public.items set tf = '60000000-0000-0000-0000-000000000001' where id = '60000000-0000-0000-0000-000000000002'$$, 'une action ne se lie pas à une autre action');
select pg_temp.refused($$update public.items set m = '{9}' where id = '60000000-0000-0000-0000-000000000002'$$, 'message inconnu refusé');
update public.items set m = '{1,INC}' where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.ok((select m = '{INC}' from public.items where id = '60000000-0000-0000-0000-000000000002'), 'Incontournable reste seul');
select pg_temp.as_user(:'J');
select pg_temp.refused($$update public.periods set au = '2026-11-15' where n = 1$$, 'deux périodes ne se chevauchent pas');
select pg_temp.admin();

-- service renommé : ses fiches suivent, il peut toujours les modifier
update public.services set k = 'presse' where k = 'rp';
select pg_temp.ok((select svc = 'presse' from public.items where id = '60000000-0000-0000-0000-000000000002'), 'service renommé : ses fiches suivent');
update public.services set k = 'rp' where k = 'presse';

-- ===================== Notifications =====================
-- une action posée par Estelle pour RP prévient RP (et Julien, prévenu de tout)
truncate public.outbox;
select pg_temp.as_user(:'E');
insert into public.items (id, kind, t, date, svc, m) values ('60000000-0000-0000-0000-000000000003', 'action', 'Interview directeur', current_date + 40, 'rp', '{5}');
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Aurelie,Julien}', 'action posée par un chef pour RP : RP est prévenu');
-- RS ajouté à « Qui prévenir » après coup
truncate public.outbox;
select pg_temp.as_user(:'E');
update public.items set cc = '{rs}' where id = '60000000-0000-0000-0000-000000000003';
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Stephane}' and (select title from public.outbox) = 'Ton service est cité', 'service ajouté à « Qui prévenir » : prévenu');
-- un document sur une fiche du chef de projet prévient les chefs
insert into public.items (id, kind, t, date, svc, per) values ('60000000-0000-0000-0000-000000000004', 'tf', 'Salle Bloomberg', '2026-09-01', 'chef', '{1}');
truncate public.outbox;
select pg_temp.as_user(:'A');
insert into public.links (item, nom, url) values ('60000000-0000-0000-0000-000000000004', 'Plan', 'https://kedgebs.sharepoint.com/p');
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Estelle,Julien}', 'document sur un sujet du chef de projet : les chefs sont prévenus');
-- retirer une action prévient son service, les services cités et les prévenus de tout
truncate public.outbox;
select pg_temp.as_user(:'E');
update public.items set st = 'retire' where id = '60000000-0000-0000-0000-000000000003';
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Aurelie,Julien,Stephane}' and (select bool_and(title like 'Retiré : %') from public.outbox), 'action retirée : ceux qui la suivaient sont prévenus');
-- éléments reçus notés par la personne qui a demandé : pas de notification à elle-même
truncate public.outbox;
select pg_temp.as_user(:'S');
update public.reqs set st = 'recue' where id = '61000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{}', 'reçu noté par la personne qui a demandé : pas de notification');
-- une demande identique encore ouverte est refusée
select pg_temp.as_user(:'S');
insert into public.reqs (item, dest, type, pour) values ('60000000-0000-0000-0000-000000000002', 'rp', 'Contact', current_date + 10);
select pg_temp.refused($$insert into public.reqs (item, dest, type, pour) values ('60000000-0000-0000-0000-000000000002', 'rp', 'Contact', current_date + 10)$$, 'demande identique encore ouverte refusée');
select pg_temp.admin();
-- relances : un double appui n'écrit qu'une ligne d'historique
select pg_temp.as_user(:'A');
select public.renotify('60000000-0000-0000-0000-000000000002', 'date : 3 nov. → 5 nov.');
select public.renotify('60000000-0000-0000-0000-000000000002', 'date : 3 nov. → 5 nov.');
select pg_temp.admin();
select pg_temp.ok((select count(*) = 1 from public.journal where item = '60000000-0000-0000-0000-000000000002' and kind = 'prevenu'), 'double appui sur Prévenir : une seule ligne d''historique');

-- ===================== Rappels =====================
-- une copie de queue_reminders avec un « aujourd'hui » choisi
create function pg_temp.remind_on(d date) returns int language plpgsql as $f$
declare src text;
begin
  select pg_get_functiondef('public.queue_reminders()'::regprocedure) into src;
  src := replace(src, '(now() at time zone ''Europe/Paris'')::date', quote_literal(d) || '::date');
  src := replace(src, 'FUNCTION public.queue_reminders()', 'FUNCTION pg_temp.qr()');
  execute src;
  return pg_temp.qr();
end $f$;
truncate public.outbox;
insert into public.items (id, kind, t, date, svc, m) values ('63000000-0000-0000-0000-000000000001', 'action', 'Reel alumni', '2026-12-10', 'rs', '{2}');
truncate public.outbox;
-- créée tard : à J-5 d'une action, le rappel J-7 part quand même
select pg_temp.remind_on('2026-12-05');
select pg_temp.ok((select count(*) = 1 and bool_and(title = 'J-5 : Reel alumni') from public.outbox o join public.profiles p on p.id = o.user_id where p.nom = 'Stephane'), 'action créée à J-5 : rappel rattrapé');
select pg_temp.remind_on('2026-12-06');
select pg_temp.ok((select count(*) = 1 from public.outbox), 'pas de second rappel pour le même jalon');
-- action décalée : ses jalons repartent
truncate public.outbox;
update public.items set date = '2027-01-20' where id = '63000000-0000-0000-0000-000000000001';
select pg_temp.remind_on('2027-01-13');
select pg_temp.ok((select count(*) = 1 from public.outbox), 'action décalée : le nouveau J-7 part');
-- des éléments déjà demandés par le service : plus de rappel
truncate public.outbox;
insert into public.items (id, kind, t, date, svc, m) values ('63000000-0000-0000-0000-000000000002', 'action', 'Post Top UP', '2027-02-20', 'rs', '{1}');
select pg_temp.as_user(:'S');
insert into public.reqs (item, dest, type, pour) values ('63000000-0000-0000-0000-000000000002', 'chef', 'Visuels', '2027-02-10');
select pg_temp.admin();
truncate public.outbox;
select pg_temp.remind_on('2027-02-05');
select pg_temp.ok((select count(*) = 0 from public.outbox), 'éléments déjà demandés : pas de rappel');
-- « Pas besoin » vaut pour une date et un jalon
truncate public.outbox;
insert into public.answers (user_id, key, val) values (:'S', '63000000-0000-0000-0000-000000000001-2027-01-20-7', 'non');
update public.items set date = '2027-01-25' where id = '63000000-0000-0000-0000-000000000001';
select pg_temp.remind_on('2027-01-20');
select pg_temp.ok((select count(*) = 1 from public.outbox), '« Pas besoin » ne masque pas les jalons d''une nouvelle date');

-- ===================== Retest (2e passage) =====================
-- un compte sans service ne relance pas
select pg_temp.as_user(:'N');
select pg_temp.refused($$select public.renotify('60000000-0000-0000-0000-000000000002', 'spam')$$, 'un compte sans service ne relance pas');
select pg_temp.admin();
-- double appui sans destinataire : une seule ligne d'historique
insert into public.items (id, kind, t, date, svc, m, author) values ('64000000-0000-0000-0000-000000000001', 'action', 'Seule', current_date + 60, 'video', '{1}', :'J');
update public.profiles set notif_all = false where id = :'J';
select pg_temp.as_user(:'J');
select public.renotify('64000000-0000-0000-0000-000000000001', 'titre : a → b');
select public.renotify('64000000-0000-0000-0000-000000000001', 'titre : a → b');
select pg_temp.admin();
update public.profiles set notif_all = true where id = :'J';
select pg_temp.ok((select count(*) = 1 from public.journal where item = '64000000-0000-0000-0000-000000000001' and kind = 'prevenu'), 'double appui sans destinataire : une ligne d''historique');
-- un chef confie l'action à un autre service : ce service est prévenu
truncate public.outbox;
select pg_temp.as_user(:'E');
update public.items set svc = 'rs' where id = '64000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Stephane}' and (select title from public.outbox) = 'Confié à ton service', 'nouveau service porteur prévenu');
-- un temps fort du chef de projet prévient les autres chefs
truncate public.outbox;
select pg_temp.as_user(:'E');
insert into public.items (id, kind, t, date, svc) values ('64000000-0000-0000-0000-000000000002', 'tf', 'Forum', current_date + 40, 'chef');
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{Julien}', 'temps fort du chef de projet : les autres chefs sont prévenus');
-- partenariat : retrait et blocage vont aux comptes média, pas aux chefs non média
truncate public.outbox;
select pg_temp.as_user(:'A');
insert into public.blocks (item, why) values ('60000000-0000-0000-0000-000000000001', 'Visuels manquants');
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() @> '{Julien}', 'blocage d''un partenariat : le compte média est prévenu');
truncate public.outbox;
update public.profiles set notif_all = false where id = :'J';
select pg_temp.as_user(:'J');
update public.items set st = 'retire' where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.admin();
update public.profiles set notif_all = true where id = :'J';
select pg_temp.ok(not (pg_temp.dest() @> '{Estelle}'), 'partenariat retiré : pas de notification à un chef non média');
-- renommer un service ne prévient personne
truncate public.outbox;
select pg_temp.as_user(:'J');
update public.services set k = 'social' where k = 'rs';
update public.services set k = 'rs' where k = 'social';
select pg_temp.admin();
select pg_temp.ok(pg_temp.dest() = '{}', 'service renommé : aucune notification');

select 'Corrections : tout est bon';
