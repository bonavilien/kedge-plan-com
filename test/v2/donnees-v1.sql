-- Des données comme la V1 en produit (avant les migrations de la V2) : statuts à 6 valeurs, « Incontournable »,
-- sujet sur deux périodes, classement, partenariat, sujet à trancher, demandes aux chefs et à la Direction du Programme.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'pilote@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'presse@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'reseaux@example.com'),
  ('a0000000-0000-0000-0000-000000000004', 'lecteur@example.com');
update public.profiles set nom = 'Julien', fonction = 'Chef de projet com', chef = true, media = true, notif_all = true where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set nom = 'Aurélie', fonction = 'Relations presse', svc = 'rp' where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set nom = 'Stéphane', fonction = 'Réseaux sociaux', svc = 'rs' where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set nom = 'Visiteur', visiteur = true where id = 'a0000000-0000-0000-0000-000000000004';
insert into public.partners (k, nom) values ('challenges', 'Challenges') on conflict do nothing;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
insert into public.items (id, kind, t, date, svc, m, st, lieu, note) values
  ('b0000000-0000-0000-0000-000000000001', 'tf', 'Journée portes ouvertes', current_date + 12, 'chef', '{INC}', 'planifie', 'Campus de Bordeaux', 'Accueil des familles.');
insert into public.items (id, kind, t, date, svc, m, st, tf) values
  ('b0000000-0000-0000-0000-000000000002', 'action', 'Invitation presse locale', current_date + 5, 'rp', '{1}', 'idee', 'b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'action', 'Teaser de la journée', current_date + 8, 'rs', '{1,4}', 'production', 'b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004', 'action', 'Brève accord Séoul', current_date - 3, 'rp', '{3}', 'diffuse', null),
  ('b0000000-0000-0000-0000-000000000005', 'action', 'Portrait abandonné', current_date + 2, 'rs', '{2}', 'retire', null);
insert into public.items (id, kind, t, date, flou, svc, m, st) values
  ('b0000000-0000-0000-0000-000000000006', 'action', 'Portrait d''un professeur', date_trunc('month', current_date)::date, 'Nov.', 'rs', '{1}', 'confirmer');
insert into public.items (id, kind, t, date, per, svc, m, st) values
  ('b0000000-0000-0000-0000-000000000007', 'tf', 'L''alternance en dernière année', (select du from public.periods order by du offset 1 limit 1), (select array_agg(n order by du) from (select n, du from public.periods order by du offset 1 limit 2) x), 'chef', '{1}', 'planifie');
insert into public.items (id, kind, t, date, svc, st, rang, cible) values
  ('b0000000-0000-0000-0000-000000000008', 'classement', 'Classement SIGEM', current_date + 200, 'chef', 'confirmer', 10, 7);
insert into public.items (id, kind, t, date, svc, m, st, partner) values
  ('b0000000-0000-0000-0000-000000000009', 'action', 'Interview dans Challenges', current_date + 20, 'chef', '{5}', 'confirmer', 'challenges');
insert into public.links (item, nom, url) values ('b0000000-0000-0000-0000-000000000001', 'Programme de la JPO', 'https://example.sharepoint.com/programme');
insert into public.blocks (item, why) values ('b0000000-0000-0000-0000-000000000003', 'à trancher en réunion : budget du teaser');
insert into public.reqs (id, item, dest, type, quoi, pour) values
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'programme', 'Programme', 'Liste des intervenants', current_date + 3);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
insert into public.reqs (id, item, dest, type, quoi, pour) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'chef', 'Programme', 'Le programme des conférences', current_date + 1);
select set_config('request.jwt.claim.sub', '', false);
