-- 0039 : le retour d'Asana et de Trello. Une tâche étiquetée devient une fiche, au nom de la personne, une seule fois ;
-- ses changements passent par export_maj (titre, date, état seulement) ; l'appli ne voit que « retour branché ».
\set ON_ERROR_STOP 1
do $$
declare s text := (select k from public.services limit 1); u uuid := gen_random_uuid(); v uuid := gen_random_uuid(); i uuid; i2 uuid; ok boolean; r record;
begin
  insert into auth.users (id, email) values (u, 'stephane.retour@exemple.fr'), (v, 'visiteur.retour@exemple.fr');
  update public.profiles set svc = s, chef = false where id = u;
  update public.profiles set visiteur = true, svc = null, chef = false where id = v;
  insert into public.outils (user_id, outil, jeton, cible, cible_nom, crochet, hook_id) values (u, 'asana', 'pat', 'p1', 'KEDGE · Plan', 'k1', 'wh1');

  -- l'appli : mon outil, et le retour branché, sans la clé ni le crochet
  perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated';
  select * into r from public.outils_actifs();
  if r.outil <> 'asana' or not r.retour then raise exception 'outils_actifs doit dire que le retour est branché'; end if;
  begin perform public.export_importer(u, 'asana', 'x1', '', 'pirate', current_date); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'l''appli ne doit pas pouvoir importer'; end if;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true);

  -- la fonction (sans compte connecté) importe une tâche étiquetée
  i := public.export_importer(u, 'asana', 'x1', 'https://app.asana.com/0/p1/x1', 'Vidéo du campus', '2026-12-12');
  select * into r from public.items where id = i;
  if r.t <> 'Vidéo du campus' or r.date <> '2026-12-12' or r.st <> 'confirmer' or r.svc <> s or r.author <> u or r.kind <> 'action' then raise exception 'fiche importée mal remplie : %', row_to_json(r); end if;
  if not exists (select 1 from public.exports where item = i and user_id = u and origine = 'outil' and ext_id = 'x1') then raise exception 'la fiche importée doit être suivie'; end if;
  if not exists (select 1 from public.journal where item = i and author = u) then raise exception 'l''activité doit dire qui l''a apportée'; end if;
  if current_setting('request.jwt.claim.sub', true) <> '' then raise exception 'le compte emprunté doit être rendu'; end if;
  if public.export_importer(u, 'asana', 'x1', '', 'Deuxième', current_date) is not null then raise exception 'une même tâche ne fait qu''une fiche'; end if;
  if public.export_importer(v, 'asana', 'x9', '', 'Visiteur', current_date) is not null then raise exception 'un visiteur n''importe rien'; end if;

  -- l'outil change la tâche : titre, date, état
  update public.items set flou = 'Déc.' where id = i;
  perform public.export_maj(u, i, 'Vidéo du campus, longue', '2026-12-14', 'diffuse');
  select * into r from public.items where id = i;
  if r.t <> 'Vidéo du campus, longue' or r.date <> '2026-12-14' or r.flou <> '' or r.st <> 'diffuse' then raise exception 'mise à jour depuis l''outil : %', row_to_json(r); end if;
  perform public.export_maj(u, i, null, null, 'planifie');
  if (select st from public.items where id = i) <> 'planifie' then raise exception 'décochée : Prévu'; end if;
  -- une fiche qu'il n'a pas envoyée : rien
  insert into public.items (kind, t, date, svc) values ('action', 'Pas à lui', current_date, s) returning id into i2;
  -- envoyée depuis l'appli (origine appli) : l'outil ne peut pas l'annuler
  insert into public.exports (item, user_id, outil, ext_id, origine) values (i2, u, 'trello', 'c2', 'appli');
  perform public.export_maj(u, i2, null, null, 'retire');
  if (select st from public.items where id = i2) = 'retire' then raise exception 'une fiche envoyée depuis l''appli ne s''annule pas depuis l''outil'; end if;
  delete from public.exports where item = i2;
  -- venue de l'outil, tâche supprimée : « Annulé »
  perform public.export_maj(u, i, null, null, 'retire');
  if (select st from public.items where id = i) <> 'retire' then raise exception 'tâche supprimée : la fiche venue de l''outil passe en Annulé'; end if;
  update public.items set st = 'planifie' where id = i;
  perform public.export_maj(u, i2, 'Volée', null, null);
  if (select t from public.items where id = i2) <> 'Pas à lui' then raise exception 'export_maj ne touche qu''aux fiches suivies par la personne'; end if;
  -- une fiche annulée ne bouge plus
  update public.items set st = 'retire' where id = i;
  perform public.export_maj(u, i, 'Ressuscitée', null, 'diffuse');
  if (select st from public.items where id = i) <> 'retire' then raise exception 'une fiche annulée ne bouge plus'; end if;

  delete from public.items where id in (i, i2);
  delete from public.outils where user_id = u; delete from public.export_conf;
  raise notice 'retour Asana Trello : bon';
end $$;
