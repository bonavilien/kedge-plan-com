-- Vérifie la migration 0035 (2.8, suivi de l'outil : phrases, erreurs, annulés, recherches, écrans) sur une base installée. Tout est annulé à la fin.
-- Usage : sh test/db/suivi.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ÉCHEC : %', label; end if; raise notice 'OK %', label; end $$;
create function pg_temp.refus(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK refusé : %', label; return; end;
  raise exception 'ATTENDU REFUSÉ : %', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
\set JU '''35000000-0000-0000-0000-000000000001'''
\set ES '''35000000-0000-0000-0000-000000000002'''
\set RP '''35000000-0000-0000-0000-000000000003'''
\set VIS '''35000000-0000-0000-0000-000000000004'''
insert into auth.users (id, email) values (:JU, 'ju.35@example.com');
insert into auth.users (id, email) values (:ES, 'es.35@example.com'), (:RP, 'rp.35@example.com'), (:VIS, 'v.35@example.com');
update public.profiles set chef = true where id = :ES;
update public.profiles set svc = 'rp' where id = :RP;
update public.profiles set visiteur = true where id = :VIS;

select pg_temp.check((select admin and chef from public.profiles where id = :JU), 'le premier compte créé est chef et admin');
select pg_temp.check((select count(*) = 1 from public.profiles where admin), 'un seul admin');
select pg_temp.check(not (select admin from public.profiles where id = :ES), 'Estelle (chef) n''est pas admin');

-- Estelle ne peut pas se donner le droit, ni le retirer à l'admin
select pg_temp.as_user(:ES);
update public.profiles set admin = true where id = :ES;
update public.profiles set admin = false where id = :JU;
select pg_temp.root();
select pg_temp.check((select admin from public.profiles where id = :JU) and not (select admin from public.profiles where id = :ES), 'le droit admin ne change pas depuis l''appli');

-- chacun dépose ses phrases ; seul l'admin les lit et les efface
select pg_temp.as_user(:RP);
insert into public.phrases_barre (txt) values ('@louise t''as des photos du carousel');
select pg_temp.check((select count(*) = 0 from public.phrases_barre), 'un service ne relit pas les phrases');
select pg_temp.refus($q$insert into public.phrases_barre (txt, qui) values ('au nom d''un autre', '35000000-0000-0000-0000-000000000001')$q$, 'déposer au nom d''un autre');
select pg_temp.as_user(:ES);
insert into public.phrases_barre (txt, raison) values ('fais un truc', 'reecrit');
select pg_temp.check((select count(*) = 0 from public.phrases_barre), 'Estelle (chef, pas admin) ne lit pas les phrases');
delete from public.phrases_barre;
select pg_temp.as_user(:VIS);
select pg_temp.refus($q$insert into public.phrases_barre (txt) values ('visiteur')$q$, 'le visiteur ne dépose rien');
select pg_temp.as_user(:JU);
select pg_temp.check((select count(*) = 2 from public.phrases_barre), 'l''admin lit toutes les phrases (Estelle n''a rien effacé)');
select pg_temp.check((select qui from public.phrases_barre where txt like '@louise%') = :RP, 'la phrase garde son auteur');
select pg_temp.refus($q$insert into public.phrases_barre (txt, raison) values ('x y', 'autre')$q$, 'raison inconnue');

-- au plus 30 phrases par heure et par personne
select pg_temp.as_user(:RP);
insert into public.phrases_barre (txt) select 'phrase ' || g from generate_series(1, 40) g;
select pg_temp.as_user(:JU);
select pg_temp.check((select count(*) = 30 from public.phrases_barre where qui = :RP), 'limite de 30 phrases par heure');
delete from public.phrases_barre;
select pg_temp.check((select count(*) = 0 from public.phrases_barre), 'l''admin vide la liste');

-- le suivi : chacun dépose, l'admin seul lit ; les écrans partent sans nom
select pg_temp.as_user(:RP);
insert into public.suivi (type, txt, version) values ('erreur', 'TypeError: x is null', '2.8.0');
insert into public.suivi (type, txt, detail) values ('annule', 'décale le teaser à lundi', '{"k":"decaler"}');
insert into public.suivi (type, txt, qui) values ('ecran', 'accueil', null);
select pg_temp.refus($q$insert into public.suivi (type, txt) values ('ecran', 'plan')$q$, 'un écran ne part pas avec un nom');
select pg_temp.refus($q$insert into public.suivi (type, txt) values ('autre', 'x')$q$, 'type inconnu');
select pg_temp.check((select count(*) = 0 from public.suivi), 'un service ne relit pas le suivi');
select pg_temp.as_user(:ES);
select pg_temp.check((select count(*) = 0 from public.suivi), 'Estelle ne lit pas le suivi');
select pg_temp.as_user(:VIS);
select pg_temp.refus($q$insert into public.suivi (type, txt) values ('erreur', 'x')$q$, 'le visiteur ne dépose rien dans le suivi');
select pg_temp.as_user(:JU);
select pg_temp.check((select count(*) = 3 from public.suivi), 'l''admin lit tout le suivi');
select pg_temp.check((select qui is null from public.suivi where type = 'ecran'), 'l''écran est sans nom');
select pg_temp.as_user(:RP);
insert into public.suivi (type, txt) select 'recherche', 'r' || g from generate_series(1, 80) g;
select pg_temp.as_user(:JU);
select pg_temp.check((select count(*) = 60 from public.suivi where qui = :RP), 'limite de 60 lignes par heure');
delete from public.suivi;
select pg_temp.check((select count(*) = 0 from public.suivi), 'l''admin vide le suivi');

select pg_temp.root();
\echo 'suivi de l''outil : bon'
rollback;
