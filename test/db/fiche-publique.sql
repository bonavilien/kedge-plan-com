-- Vérifie la migration 0040 (2.11, la fiche ouverte sans compte) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/fiche-publique.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
create function pg_temp.refus(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK refusé : %', label; return; end;
  raise exception 'ATTENDU REFUSÉ : %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
\set PIL '''40000000-0000-0000-0000-000000000001'''
\set TF '''40000000-0000-0000-0000-0000000000a1'''
\set ACT '''40000000-0000-0000-0000-0000000000a2'''
\set REL '''40000000-0000-0000-0000-0000000000a3'''
insert into auth.users (id, email) values (:PIL, 'p.40@example.com') on conflict do nothing;
update public.profiles set nom = 'Julien', chef = true where id = :PIL;
select set_config('request.jwt.claim.sub', :PIL, true);
insert into public.items (id, kind, t, date, svc, m, st, lieu, note) values
  (:TF, 'tf', 'Journée portes ouvertes', '2027-02-06', 'chef', '{}', 'planifie', 'Campus de Talence', 'note du temps fort'),
  (:ACT, 'action', 'Reportage JPO', '2027-02-01', 'rp', '{1,REC}', 'planifie', '', 'Note interne : budget serré');
update public.items set tf = :TF where id = :ACT;
insert into public.items (id, kind, t, date, svc, st, tf) values (:REL, 'action', 'Story Instagram', '2027-02-05', 'rs', 'confirmer', :TF);
insert into public.links (item, nom, url) values (:ACT, 'Brief', 'https://kedge.sharepoint.com/brief');
insert into public.reqs (item, asker, dest, type, quoi) values (:ACT, :PIL, 'rp', 'Photos', 'secret de la demande');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.check((select count(*) = 1 from kplan_private.migrations where name = '0040_fiche_publique.sql'), 'installation.sql note 0040 comme fait');

set local role anon;
-- sans compte : les tables restent fermées
select pg_temp.check((select count(*) = 0 from public.items), 'sans compte, la table des fiches ne rend rien');
create temp table f as select public.fiche_publique(:ACT) as j;
select pg_temp.check((select j->>'t' = 'Reportage JPO' from f), 'la fiche s''ouvre par son lien');
select pg_temp.check((select j->>'svc' <> '' from f), 'le service est nommé');
select pg_temp.check((select jsonb_array_length(j->'messages') = 2 from f), 'les messages, avec l''étiquette hors messages');
select pg_temp.check((select j->'tf'->>'t' = 'Journée portes ouvertes' from f), 'le temps fort de l''action');
select pg_temp.check((select jsonb_array_length(j->'docs') = 1 and j->'docs'->0->>'url' like 'https://%' from f), 'les liens web seulement');
select pg_temp.check((select not (j ? 'note') and j::text not like '%budget serré%' from f), 'pas la note');
select pg_temp.check((select j::text not like '%secret de la demande%' and j::text not like '%Julien%' and j::text not like '%40000000-0000-0000-0000-000000000001%' from f), 'ni demande, ni nom, ni auteur');
select pg_temp.check((select jsonb_array_length(public.fiche_publique(:TF)->'relais') = 2), 'un temps fort montre ses relais');
select pg_temp.check((select public.fiche_publique(:TF)->>'svc' = 'Chefs de projet'), 'un temps fort porté par les chefs');
select pg_temp.check((select public.fiche_publique('40000000-0000-0000-0000-0000000000ff') is null), 'une fiche qui n''existe pas : rien');
reset role;
select 'fiche sans compte : bon' as resultat;
rollback;
