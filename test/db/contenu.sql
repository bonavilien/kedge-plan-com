-- QA contenu, 2e passage (à jouer après run.sh sur kplan_test, tout est annulé à la fin). « DÉFAUT » = constat.
set client_min_messages = notice;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
grant execute on all functions in schema pg_temp to authenticated;
begin;
-- fixtures : un temps fort des chefs, un relais RP, un relais RS
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('6a000000-0000-0000-0000-000000000001', 'tf', 'JPO', current_date + 20, 'chef', '{}');
insert into public.items (id, kind, t, date, svc, m, tf) values ('6a000000-0000-0000-0000-000000000002', 'action', 'CP JPO', current_date + 18, 'rp', '{INC}', '6a000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m, tf) values ('6a000000-0000-0000-0000-000000000003', 'action', 'Reel JPO', current_date + 19, 'rs', '{2}', '6a000000-0000-0000-0000-000000000001');
insert into public.items (id, kind, t, date, svc, m) values ('6a000000-0000-0000-0000-000000000004', 'tf', 'Autre TF', current_date + 25, 'chef', '{}');
select pg_temp.admin();

-- 1. un temps fort rattaché à un autre temps fort (imbrication) : la base l'accepte-t-elle ?
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  update public.items set tf = '6a000000-0000-0000-0000-000000000001' where id = '6a000000-0000-0000-0000-000000000004';
  raise notice 'DÉFAUT (mineur) : un temps fort peut être lié à un autre temps fort';
exception when others then raise notice 'OK : un temps fort ne se lie pas à un temps fort'; end $$;
-- un temps fort lié devient-il rattachable alors qu'il est lui-même relais ? (tf vers 004 qui a un tf)
select pg_temp.admin();

-- 2. modification concurrente : le chef passe le relais RP à RS pendant qu'Aurélie (RP) corrige le titre
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.items set svc = 'rs' where id = '6a000000-0000-0000-0000-000000000002';
select pg_temp.admin();
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
do $$ declare n int; begin
  update public.items set t = 'CP JPO (corrigé)' where id = '6a000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'CONSTAT : la modification d''Aurélie ne touche aucune ligne et ne renvoie AUCUNE erreur (PostgREST répond 204, l''appli affiche « Modifié. »)';
  else raise notice 'modification acceptée (% ligne)', n; end if;
exception when others then raise notice 'OK : refus explicite (%)', sqlerrm; end $$;
select pg_temp.admin();
select t as titre_apres_modif_concurrente from public.items where id = '6a000000-0000-0000-0000-000000000002';

-- 3. retirer puis remettre : un service remet sa propre action ; statut d'origine ?
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.items set st = 'production' where id = '6a000000-0000-0000-0000-000000000003';
update public.items set st = 'retire' where id = '6a000000-0000-0000-0000-000000000003';
update public.items set st = 'planifie' where id = '6a000000-0000-0000-0000-000000000003';
select pg_temp.admin();
select st as statut_apres_remettre, (select count(*) from public.outbox where title like 'Retiré%' and body like '%action%') as notifs_retrait,
  (select count(*) from public.outbox where title ilike '%remis%') as notifs_remise from public.items where id = '6a000000-0000-0000-0000-000000000003';
select string_agg(diff::text, ' | ' order by id) as journal_statuts from public.journal where item = '6a000000-0000-0000-0000-000000000003' and kind = 'modif';

-- 4. documents : ajout puis retrait d'un document du temps fort par son auteur ; l'historique garde-t-il le retrait ?
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.links (id, item, nom, url) values ('6a000000-0000-0000-0000-0000000000d1', '6a000000-0000-0000-0000-000000000001', 'Programme', 'https://kedgebs.sharepoint.com/p');
delete from public.links where id = '6a000000-0000-0000-0000-0000000000d1';
select pg_temp.admin();
do $$ declare n int := (select count(*) from public.journal where item = '6a000000-0000-0000-0000-000000000001' and kind = 'document'); begin
  if not exists (select 1 from public.links where id = '6a000000-0000-0000-0000-0000000000d1') and n = 1 then
    raise notice 'DÉFAUT (mineur) : document retiré, l''historique n''a que « Document ajouté » (aucune trace du retrait)';
  else raise notice 'journal documents = %', n; end if; end $$;
-- un relais RP retire un document posé par RS sur le temps fort ? (ni auteur ni chef)
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.links (id, item, nom, url) values ('6a000000-0000-0000-0000-0000000000d2', '6a000000-0000-0000-0000-000000000001', 'Visuels', 'https://kedgebs.sharepoint.com/v');
select pg_temp.admin();
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
delete from public.links where id = '6a000000-0000-0000-0000-0000000000d2';
select pg_temp.admin();
select case when exists (select 1 from public.links where id = '6a000000-0000-0000-0000-0000000000d2') then 'OK : RP ne retire pas le document de RS' else 'DÉFAUT : RP a retiré le document de RS' end as retrait_doc;
-- un lien http:// (non https) ou javascript: passe-t-il en base ?
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$ begin
  insert into public.links (item, nom, url) values ('6a000000-0000-0000-0000-000000000001', 'JS', 'javascript:alert(1)');
  raise notice 'CONSTAT (mineur) : la base accepte un lien javascript: (seule l''appli contrôle https)';
exception when others then raise notice 'OK : lien contrôlé en base'; end $$;
select pg_temp.admin();

-- 5. modification partielle : changer seulement le titre n'écrit qu'un champ au journal
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.items set t = 'JPO de novembre' where id = '6a000000-0000-0000-0000-000000000001';
select pg_temp.admin();
select diff::text as journal_titre_seul from public.journal where item = '6a000000-0000-0000-0000-000000000001' and kind = 'modif' order by id desc limit 1;

-- 6. Incontournable + message en modification partielle : m seul envoyé
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.items set m = '{2,INC}' where id = '6a000000-0000-0000-0000-000000000003';
select pg_temp.admin();
select m::text as m_apres_inc from public.items where id = '6a000000-0000-0000-0000-000000000003';
rollback;
