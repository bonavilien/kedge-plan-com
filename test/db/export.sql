-- 0029 : Asana et Trello. Les clés ne se lisent pas depuis l'appli ; une fiche envoyée qui change, ou qui est supprimée,
-- fait appeler la fonction export par la base (net.calls tient lieu de pg_net en local).
\set ON_ERROR_STOP 1
do $$
declare u uuid := gen_random_uuid(); s text := (select k from public.services limit 1); i uuid := gen_random_uuid(); j uuid := gen_random_uuid(); n0 bigint; ok boolean; c jsonb;
begin
  insert into auth.users (id, email) values (u, 'export@exemple.fr');
  insert into public.items (id, kind, t, date, svc) values (i, 'action', 'Envoyée', current_date, s), (j, 'action', 'Pas envoyée', current_date, s);
  -- pas encore relié : aucun appel, même pour une fiche notée envoyée
  insert into public.exports (item, outil, ext_id) values (i, 'asana', 't1');
  n0 := (select count(*) from net.calls);
  update public.items set t = 'Envoyée, renommée' where id = i;
  if (select count(*) from net.calls) <> n0 then raise exception 'sans outil relié, aucun appel'; end if;
  insert into public.outils (outil, jeton, cible, cible_nom, adresse, secret) values ('asana', 'pat-secret', 'p1', 'KEDGE · Plan de com', 'https://ref.supabase.co/functions/v1/export', 's3cret');

  -- l'appli (compte connecté) : voit quels outils sont reliés et les fiches envoyées, jamais les clés
  perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated';
  if (select count(*) from public.outils_actifs()) <> 1 then raise exception 'outils_actifs doit répondre'; end if;
  begin perform jeton from public.outils; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'la table outils ne doit pas se lire depuis l''appli'; end if;
  if (select count(*) from public.exports) <> 1 then raise exception 'les fiches envoyées se lisent'; end if;
  begin insert into public.exports (item, outil, ext_id) values (j, 'asana', 'pirate'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'seule la fonction écrit dans exports'; end if;
  execute 'reset role';

  -- une fiche envoyée change : un appel, avec le secret
  n0 := (select count(*) from net.calls);
  update public.items set st = 'diffuse' where id = i;
  if (select count(*) from net.calls) <> n0 + 1 then raise exception 'une modification doit appeler la fonction'; end if;
  select jsonb_build_object('url', url, 'h', headers, 'b', body) into c from net.calls order by id desc limit 1;
  if c->>'url' <> 'https://ref.supabase.co/functions/v1/export' or c->'h'->>'x-export-secret' <> 's3cret' or c->'b'->>'item' <> i::text then raise exception 'appel mal formé : %', c; end if;
  -- une fiche jamais envoyée : rien
  update public.items set t = 'Toujours pas' where id = j;
  if (select count(*) from net.calls) <> n0 + 1 then raise exception 'une fiche non envoyée ne doit rien appeler'; end if;
  -- un document ajouté : la description change
  insert into public.links (item, nom, url) values (i, 'Brief', 'https://exemple.fr/brief');
  if (select count(*) from net.calls) <> n0 + 2 then raise exception 'un document ajouté doit appeler la fonction'; end if;
  -- supprimée : la fonction reçoit ce qu'il faut retirer, et la ligne d'export part avec la fiche
  delete from public.items where id = i;
  select body into c from net.calls order by id desc limit 1;
  if c->'supprimer'->0->>'ext_id' <> 't1' or c->'supprimer'->0->>'outil' <> 'asana' then raise exception 'suppression mal transmise : %', c; end if;
  if exists (select 1 from public.exports where item = i) then raise exception 'la ligne d''export doit partir avec la fiche'; end if;
  delete from public.items where id = j;
  delete from public.outils;
  raise notice 'export Asana Trello : bon';
end $$;
