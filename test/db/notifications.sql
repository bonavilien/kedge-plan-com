-- Vérifie la page Notifications (migration 0016) : chacun ne lit que les siennes, de moins de 7 jours, non effacées ; effacer ne touche que les siennes.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK %', label;
end $$;

delete from public.outbox;
insert into public.outbox (user_id, title, body, url, created_at, sent_at, dedupe) values
  ('00000000-0000-0000-0000-000000000001', 'Nouvelle action', 'a', '#item=x', now() - interval '1 hour', now(), null),
  ('00000000-0000-0000-0000-000000000001', 'Demande d''éléments', 'b', '#afaire', now() - interval '6 days', now(), null),
  ('00000000-0000-0000-0000-000000000001', 'Vieille', 'c', '', now() - interval '8 days', now(), 'rappel:vieux:1'),
  ('00000000-0000-0000-0000-000000000001', 'En attente', 'd', '', now(), null, null),
  ('00000000-0000-0000-0000-000000000003', 'Pour Aurélie', 'e', '', now(), now(), null);

select from pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select from pg_temp.check((select count(*) from public.outbox) = 3, 'Julien voit ses 3 notifications de moins de 7 jours');
select from pg_temp.check(not exists (select 1 from public.outbox where title in ('Vieille', 'Pour Aurélie')), 'ni celles de plus de 7 jours, ni celles des autres');
-- écrire directement reste interdit
update public.outbox set title = 'piraté';
delete from public.outbox;
reset role;
select from pg_temp.check(not exists (select 1 from public.outbox where title = 'piraté') and (select count(*) from public.outbox) = 5, 'pas de modification ni de suppression directe');

-- effacer une notification
select from pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.effacer_notifs(array[(select id from public.outbox where title = 'Nouvelle action')]);
select from pg_temp.check((select count(*) from public.outbox) = 2, 'une notification effacée disparaît');
-- effacer celle d'Aurélie : sans effet
select public.effacer_notifs(array(select id from public.outbox o where o.title = 'Pour Aurélie'));
reset role;
select from pg_temp.check((select efface_at from public.outbox where title = 'Pour Aurélie') is null, 'on n''efface pas celles des autres');
-- tout effacer
select from pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.effacer_notifs();
select from pg_temp.check((select count(*) from public.outbox) = 0, '« Tout effacer » vide la liste');
reset role;
select from pg_temp.check((select count(*) from public.outbox) = 5 and exists (select 1 from public.outbox where dedupe = 'rappel:vieux:1'), 'les lignes restent (un rappel déjà envoyé ne repart pas)');
select from pg_temp.check((select efface_at from public.outbox where title = 'Pour Aurélie') is null, 'celle d''Aurélie reste visible pour elle');
-- une notification effacée encore en attente part quand même sur le téléphone
select from pg_temp.check(exists (select 1 from public.outbox where title = 'En attente' and sent_at is null), 'effacer n''empêche pas l''envoi');
-- un visiteur ou un compte anonyme n'efface rien
set role anon;
do $$ begin perform public.effacer_notifs(); raise exception 'anon a pu effacer'; exception when insufficient_privilege then null; end $$;
reset role;
delete from public.outbox;
