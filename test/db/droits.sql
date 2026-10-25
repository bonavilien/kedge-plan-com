-- QA droits, 2e passe (après 0004_corrections.sql). À lancer après test/db/run.sh, sur kplan_test :
--   psql ... -d kplan_test -f test/db/droits2.sql
-- Chaque ligne décrit le comportement ATTENDU ; un écart s'affiche « BUG » à la fin (le script ne s'arrête pas).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set J '00000000-0000-0000-0000-000000000001'
\set E '00000000-0000-0000-0000-000000000002'
\set A '00000000-0000-0000-0000-000000000003'
\set S '00000000-0000-0000-0000-000000000004'
\set N '00000000-0000-0000-0000-000000000005'

create temp table qa (n serial, ok boolean, label text, info text);
grant all on qa to authenticated, anon; grant all on sequence qa_n_seq to authenticated, anon;

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
-- exécute q : 'n=<lignes>' ou 'ERR <sqlstate> <message>'
create function pg_temp.x(q text) returns text language plpgsql as $$
declare n int;
begin
  begin execute q; get diagnostics n = row_count;
  exception when others then return 'ERR ' || sqlstate || ' ' || sqlerrm; end;
  return 'n=' || n;
end $$;
create function pg_temp.ck(c boolean, label text, info text default '') returns void language plpgsql as $$
begin insert into qa (ok, label, info) values (coalesce(c, false), label, info); end $$;
-- attendu : refusé (erreur) ou sans effet
create function pg_temp.no(q text, label text) returns void language plpgsql as $$
declare r text := pg_temp.x(q);
begin perform pg_temp.ck(r like 'ERR%' or r = 'n=0', label, r); end $$;
-- attendu : passe et touche au moins une ligne
create function pg_temp.yes(q text, label text) returns void language plpgsql as $$
declare r text := pg_temp.x(q);
begin perform pg_temp.ck(r like 'n=%' and r <> 'n=0', label, r); end $$;
create function pg_temp.v(q text) returns text language plpgsql as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------- comptes et fiches de départ (administration) ----------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'media.rp@kedgebs.com'),   -- RP + média, pas chef
  ('00000000-0000-0000-0000-0000000000d3', 'sansprofil@kedgebs.com'), -- profil effacé
  ('00000000-0000-0000-0000-0000000000d4', 'video@kedgebs.com'),
  ('00000000-0000-0000-0000-0000000000d5', 'media.seul@kedgebs.com'); -- média sans service, pas chef
update public.profiles set svc = 'rp', media = true where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set svc = 'video' where id = '00000000-0000-0000-0000-0000000000d4';
update public.profiles set media = true where id = '00000000-0000-0000-0000-0000000000d5';
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000d3';
insert into public.items (id, kind, t, date, svc, author, cc) values
  ('d0000000-0000-0000-0000-000000000001', 'action', 'Action RP', current_date + 20, 'rp', :'A', '{video}'),
  ('d0000000-0000-0000-0000-000000000002', 'action', 'Action RS', current_date + 20, 'rs', :'S', '{}'),
  ('d0000000-0000-0000-0000-000000000003', 'action', 'Action chef', current_date + 20, 'chef', :'J', '{}'),
  ('d0000000-0000-0000-0000-000000000005', 'tf', 'TF chef', current_date + 40, 'chef', :'J', '{}'),
  ('d0000000-0000-0000-0000-000000000006', 'tf', 'TF 2', current_date + 45, 'chef', :'J', '{}');
insert into public.items (id, kind, t, date, svc, partner, author) values
  ('d0000000-0000-0000-0000-000000000004', 'action', 'Partenariat', current_date + 20, 'chef', 'major', :'J');
insert into public.blocks (id, item, why, author) values
  ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'Pas de BAT', :'J'),
  ('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Pas de visuels', :'S'),
  ('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Contact absent', :'S'),
  ('b0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'Pas de date', :'J');
insert into public.reqs (id, item, asker, dest, type, pour) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', :'S', 'rp', 'Visuels', current_date + 10),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', :'S', 'rp', 'Contact', current_date + 10);
insert into public.links (id, item, nom, url, author) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Doc RS', 'https://x.sharepoint.com/1', :'S');
insert into public.push_subs (user_id, endpoint, p256dh, auth) values (:'A', 'https://push.example/partage', 'k', 'a');

-- ===================== Aurélie (RP) : fiches =====================
select pg_temp.as_user(:'A');
select pg_temp.yes($$update public.items set t = 'Action RP v2' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'RP modifie son action');
select pg_temp.no($$update public.items set svc = 'rs' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'RP passe son action à RS');
select pg_temp.no($$update public.items set svc = 'chef' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'RP passe son action au chef');
select pg_temp.no($$update public.items set partner = 'major' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'RP transforme son action en partenariat');
select pg_temp.no($$update public.items set t = 'x' where id = 'd0000000-0000-0000-0000-000000000003'$$, 'RP modifie une action chef');
select pg_temp.no($$update public.items set t = 'x' where id = 'd0000000-0000-0000-0000-000000000005'$$, 'RP modifie un TF chef');
select pg_temp.no($$delete from public.items where id = 'd0000000-0000-0000-0000-000000000001'$$, 'RP efface son action');
select pg_temp.yes($$insert into public.items (id, kind, t, date, svc, tf, author, at) values ('d0000000-0000-0000-0000-0000000000a1', 'action', 'Relais RP', current_date + 30, 'rp', 'd0000000-0000-0000-0000-000000000005', auth.uid(), now() - interval '300 days')$$, 'RP ajoute un relais sur un TF chef (at falsifié)');
select pg_temp.ck(pg_temp.v($$select (at > now() - interval '1 minute')::text from public.items where id = 'd0000000-0000-0000-0000-0000000000a1'$$) = 'true', 'insert : at falsifié remplacé par now()');
select pg_temp.no($$insert into public.items (kind, t, date, svc, author) values ('action', 'Auteur falsifié', current_date + 30, 'rp', '00000000-0000-0000-0000-000000000001')$$, 'RP publie au nom de Julien');
select pg_temp.x($$update public.items set author = '00000000-0000-0000-0000-000000000001', at = now() - interval '200 days', kind = 'tf' where id = 'd0000000-0000-0000-0000-000000000001'$$);
select pg_temp.ck(pg_temp.v($$select author::text || '/' || kind || '/' || (at > now() - interval '1 day')::text from public.items where id = 'd0000000-0000-0000-0000-000000000001'$$) = '00000000-0000-0000-0000-000000000003/action/true', 'update : author/at/kind figés',
  pg_temp.v($$select author::text || '/' || kind || '/' || at from public.items where id = 'd0000000-0000-0000-0000-000000000001'$$));
-- autre chemin : upsert (insert ... on conflict do update)
select pg_temp.x($$insert into public.items (id, kind, t, date, svc, author) values ('d0000000-0000-0000-0000-000000000001', 'tf', 'upsert', current_date, 'rp', auth.uid()) on conflict (id) do update set author = excluded.author, kind = excluded.kind, at = '2020-01-01'$$);
select pg_temp.ck(pg_temp.v($$select author::text || '/' || kind || '/' || (at > '2021-01-01')::text from public.items where id = 'd0000000-0000-0000-0000-000000000001'$$) = '00000000-0000-0000-0000-000000000003/action/true', 'upsert : author/at/kind figés');
select pg_temp.no($$insert into public.items (id, kind, t, date, svc, author) values ('d0000000-0000-0000-0000-000000000003', 'action', 'x', current_date, 'rp', auth.uid()) on conflict (id) do update set t = 'piraté par upsert'$$, 'RP modifie l''action chef par upsert');
select pg_temp.no($$update public.items set id = gen_random_uuid() where id = 'd0000000-0000-0000-0000-0000000000a1'$$, 'RP change l''identifiant de sa fiche');
-- cohérence
select pg_temp.no($$insert into public.items (kind, t, date, svc, tf, author) values ('action', 'Lié à une action', current_date + 30, 'rp', 'd0000000-0000-0000-0000-000000000001', auth.uid())$$, 'tf vers une action refusé');
select pg_temp.no($$insert into public.items (id, kind, t, date, svc, tf, author) values ('d0000000-0000-0000-0000-0000000000a9', 'tf', 'Lié à lui-même', current_date + 30, 'rp', 'd0000000-0000-0000-0000-0000000000a9', auth.uid())$$, 'tf vers soi-même refusé');
select pg_temp.no($$update public.items set tf = 'd0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'update tf vers une action refusé');
select pg_temp.no($$insert into public.items (kind, t, date, svc, m, author) values ('action', 'msg 6', current_date + 30, 'rp', '{6}', auth.uid())$$, 'message 6 refusé');
select pg_temp.no($$insert into public.items (kind, t, date, svc, m, author) values ('action', 'msg null', current_date + 30, 'rp', array[null]::text[], auth.uid())$$, 'message null refusé');
select pg_temp.x($$update public.items set m = '{1,INC}' where id = 'd0000000-0000-0000-0000-000000000001'$$);
select pg_temp.ck(pg_temp.v($$select m::text from public.items where id = 'd0000000-0000-0000-0000-000000000001'$$) = '{INC}', 'm {1,INC} ramené à {INC}');
select pg_temp.no($$update public.services set nom = 'x'$$, 'RP renomme un service');
select pg_temp.no($$update public.periods set au = '2030-01-01' where n = 5$$, 'RP change une période');
select pg_temp.no($$update public.meta set v = '2020-01-01' where k = 'last_meeting'$$, 'RP change la dernière réunion');
select pg_temp.no($$insert into public.journal (item, kind) values ('d0000000-0000-0000-0000-000000000001', 'modif')$$, 'RP écrit le journal');
select pg_temp.no($$update public.journal set diff = '{}'$$, 'RP réécrit le journal');
select pg_temp.no($$delete from public.journal$$, 'RP efface le journal');
select pg_temp.no($$insert into public.outbox (user_id, title) values ('00000000-0000-0000-0000-000000000001', 'spam')$$, 'RP écrit la boîte d''envoi');
select pg_temp.no($$select 1 from public.outbox$$, 'RP lit la boîte d''envoi');
select pg_temp.no($$select 1 from public.answers where user_id <> auth.uid()$$, 'RP lit les réponses des autres');
select pg_temp.no($$update public.profiles set nom = 'Aurélie' where id = auth.uid()$$, 'RP modifie son profil');
select pg_temp.no($$insert into public.partners (nom) values ('Partenaire RP')$$, 'RP ajoute un partenaire');
select pg_temp.no($$select public.renotify('d0000000-0000-0000-0000-000000000002', 'spam')$$, 'RP relance une action RS');
select pg_temp.no($$select public.queue_reminders()$$, 'RP lance les rappels');
select pg_temp.no($$select public.notify(array['00000000-0000-0000-0000-000000000001'::uuid], 'spam', '', '')$$, 'RP appelle notify');
-- documents
select pg_temp.no($$insert into public.links (item, nom, url, author) values ('d0000000-0000-0000-0000-000000000001', 'x', 'https://a.b/c', '00000000-0000-0000-0000-000000000001')$$, 'RP pose un document au nom de Julien');
select pg_temp.yes($$insert into public.links (id, item, nom, url, at) values ('e0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'Daté', 'https://a.b/c', '2020-01-01')$$, 'RP pose un document (at falsifié)');
select pg_temp.ck(pg_temp.v($$select (at > now() - interval '1 day')::text from public.links where id = 'e0000000-0000-0000-0000-0000000000a1'$$) = 'true', 'document : at falsifié remplacé par now()',
  pg_temp.v($$select at::text from public.links where id = 'e0000000-0000-0000-0000-0000000000a1'$$));
select pg_temp.no($$insert into public.links (item, nom, url) values ('d0000000-0000-0000-0000-000000000001', 'http', 'http://a.b/c')$$, 'document en http:// refusé (l''appli exige https)');
select pg_temp.no($$update public.links set url = 'https://evil' where id = 'e0000000-0000-0000-0000-000000000001'$$, 'RP réécrit le lien de Stéphane');
select pg_temp.no($$delete from public.links where id = 'e0000000-0000-0000-0000-000000000001'$$, 'RP retire le document de Stéphane');
-- demandes reçues par RP : marquer reçue oui, réécrire non
select pg_temp.yes($$update public.reqs set st = 'recue' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'RP marque reçue une demande à RP');
select pg_temp.x($$update public.reqs set asker = auth.uid(), type = 'Rushs', dest = 'video', pour = current_date + 99, quoi = 'x', item = 'd0000000-0000-0000-0000-000000000003', at = '2020-01-01' where id = 'c0000000-0000-0000-0000-000000000002'$$);
select pg_temp.ck(pg_temp.v($$select concat_ws('/', asker, type, dest, pour - current_date, quoi, item, (at > '2021-01-01')) from public.reqs where id = 'c0000000-0000-0000-0000-000000000002'$$)
  = '00000000-0000-0000-0000-000000000004/Contact/rp/10//d0000000-0000-0000-0000-000000000002/t', 'service sollicité : demande figée');
-- blocages : le service porteur lève, sans réécrire
select pg_temp.yes($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-000000000002'$$, 'RP lève un blocage sur son action');
select pg_temp.x($$update public.blocks set leve = true, why = 'rien', item = 'd0000000-0000-0000-0000-000000000002', author = auth.uid(), at = '2020-01-01' where id = 'b0000000-0000-0000-0000-000000000003'$$);
select pg_temp.ck(pg_temp.v($$select concat_ws('/', why, item, author, (at > '2021-01-01')) from public.blocks where id = 'b0000000-0000-0000-0000-000000000003'$$)
  = 'Contact absent/d0000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000004/t', 'blocage figé (why/item/author/at)');
select pg_temp.no($$update public.blocks set leve = false where id = 'b0000000-0000-0000-0000-000000000002'$$, 'RP remet un blocage levé');
select pg_temp.no($$delete from public.blocks where id = 'b0000000-0000-0000-0000-000000000002'$$, 'RP efface un blocage');
select pg_temp.yes($$insert into public.blocks (id, item, why, at) values ('b0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000002', 'daté', '2020-01-01')$$, 'RP signale un blocage (at falsifié)');
select pg_temp.ck(pg_temp.v($$select (at > now() - interval '1 day')::text from public.blocks where id = 'b0000000-0000-0000-0000-0000000000a1'$$) = 'true', 'blocage : at falsifié remplacé par now()',
  pg_temp.v($$select at::text from public.blocks where id = 'b0000000-0000-0000-0000-0000000000a1'$$));
select pg_temp.admin();

-- ===================== Stéphane (RS, auteur des blocages et demandeur) =====================
select pg_temp.as_user(:'S');
select pg_temp.x($$update public.blocks set item = 'd0000000-0000-0000-0000-000000000003', why = 'déplacé' where id = 'b0000000-0000-0000-0000-000000000003'$$);
select pg_temp.ck(pg_temp.v($$select item::text from public.blocks where id = 'b0000000-0000-0000-0000-000000000003'$$) = 'd0000000-0000-0000-0000-000000000001', 'RS (auteur) ne déplace pas son blocage');
select pg_temp.yes($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-000000000003'$$, 'RS lève son propre blocage');
select pg_temp.x($$update public.reqs set pour = current_date + 5, item = 'd0000000-0000-0000-0000-000000000003', asker = '00000000-0000-0000-0000-000000000001' where id = 'c0000000-0000-0000-0000-000000000002'$$);
select pg_temp.ck(pg_temp.v($$select concat_ws('/', pour - current_date, item, asker) from public.reqs where id = 'c0000000-0000-0000-0000-000000000002'$$)
  = '5/d0000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000004', 'demandeur : deadline changée, item/asker figés');
-- doublon par un autre chemin : changer le type d'une demande ouverte pour en recopier une autre
reset role; update public.reqs set st = 'ouverte' where id = 'c0000000-0000-0000-0000-000000000001'; select pg_temp.as_user(:'S');
select pg_temp.no($$update public.reqs set type = 'Visuels' where id = 'c0000000-0000-0000-0000-000000000002'$$, 'demandeur crée un doublon ouvert en changeant le type');
-- push : téléphone partagé
select pg_temp.yes($$select public.save_push('https://push.example/partage', 'k2', 'a2')$$, 'RS active les notifications sur un téléphone abonné pour RP');
select pg_temp.no($$select 1 from public.push_subs where user_id <> auth.uid()$$, 'RS voit les abonnements des autres');
select pg_temp.no($$insert into public.push_subs (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-000000000001', 'https://push.example/forge', 'k', 'a')$$, 'RS abonne le téléphone au nom de Julien');
select pg_temp.admin();
select pg_temp.ck((select user_id from public.push_subs where endpoint = 'https://push.example/partage') = :'S', 'save_push : téléphone passé à RS');

-- ===================== Nouveau (sans service, lecture seule) =====================
select pg_temp.as_user(:'N');
select pg_temp.ck(public.my_svc() is null, 'my_svc() = null sans service');
select pg_temp.no($$insert into public.items (kind, t, date, svc, author) values ('action', 'x', current_date + 9, '-', auth.uid())$$, 'sans service publie svc ''-''');
select pg_temp.no($$insert into public.items (kind, t, date, svc, author) values ('tf', 'x', current_date + 9, 'chef', auth.uid())$$, 'sans service publie un TF chef');
select pg_temp.no($$update public.items set st = 'retire' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'sans service retire une action');
select pg_temp.no($$insert into public.links (item, nom, url) values ('d0000000-0000-0000-0000-000000000001', 'x', 'https://a.b/c')$$, 'sans service ajoute un document');
select pg_temp.no($$update public.reqs set st = 'recue' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'sans service répond à une demande');
select pg_temp.no($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-000000000001'$$, 'sans service lève un blocage');
select pg_temp.yes($$insert into public.reqs (item, dest, type, pour) values ('d0000000-0000-0000-0000-000000000001', 'rp', 'Contexte', current_date + 3)$$, 'sans service demande des éléments');
select pg_temp.no($$insert into public.reqs (item, asker, dest, type, pour) values ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'rp', 'Programme', current_date + 3)$$, 'demande au nom d''Aurélie');
select pg_temp.no($$insert into public.reqs (item, dest, type, pour) values ('d0000000-0000-0000-0000-000000000001', 'inconnu', 'Programme', current_date + 3)$$, 'demande à un service inexistant');
-- limite de 10 demandes / 10 min contournée en antidatant « at » à l'insertion ?
select pg_temp.x($$insert into public.reqs (id, item, dest, type, pour, at) values ('c0000000-0000-0000-0000-0000000000f0', 'd0000000-0000-0000-0000-000000000002', 'rs', 'Autre', current_date + 3, '2020-01-01')$$);
select pg_temp.ck(pg_temp.v($$select coalesce((at > now() - interval '1 day')::text, 'absente') from public.reqs where id = 'c0000000-0000-0000-0000-0000000000f0'$$) = 'true', 'demande : at falsifié à l''insertion remplacé par now()',
  pg_temp.v($$select at::text from public.reqs where id = 'c0000000-0000-0000-0000-0000000000f0'$$));
do $$ declare i int; ok int := 0; begin
  for i in 1..14 loop
    begin
      insert into public.reqs (item, dest, type, pour, at) values ('d0000000-0000-0000-0000-000000000002', 'rs', 'Spam ' || i, current_date + 3, now() - interval '1 hour');
      ok := ok + 1;
    exception when others then null; end;
  end loop;
  perform pg_temp.ck(ok <= 10, 'limite 10 demandes / 10 min tient malgré at antidaté', ok || ' demandes acceptées sur 14');
end $$;
select pg_temp.yes($$insert into public.blocks (item, why) values ('d0000000-0000-0000-0000-000000000002', 'je signale')$$, 'sans service signale un blocage');
select pg_temp.admin();
select pg_temp.ck((select count(*) from public.outbox where title = 'Demande d''éléments' and body like '%Spam%') <= 10, 'pas plus de 10 notifications de demande en rafale',
  (select count(*) from public.outbox where title = 'Demande d''éléments' and body like '%Spam%')::text || ' notifications « Spam »');

-- ===================== compte sans profil =====================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.no($$insert into public.items (kind, t, date, svc, author) values ('action', 'x', current_date, 'rp', auth.uid())$$, 'sans profil publie');
select pg_temp.no($$insert into public.reqs (item, dest, type, pour) values ('d0000000-0000-0000-0000-000000000001', 'rp', 'Contexte', current_date + 3)$$, 'sans profil demande');
select pg_temp.no($$select public.save_push('https://push.example/sansprofil', 'k', 'a')$$, 'sans profil s''abonne');
select pg_temp.admin();

-- ===================== RP + média, pas chef =====================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.yes($$insert into public.items (kind, t, date, svc, partner, author) values ('action', 'Partenariat par média', current_date + 10, 'chef', 'major', auth.uid())$$, 'média non chef publie un partenariat (svc chef)');
select pg_temp.yes($$update public.items set t = 'Partenariat modifié' where id = 'd0000000-0000-0000-0000-000000000004'$$, 'média modifie un partenariat');
select pg_temp.yes($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-000000000001'$$, 'média lève un blocage de partenariat');
select pg_temp.yes($$select public.renotify('d0000000-0000-0000-0000-000000000004', 'date : changée')$$, 'média relance un partenariat');
select pg_temp.yes($$insert into public.partners (k, nom) values ('qa_p', 'Partenaire QA')$$, 'média ajoute un partenaire');
select pg_temp.no($$update public.profiles set media = true where id = '00000000-0000-0000-0000-000000000003'$$, 'média non chef donne le droit média (pas chef : pas d''Équipe)');
select pg_temp.no($$update public.items set t = 'x' where id = 'd0000000-0000-0000-0000-000000000002'$$, 'média RP modifie une action RS');
select pg_temp.admin();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
select pg_temp.yes($$insert into public.items (kind, t, date, svc, partner, author) values ('action', 'Partenariat média sans service', current_date + 10, 'chef', 'major', auth.uid())$$, 'média sans service publie un partenariat');
select pg_temp.yes($$insert into public.links (item, nom, url) values ('d0000000-0000-0000-0000-000000000004', 'BAT', 'https://a.b/bat')$$, 'média sans service ajoute un document');
select pg_temp.no($$insert into public.items (kind, t, date, svc, author) values ('action', 'action chef', current_date + 10, 'chef', auth.uid())$$, 'média sans service publie une action chef');
select pg_temp.admin();

-- ===================== Louise (vidéo) =====================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.no($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-0000000000a1'$$, 'vidéo lève un blocage d''une action RS');
select pg_temp.no($$update public.items set t = 'x' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'vidéo (cité) modifie l''action RP');
select pg_temp.admin();

-- ===================== Estelle (chef, pas média) =====================
select pg_temp.as_user(:'E');
select pg_temp.no($$update public.items set t = 'x' where id = 'd0000000-0000-0000-0000-000000000004'$$, 'Estelle modifie un partenariat');
select pg_temp.no($$update public.items set st = 'retire' where id = 'd0000000-0000-0000-0000-000000000004'$$, 'Estelle retire un partenariat');
select pg_temp.no($$update public.items set partner = 'major' where id = 'd0000000-0000-0000-0000-000000000002'$$, 'Estelle transforme une action en partenariat');
select pg_temp.no($$insert into public.items (kind, t, date, svc, partner, author) values ('action', 'x', current_date + 10, 'chef', 'major', auth.uid())$$, 'Estelle publie un partenariat');
select pg_temp.no($$select public.renotify('d0000000-0000-0000-0000-000000000004', 'x')$$, 'Estelle relance un partenariat');
select pg_temp.yes($$update public.blocks set leve = true where id = 'b0000000-0000-0000-0000-000000000004'$$, 'Estelle lève un blocage de partenariat (is_chef)');
select pg_temp.yes($$update public.items set svc = 'video' where id = 'd0000000-0000-0000-0000-000000000002'$$, 'Estelle change le service porteur');
select pg_temp.no($$update public.items set svc = 'inexistant' where id = 'd0000000-0000-0000-0000-000000000002'$$, 'Estelle met un service inexistant');
select pg_temp.no($$update public.items set tf = 'd0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000003'$$, 'Estelle lie une action à une action');
select pg_temp.no($$update public.items set tf = 'd0000000-0000-0000-0000-000000000006' where id = 'd0000000-0000-0000-0000-000000000005'$$, 'un TF ne se lie pas à un autre TF (pas de boucle)');
select pg_temp.no($$update public.items set tf = 'd0000000-0000-0000-0000-000000000005' where id = 'd0000000-0000-0000-0000-000000000006'$$, 'boucle TF1 → TF2 → TF1 refusée');
select pg_temp.no($$insert into public.partners (nom) values ('Partenaire Estelle')$$, 'Estelle ajoute un partenaire');
select pg_temp.no($$update public.partners set nom = 'x' where k = 'major'$$, 'Estelle renomme un partenaire');
select pg_temp.no($$update public.profiles set media = true where id = auth.uid()$$, 'Estelle se donne le droit média');
select pg_temp.no($$update public.profiles set media = false where id = '00000000-0000-0000-0000-000000000001'$$, 'Estelle retire le droit média de Julien');
select pg_temp.no($$update public.profiles set chef = false where id = auth.uid()$$, 'Estelle retire son propre droit chef');
select pg_temp.yes($$update public.profiles set nom = 'Estelle', fonction = 'Offre', svc = 'rs', notif_all = true, chef = true, media = false where id = auth.uid()$$, 'Estelle enregistre son profil (mêmes chef/média, comme l''appli)');
select pg_temp.yes($$update public.profiles set svc = 'rs' where id = '00000000-0000-0000-0000-000000000005'$$, 'Estelle range Nouveau dans RS');
select pg_temp.yes($$update public.meta set v = '2026-10-20' where k = 'last_meeting'$$, 'Estelle note la réunion');
select pg_temp.yes($$update public.reqs set dest = 'video' where id = 'c0000000-0000-0000-0000-000000000002'$$, 'Estelle (chef) réoriente une demande');
select pg_temp.no($$update public.periods set au = '2026-11-15' where n = 1$$, 'période qui chevauche refusée');
select pg_temp.no($$insert into public.periods (n, nom, du, au) values (9, 'x', '2027-07-01', '2027-08-31')$$, 'nouvelle période qui chevauche refusée');
select pg_temp.yes($$update public.periods set au = '2026-10-30' where n = 1$$, 'période raccourcie');
select pg_temp.yes($$update public.periods set au = case n when 1 then '2026-10-31'::date else au end, du = case n when 2 then '2026-11-01'::date else du end where n in (1, 2)$$, 'déplacer la frontière 1/2 en une seule requête');
select pg_temp.yes($$update public.periods set au = case n when 1 then '2026-11-10'::date else au end, du = case n when 2 then '2026-11-11'::date else du end where n in (1, 2)$$, 'avancer la frontière 1/2 en une seule requête (état final valide)');
select pg_temp.admin();
update public.profiles set svc = null where id = :'N';
update public.profiles set svc = null, notif_all = false, fonction = 'Responsable de l''offre' where id = :'E';
update public.periods set au = '2026-10-31' where n = 1; update public.periods set du = '2026-11-01' where n = 2;

-- ===================== Julien (chef + média) =====================
select pg_temp.as_user(:'J');
select pg_temp.no($$update public.profiles set chef = false where id = auth.uid()$$, 'Julien retire son propre droit chef');
select pg_temp.yes($$update public.profiles set media = true where id = '00000000-0000-0000-0000-000000000002'$$, 'Julien donne le droit média à Estelle');
select pg_temp.yes($$update public.profiles set media = false where id = '00000000-0000-0000-0000-000000000002'$$, 'Julien le lui retire');
select pg_temp.yes($$update public.profiles set chef = false where id = '00000000-0000-0000-0000-000000000002'$$, 'Julien retire le droit chef d''Estelle');
select pg_temp.yes($$update public.profiles set chef = true where id = '00000000-0000-0000-0000-000000000002'$$, 'Julien rend le droit chef à Estelle');
select pg_temp.yes($$insert into public.items (kind, t, date, svc, author) values ('action', 'Action chef par Julien', current_date + 12, 'chef', auth.uid())$$, 'Julien publie une action portée par le chef');
-- renommer un service : fiches, citations, demandes suivent ; le service renommé ne doit pas recevoir « Ton service est cité »
select pg_temp.admin(); delete from public.outbox; select pg_temp.as_user(:'J');
select pg_temp.yes($$update public.services set k = 'film' where k = 'video'$$, 'Julien renomme video → film');
select pg_temp.admin();
select pg_temp.ck((select cc::text from public.items where id = 'd0000000-0000-0000-0000-000000000001') = '{film}', 'cc suit le renommage');
select pg_temp.ck((select svc from public.items where id = 'd0000000-0000-0000-0000-000000000002') = 'film', 'items.svc suit le renommage');
select pg_temp.ck((select dest from public.reqs where id = 'c0000000-0000-0000-0000-000000000002') = 'film', 'reqs.dest suit le renommage');
select pg_temp.ck((select svc from public.profiles where id = '00000000-0000-0000-0000-0000000000d4') = 'film', 'profil suit le renommage');
select pg_temp.ck(not exists (select 1 from public.outbox where title = 'Ton service est cité'), 'renommer ne notifie pas « Ton service est cité »',
  (select string_agg(p.nom || ': ' || o.body, ' | ') from public.outbox o join public.profiles p on p.id = o.user_id where o.title = 'Ton service est cité'));
select pg_temp.ck(not exists (select 1 from public.journal where item = 'd0000000-0000-0000-0000-000000000001' and kind = 'modif' and diff ? 'cc' and at > now() - interval '1 second'), '(info) renommer n''écrit pas de « modif » dans l''historique des fiches',
  (select count(*)::text from public.journal where kind = 'modif' and at > now() - interval '1 second'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.yes($$update public.items set note = 'après renommage' where id = 'd0000000-0000-0000-0000-000000000002'$$, 'vidéo modifie encore son action après renommage');
select pg_temp.admin();
-- supprimer un service laisse-t-il des fiches orphelines ?
select pg_temp.as_user(:'J');
select pg_temp.no($$delete from public.services where k = 'film'$$, 'supprimer un service qui porte des fiches est refusé');
select pg_temp.admin();

-- ===================== anonyme (clé publique sans connexion) =====================
set role anon;
select pg_temp.no($$select public.renotify('d0000000-0000-0000-0000-000000000004', 'x')$$, 'anon : renotify');
select pg_temp.no($$select public.save_push('https://push.example/anon', 'k', 'a')$$, 'anon : save_push');
select pg_temp.no($$select public.queue_reminders()$$, 'anon : queue_reminders');
select pg_temp.no($$select public.notify(array['00000000-0000-0000-0000-000000000001'::uuid], 'x', '', '')$$, 'anon : notify');
select pg_temp.no($$select public.flush_outbox()$$, 'anon : flush_outbox');
select pg_temp.no($$select 1 from public.items$$, 'anon : lit les fiches');
select pg_temp.no($$select 1 from public.profiles$$, 'anon : lit les profils');
select pg_temp.no($$insert into public.reqs (item, dest, type, pour) values ('d0000000-0000-0000-0000-000000000001', 'rp', 'x', current_date)$$, 'anon : demande');
select pg_temp.no($$insert into public.items (kind, t, date, svc) values ('action', 'anon', current_date, 'rp')$$, 'anon : publie');
select pg_temp.ck(pg_temp.x($$select public.nom_de('00000000-0000-0000-0000-000000000001')$$) like 'ERR%', '(info) anon : nom_de() ne donne pas les noms', pg_temp.x($$select public.nom_de('00000000-0000-0000-0000-000000000001')$$));
reset role;

-- ===================== Bilan =====================
select n, case when ok then 'OK' else 'BUG' end as res, label, info from qa order by n;
select count(*) filter (where ok) as ok, count(*) filter (where not ok) as bugs from qa;
