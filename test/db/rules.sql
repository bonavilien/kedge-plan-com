-- Vérifie les droits et les notifications avec quatre comptes : un chef « média » prévenu de tout,
-- une responsable de l'offre (chef), une personne RP et une personne RS.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'julien.bonavita@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000002', 'estelle@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000003', 'aurelie@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000004', 'stephane@kedgebs.com'),
  ('00000000-0000-0000-0000-000000000005', 'nouveau@kedgebs.com');
update public.profiles set chef = true, media = true, notif_all = true, fonction = 'Chef de projet' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set chef = true, fonction = 'Responsable de l''offre' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set svc = 'rp' where id = '00000000-0000-0000-0000-000000000003';
update public.profiles set svc = 'rs' where id = '00000000-0000-0000-0000-000000000004';
select nom, svc, chef from public.profiles order by id;
insert into public.partners (k, nom) values ('major', 'Major Prépa');

-- une fonction pour jouer un compte
create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
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

-- Aurélie (RP) publie une action RP et cite RS
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.items (id, kind, t, date, svc, cc, m)
values ('10000000-0000-0000-0000-000000000001', 'action', 'CP de rentrée', current_date + 30, 'rp', '{rs}', '{1}');
-- elle ne peut pas publier pour RS, ni un partenariat
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc) values ('action', 'Pas à moi', current_date, 'rs')$$, 'RP publie pour RS');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc, partner) values ('action', 'Partenariat', current_date, 'rp', 'major')$$, 'RP saisit un partenariat');
-- elle ne peut pas se donner les droits de chef
update public.profiles set chef = true where id = '00000000-0000-0000-0000-000000000003';
reset role;
select 'chef non modifié', chef from public.profiles where id = '00000000-0000-0000-0000-000000000003';

-- Stéphane (RS) ne peut pas modifier l'action RP, mais peut y demander des éléments et signaler un blocage
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.items set t = 'piraté' where id = '10000000-0000-0000-0000-000000000001';
insert into public.reqs (item, dest, type, quoi, pour) values ('10000000-0000-0000-0000-000000000001', 'rp', 'Visuels', 'Les photos', current_date + 20);
insert into public.blocks (item, why) values ('10000000-0000-0000-0000-000000000001', 'Pas de visuels');
insert into public.links (item, nom, url) values ('10000000-0000-0000-0000-000000000001', 'Dossier', 'https://kedgebs.sharepoint.com/x');
select pg_temp.expect_fail($$insert into public.links (item, nom, url) values ('10000000-0000-0000-0000-000000000001', 'Mauvais', 'javascript:alert(1)')$$, 'lien non web');
insert into public.answers (key, val) values ('10000000-0000-0000-0000-000000000001-30', 'non');
reset role;
select 'titre intact', t from public.items where id = '10000000-0000-0000-0000-000000000001';

-- Estelle (chef) modifie l'action RP et marque la demande reçue
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.items set st = 'production' where id = '10000000-0000-0000-0000-000000000001';
update public.reqs set st = 'recue';
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc, partner) values ('action', 'Partenariat', current_date, 'chef', 'major')$$, 'chef sans droit média saisit un partenariat');
-- elle ne voit pas la boîte d'envoi ni les réponses des autres
select 'outbox visible', count(*) from public.outbox;
select 'réponses des autres', count(*) from public.answers;
reset role;

-- Julien (média) saisit un partenariat et un temps fort
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.items (kind, t, date, svc, partner, m) values ('action', 'Guide Prépa', current_date + 15, 'chef', 'major', '{4}');
insert into public.items (kind, t, date, svc, cc) values ('tf', 'Journées portes ouvertes', current_date + 40, 'chef', '{rs,video}');
insert into public.items (kind, t, date, svc, per) values ('tf', 'Salle Bloomberg', current_date, 'chef', '{2}');
update public.meta set v = to_char(current_date, 'YYYY-MM-DD') where k = 'last_meeting';
reset role;

-- rappels : J-30 pour l'action RP (Aurélie), J-15 pour le partenariat (Julien) ; Stéphane a déjà répondu « non » mais n'est pas concerné
select public.queue_reminders() as actions_rappelees;
select public.queue_reminders() as deuxieme_passage;

select p.nom, o.title, o.body from public.outbox o join public.profiles p on p.id = o.user_id order by o.id;
select 'rappels en double', count(*) - count(distinct dedupe) from public.outbox where dedupe is not null;

-- un compte sans service ni droits de chef lit tout mais ne publie ni ne modifie rien
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select 'sans service voit', count(*) from public.items;
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc) values ('action', 'Chef', current_date, 'chef')$$, 'sans service publie pour les chefs');
select pg_temp.expect_fail($$insert into public.items (kind, t, date, svc) values ('action', 'RP', current_date, 'rp')$$, 'sans service publie pour RP');
update public.items set t = 'piraté' where svc = 'chef';
reset role;
select 'titres chefs intacts', count(*) from public.items where t = 'piraté';

-- un anonyme ne voit rien
set role anon;
select 'anonyme voit', count(*) from public.items;
reset role;
