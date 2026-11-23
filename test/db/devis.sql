-- Vérifie la migration 0038 (2.9.0, budget par devis) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/devis.sh
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
\set PIL '''38000000-0000-0000-0000-000000000001'''
\set RS '''38000000-0000-0000-0000-000000000002'''
\set VIS '''38000000-0000-0000-0000-000000000003'''
\set IT '''38100000-0000-0000-0000-000000000001'''
\set PA '''38100000-0000-0000-0000-000000000002'''
insert into auth.users (id, email) values (:PIL, 'pilote.d@example.com'), (:RS, 'rs.d@example.com'), (:VIS, 'vis.d@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true, media = true where id = :PIL;
update public.profiles set nom = 'Stephane', svc = 'rs' where id = :RS;
update public.profiles set nom = 'Visiteur', visiteur = true where id = :VIS;
insert into public.partners (k, nom) values ('so', 'Sud Ouest') on conflict do nothing;

select pg_temp.as_user(:PIL);
\set DV '''38200000-0000-0000-0000-000000000001'''
\set L1 '''38300000-0000-0000-0000-000000000001'''
\set L2 '''38300000-0000-0000-0000-000000000002'''
select pg_temp.as_user(:PIL);
insert into public.items (id, kind, t, date, svc, m, st, partner) values (:PA, 'action', 'Encart Sud Ouest', current_date + 20, 'rp', '{1}', 'planifie', 'so');
insert into public.items (id, kind, t, date, svc, m, st) values (:IT, 'action', 'Vidéo campus', current_date + 30, 'rs', '{2}', 'planifie');

-- 1. le chef de projet crée un devis, ses lignes, et les relie aux actions
insert into public.devis (id, annee, media, programme, numero, recu, remise, paiement) values (:DV, 2026, 'Sud Ouest', 'PGE', 'D-42', current_date, 500, '30 % à la signature');
insert into public.devis_lignes (id, devis, rang, t, qte, montant) values (:L1, :DV, 1, 'Encart', 1, 4000), (:L2, :DV, 2, 'Vidéo offerte', 1, 1500);
update public.devis_lignes set offert = true where id = :L2;
insert into public.devis_liens (ligne, item) values (:L1, :PA), (:L2, :IT);
update public.devis set etat = 'da' where id = :DV;
insert into public.enveloppes_annee (annee, montant) values (2026, 150000);
select pg_temp.check((select etat from public.devis where id = :DV) = 'da', 'Julien passe le devis en DA faite');
select pg_temp.check((select author from public.devis where id = :DV) = :PIL, 'le devis garde qui l''a créé');
select pg_temp.check((select count(*) from public.devis_liens) = 2, 'deux lignes reliées');
select pg_temp.check((select sum(montant) filter (where not offert) - (select remise from public.devis where id = :DV) from public.devis_lignes where devis = :DV) = 3500, 'total HT : 4 000 moins 500 de remise');

-- 2. ce qui est impossible est refusé
select pg_temp.refus($$update public.devis set etat = 'paye' where id = '38200000-0000-0000-0000-000000000001'$$, 'un état inconnu');
select pg_temp.refus($$update public.devis set remise = -1 where id = '38200000-0000-0000-0000-000000000001'$$, 'une remise négative');
select pg_temp.refus($$insert into public.devis_lignes (devis, montant) values ('38200000-0000-0000-0000-000000000001', -5)$$, 'une ligne négative');
select pg_temp.refus($$insert into public.devis_lignes (devis, qte) values ('38200000-0000-0000-0000-000000000001', 0)$$, 'zéro action');
select pg_temp.refus($$insert into public.devis (annee) values (1990)$$, 'une année hors limites');
select pg_temp.refus($$insert into public.devis_liens (ligne, item) values ('38300000-0000-0000-0000-000000000001', '38100000-0000-0000-0000-000000000002')$$, 'le même lien deux fois');
-- personne ne se fait passer pour un autre
update public.devis set author = :RS where id = :DV;
select pg_temp.check((select author from public.devis where id = :DV) = :PIL, 'l''auteur ne change pas');

-- 3. les autres comptes ne voient ni ne changent rien
select pg_temp.as_user(:RS);
select pg_temp.check((select count(*) from public.devis) = 0, 'Stéphane ne voit aucun devis');
select pg_temp.check((select count(*) from public.devis_lignes) = 0, 'Stéphane ne voit aucune ligne');
select pg_temp.check((select count(*) from public.devis_liens) = 0, 'Stéphane ne voit aucun lien');
select pg_temp.check((select count(*) from public.enveloppes_annee) = 0, 'Stéphane ne voit pas l''enveloppe');
select pg_temp.refus($$insert into public.devis (annee, media) values (2026, 'Pirate')$$, 'Stéphane crée un devis');
update public.devis set etat = 'facture';
delete from public.devis_lignes;
select pg_temp.as_user(:VIS);
select pg_temp.check((select count(*) from public.devis) = 0, 'le visiteur ne voit aucun devis');
select pg_temp.refus($$insert into public.devis_liens (ligne, item) values ('38300000-0000-0000-0000-000000000002', '38100000-0000-0000-0000-000000000002')$$, 'le visiteur relie une ligne');
select pg_temp.admin();
select pg_temp.check((select etat from public.devis where id = :DV) = 'da' and (select count(*) from public.devis_lignes) = 2, 'rien n''a bougé');

-- 4. la fiche supprimée emporte son lien ; le devis supprimé, ses lignes et leurs liens
delete from public.items where id = :IT;
select pg_temp.check((select count(*) from public.devis_liens) = 1, 'le lien part avec la fiche');
select pg_temp.check((select count(*) from public.devis_lignes) = 2, 'la ligne reste');
select pg_temp.as_user(:PIL);
delete from public.devis where id = :DV;
select pg_temp.admin();
select pg_temp.check((select count(*) from public.devis_lignes) = 0 and (select count(*) from public.devis_liens) = 0, 'le devis part avec ses lignes et leurs liens');

rollback;
\echo 'budget par devis : bon'
