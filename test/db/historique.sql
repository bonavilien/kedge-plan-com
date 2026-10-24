-- Vérifie l'historique des fiches et « prévenir à nouveau » (migration 0003), après rules.sql.
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

-- les fiches saisies avant la migration ont leur création dans l'historique
select pg_temp.check((select count(*) from public.journal where kind = 'creation') = (select count(*) from public.items), 'création des fiches existantes reprise');
select pg_temp.check((select j.author from public.journal j join public.items i on i.id = j.item where i.t = 'Guide Prépa') = '00000000-0000-0000-0000-000000000001', 'auteur de la création repris');

-- Aurélie (RP) publie une action citant RS, liée au temps fort JPO, puis déplace sa date et précise le contexte
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.items (id, kind, t, date, svc, cc, m, tf)
values ('20000000-0000-0000-0000-000000000001', 'action', 'Reportage JPO', current_date + 40, 'rp', '{rs}', '{1}',
  (select id from public.items where t = 'Journées portes ouvertes'));
update public.items set date = current_date + 47, note = 'Rendez-vous à 9 h' where id = '20000000-0000-0000-0000-000000000001';
update public.items set st = 'production' where id = '20000000-0000-0000-0000-000000000001';
update public.items set st = 'production' where id = '20000000-0000-0000-0000-000000000001'; -- rien ne change : pas de ligne
insert into public.links (item, nom, url) values ('20000000-0000-0000-0000-000000000001', 'Brief', 'https://kedgebs.sharepoint.com/brief');
reset role;
select kind, diff from public.journal where item = '20000000-0000-0000-0000-000000000001' order by id;
select pg_temp.check((select array_agg(kind order by id) from public.journal where item = '20000000-0000-0000-0000-000000000001') = '{creation,modif,modif,document}', 'création, deux modifications, un document');
select pg_temp.check((select diff ?& '{date,note}' and not diff ? 'updated_at' and not diff ? 't' from public.journal where item = '20000000-0000-0000-0000-000000000001' and kind = 'modif' order by id limit 1), 'seuls les champs changés sont notés');
select pg_temp.check((select diff -> 'date' ->> 1 = to_char(current_date + 47, 'YYYY-MM-DD') from public.journal where item = '20000000-0000-0000-0000-000000000001' and kind = 'modif' order by id limit 1), 'date avant et après');
select pg_temp.check((select bool_and(author = '00000000-0000-0000-0000-000000000003') from public.journal where item = '20000000-0000-0000-0000-000000000001'), 'chaque ligne signée par Aurélie');

-- personne n'écrit ni n'efface l'historique à la main
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$insert into public.journal (item, kind) values ('20000000-0000-0000-0000-000000000001', 'modif')$$, 'écrire dans l''historique');
update public.journal set diff = '{}' where item = '20000000-0000-0000-0000-000000000001';
delete from public.journal where item = '20000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.check((select count(*) from public.journal where item = '20000000-0000-0000-0000-000000000001') = 4
  and (select count(*) from public.journal where item = '20000000-0000-0000-0000-000000000001' and kind <> 'creation' and diff = '{}') = 0, 'historique intact');

-- Aurélie prévient du changement : Julien (prévenu de tout) et Stéphane (RS cité), pas elle-même
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check(public.renotify('20000000-0000-0000-0000-000000000001', 'date : 3 déc. → 10 déc.') = 2, 'deux personnes prévenues');
select public.renotify('20000000-0000-0000-0000-000000000001', 'date : 3 déc. → 10 déc.'); -- double appui
reset role;
select p.nom, o.title, o.body, o.url from public.outbox o join public.profiles p on p.id = o.user_id order by o.id;
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id) = '{Julien,Stephane}', 'Julien et Stéphane, une seule fois');
select pg_temp.check((select bool_and(title = 'Modifié : Reportage JPO' and body = 'Aurelie : date : 3 déc. → 10 déc.' and url = '#item=20000000-0000-0000-0000-000000000001') from public.outbox), 'titre, texte et lien de la notification');
select pg_temp.check((select count(*) from public.journal where item = '20000000-0000-0000-0000-000000000001' and kind = 'prevenu' and diff ->> 'n' = '2') >= 1, 'relance notée dans l''historique');

-- Stéphane (RS) ne peut pas prévenir pour une action RP, ni un compte sans service
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($$select public.renotify('20000000-0000-0000-0000-000000000001', 'piraté')$$, 'RS prévient pour RP');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select pg_temp.expect_fail($$select public.renotify('20000000-0000-0000-0000-000000000001', 'piraté')$$, 'sans service prévient');
reset role;
set role anon;
select pg_temp.expect_fail($$select public.renotify('20000000-0000-0000-0000-000000000001', 'piraté')$$, 'anonyme prévient');
reset role;

-- Estelle (chef) déplace le temps fort JPO et prévient : Julien, RS (cité) et RP (porte un relais)
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.items set date = current_date + 41 where t = 'Journées portes ouvertes';
select pg_temp.check(public.renotify((select id from public.items where t = 'Journées portes ouvertes'), 'date : 2 déc. → 3 déc.') = 3, 'temps fort : trois personnes prévenues');
reset role;
select pg_temp.check((select array_agg(p.nom order by p.nom) from public.outbox o join public.profiles p on p.id = o.user_id) = '{Aurelie,Julien,Stephane}', 'les porteurs des relais sont prévenus');
select pg_temp.check((select j.author from public.journal j join public.items i on i.id = j.item where i.t = 'Journées portes ouvertes' and j.kind = 'modif') = '00000000-0000-0000-0000-000000000002', 'modification signée par Estelle');

-- effacer une fiche efface son historique
delete from public.items where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from public.journal where item = '20000000-0000-0000-0000-000000000001') = 0, 'historique effacé avec la fiche');
