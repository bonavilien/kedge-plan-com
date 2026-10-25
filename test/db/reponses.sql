-- Vérifie la réponse à une demande d'éléments et le retrait d'une demande (migration 0006).
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


-- Aurélie (RP) demande des visuels à RS pour un reportage lié au temps fort JPO
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.items (id, kind, t, date, svc, m, tf)
values ('30000000-0000-0000-0000-000000000001', 'action', 'Reportage visite', current_date + 30, 'rp', '{1}', (select id from public.items where t = 'Journées portes ouvertes'));
insert into public.reqs (id, item, dest, type, pour, st) values ('30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'rs', 'Visuels', current_date + 20, 'recue');
reset role;
select pg_temp.check((select st = 'ouverte' and reponse = '' from public.reqs where id = '30000000-0000-0000-0000-0000000000a1'), 'une demande part toujours ouverte, sans réponse');

-- Stéphane (RS) répond : un document sur le temps fort, un message sur la demande
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into public.links (item, nom, url, req) values ((select id from public.items where t = 'Journées portes ouvertes'), 'Visuels JPO', 'https://kedgebs.sharepoint.com/visuels', '30000000-0000-0000-0000-0000000000a1');
update public.reqs set st = 'recue', reponse = '  Les visuels validés sont dans le dossier  ', repondu_par = '00000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-0000000000a1';
update public.reqs set reponse = 'Réécrit' where id = '30000000-0000-0000-0000-0000000000a1';
reset role;
select pg_temp.check((select reponse = 'Les visuels validés sont dans le dossier' and repondu_par = '00000000-0000-0000-0000-000000000004' and repondu_at is not null
  from public.reqs where id = '30000000-0000-0000-0000-0000000000a1'), 'réponse enregistrée une fois, signée par Stéphane');
select pg_temp.check((select l.req = '30000000-0000-0000-0000-0000000000a1' from public.links l where l.nom = 'Visuels JPO'), 'le document est rattaché à la demande, sur le temps fort');
select pg_temp.check(exists (select 1 from public.outbox where user_id = '00000000-0000-0000-0000-000000000003' and title = 'Éléments reçus'
  and body = 'Visuels pour « Reportage visite » : Les visuels validés sont dans le dossier'), 'Aurélie reçoit la réponse avec le message');
select pg_temp.check((select diff ->> 'reponse' = 'Les visuels validés sont dans le dossier' from public.journal where item = '30000000-0000-0000-0000-000000000001' and kind = 'reponse'), 'la réponse est dans l''historique de l''action');

-- retirer : pas le service sollicité, oui la personne qui a demandé ; sans retour, et on peut redemander ensuite
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.reqs (id, item, dest, type, pour) values ('30000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001', 'rs', 'Contexte', current_date + 20);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($$update public.reqs set st = 'annulee' where id = '30000000-0000-0000-0000-0000000000a2'$$, 'le service sollicité retire la demande');
reset role;
delete from public.outbox;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
update public.reqs set st = 'annulee' where id = '30000000-0000-0000-0000-0000000000a2';
update public.reqs set st = 'ouverte' where id = '30000000-0000-0000-0000-0000000000a2';
insert into public.reqs (item, dest, type, pour) values ('30000000-0000-0000-0000-000000000001', 'rs', 'Contexte', current_date + 21);
reset role;
select pg_temp.check((select st from public.reqs where id = '30000000-0000-0000-0000-0000000000a2') = 'annulee', 'retirée par Aurélie, et le reste');
select pg_temp.check(exists (select 1 from public.outbox o join public.profiles p on p.id = o.user_id where p.svc = 'rs' and o.title = 'Demande retirée'
  and o.body = 'Aurelie n''a plus besoin de : Contexte pour « Reportage visite »'), 'RS est prévenu du retrait');
select pg_temp.check(not exists (select 1 from public.outbox where user_id = '00000000-0000-0000-0000-000000000003'), 'Aurélie n''est pas prévenue de son propre retrait');
select pg_temp.check(exists (select 1 from public.journal where item = '30000000-0000-0000-0000-000000000001' and kind = 'retrait' and diff ->> 'type' = 'Contexte'), 'le retrait est dans l''historique');
select pg_temp.check((select count(*) from public.reqs where item = '30000000-0000-0000-0000-000000000001' and type = 'Contexte' and st = 'ouverte') = 1, 'on peut redemander après un retrait');

-- un chef retire aussi
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update public.reqs set st = 'annulee' where item = '30000000-0000-0000-0000-000000000001' and type = 'Contexte' and st = 'ouverte';
reset role;
select pg_temp.check((select count(*) from public.reqs where item = '30000000-0000-0000-0000-000000000001' and st = 'annulee') = 2, 'Estelle retire une demande');
