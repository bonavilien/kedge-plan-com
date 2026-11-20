-- Vérifie la migration 0031 (2.6.0, Résultats et budget) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/resultats.sh
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
\set PIL '''24000000-0000-0000-0000-000000000001'''
\set RS '''24000000-0000-0000-0000-000000000002'''
\set VIS '''24000000-0000-0000-0000-000000000003'''
\set IT '''24100000-0000-0000-0000-000000000001'''
\set PA '''24100000-0000-0000-0000-000000000002'''
insert into auth.users (id, email) values (:PIL, 'pilote.r@example.com'), (:RS, 'rs.r@example.com'), (:VIS, 'vis.r@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true, media = true where id = :PIL;
update public.profiles set nom = 'Stephane', svc = 'rs' where id = :RS;
update public.profiles set nom = 'Visiteur', visiteur = true where id = :VIS;
insert into public.partners (k, nom) values ('so', 'Sud Ouest') on conflict do nothing;

select pg_temp.as_user(:PIL);
insert into public.items (id, kind, t, date, svc, m, st) values (:IT, 'action', 'Post LinkedIn', current_date - 3, 'rs', '{2}', 'diffuse');
insert into public.items (id, kind, t, date, svc, m, st, partner) values (:PA, 'action', 'Encart Sud Ouest', current_date - 2, 'rp', '{1}', 'diffuse', 'so');
select pg_temp.admin();

-- 1. une fiche neuve n'a pas de résultats
select pg_temp.check((select res from public.items where id = :IT) = '{}'::jsonb, 'résultats vides par défaut');

-- 2. le service porteur note ses chiffres ; tout le monde les lit ; l'historique le garde
select pg_temp.as_user(:RS);
update public.items set res = '{"vues": 12400, "clics": 300}' where id = :IT;
select pg_temp.check((select res ->> 'vues' from public.items where id = :IT) = '12400', 'Stéphane note 12 400 vues');
select pg_temp.as_user(:VIS);
select pg_temp.check((select (res ->> 'clics')::int from public.items where id = :IT) = 300, 'le visiteur lit les chiffres');
select pg_temp.admin();
select pg_temp.check(exists (select 1 from public.journal where item = :IT and kind = 'modif' and diff ? 'res'), 'l''historique garde les résultats');

-- 3. des chiffres impossibles sont refusés
select pg_temp.as_user(:RS);
select pg_temp.refus($$update public.items set res = '{"likes": 3}' where id = '24100000-0000-0000-0000-000000000001'$$, 'une unité inconnue');
select pg_temp.refus($$update public.items set res = '{"vues": -5}' where id = '24100000-0000-0000-0000-000000000001'$$, 'un nombre négatif');
select pg_temp.refus($$update public.items set res = '{"vues": 2.5}' where id = '24100000-0000-0000-0000-000000000001'$$, 'un nombre à virgule');
select pg_temp.refus($$update public.items set res = '{"vues": "beaucoup"}' where id = '24100000-0000-0000-0000-000000000001'$$, 'du texte');
select pg_temp.refus($$update public.items set res = '[1, 2]' where id = '24100000-0000-0000-0000-000000000001'$$, 'une liste');
-- un autre service ne touche pas aux chiffres d'une fiche qui n'est pas la sienne
update public.items set res = '{"retombees": 2}' where id = :PA;
select pg_temp.admin();
select pg_temp.check((select res from public.items where id = :PA) = '{}'::jsonb, 'Stéphane ne note rien sur le partenariat');

-- 4. le budget : le chef de projet le règle et le lit
select pg_temp.as_user(:PIL);
insert into public.budget (item, montant) values (:PA, 1800);
update public.budget set montant = 1650 where item = :PA;
insert into public.enveloppes (per, montant) select n, 10000 from public.periods order by n limit 1;
select pg_temp.check((select montant from public.budget where item = :PA) = 1650, 'Julien règle le budget');
select pg_temp.check((select author from public.budget where item = :PA) = :PIL, 'le budget garde qui l''a réglé');
select pg_temp.check((select count(*) from public.enveloppes) = 1, 'Julien règle une enveloppe');
select pg_temp.refus($$insert into public.budget (item, montant) values ('24100000-0000-0000-0000-000000000001', -10)$$, 'un montant négatif');

-- 5. les autres comptes ne voient ni ne changent le budget
select pg_temp.as_user(:RS);
select pg_temp.check((select count(*) from public.budget) = 0, 'Stéphane ne voit aucun montant');
select pg_temp.check((select count(*) from public.enveloppes) = 0, 'Stéphane ne voit aucune enveloppe');
select pg_temp.refus($$insert into public.budget (item, montant) values ('24100000-0000-0000-0000-000000000001', 500)$$, 'Stéphane ajoute un montant');
update public.budget set montant = 1 where item = :PA;
delete from public.enveloppes;
select pg_temp.as_user(:VIS);
select pg_temp.check((select count(*) from public.budget) = 0, 'le visiteur ne voit aucun montant');
select pg_temp.admin();
select pg_temp.check((select montant from public.budget where item = :PA) = 1650 and (select count(*) from public.enveloppes) = 1, 'rien n''a bougé');

-- 6. la fiche supprimée emporte son montant ; la période supprimée, son enveloppe
delete from public.items where id = :PA;
select pg_temp.check(not exists (select 1 from public.budget where item = :PA), 'le montant part avec la fiche');
delete from public.periods where n = (select per from public.enveloppes limit 1);
select pg_temp.check((select count(*) from public.enveloppes) = 0, 'l''enveloppe part avec la période');

rollback;
\echo 'résultats et budget : bon'
