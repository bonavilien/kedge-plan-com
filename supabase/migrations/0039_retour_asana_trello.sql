-- 2.10.0 : le retour d'Asana et de Trello vers le plan.
-- Une tâche Asana ou une carte Trello qui porte l'étiquette « Plan de com » arrive dans le plan, « À confirmer »,
-- dans le service de la personne. Ensuite, cocher la tâche passe l'action en « Diffusé », changer l'échéance change la date,
-- renommer la tâche renomme l'action. Asana et Trello préviennent la fonction « export » (webhooks), qui écrit ici
-- au nom de la personne (son nom apparaît dans l'activité de la fiche).
-- Une tâche venue de l'outil garde sa description : l'appli ne réécrit chez elle que le titre, l'échéance et la coche.

-- le crochet de chaque personne : l'adresse secrète que son outil appelle, et ce qu'il faut pour vérifier qu'il s'agit bien de lui
alter table public.outils
  add column if not exists crochet text not null default '',      -- jeton dans l'adresse appelée par l'outil
  add column if not exists hook_id text not null default '',      -- le webhook côté Asana ou Trello
  add column if not exists hook_secret text not null default '';  -- Asana : secret de signature donné à la création

-- d'où vient la tâche : envoyée depuis l'appli, ou venue de l'outil avec l'étiquette
alter table public.exports add column if not exists origine text not null default 'appli' check (origine in ('appli', 'outil'));
create unique index if not exists exports_ext on public.exports (user_id, outil, ext_id);

-- ce que l'appli a le droit de savoir : mes outils, vers où, et si le retour est branché (jamais la clé)
drop function if exists public.outils_actifs();
create function public.outils_actifs() returns table (outil text, cible_nom text, retour boolean)
language sql stable security definer set search_path = public as $$
  select outil, cible_nom, hook_id <> '' from public.outils where user_id = auth.uid() order by outil
$$;
revoke execute on function public.outils_actifs() from public, anon;
grant execute on function public.outils_actifs() to authenticated;

-- une tâche étiquetée arrive : une seule fiche, même si l'outil prévient deux fois en même temps
create function public.export_importer(p_user uuid, p_outil text, p_ext text, p_url text, p_t text, p_date date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_p record; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || p_outil || p_ext));
  if exists (select 1 from public.exports where user_id = p_user and outil = p_outil and ext_id = p_ext) then return null; end if;
  select svc, chef, visiteur into v_p from public.profiles where id = p_user;
  if not found or v_p.visiteur or (v_p.svc is null and not v_p.chef) then return null; end if;
  -- au nom de la personne : l'activité et les notifications disent qui l'a apportée
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  insert into public.items (kind, t, date, svc, st, author)
  values ('action', left(coalesce(nullif(btrim(p_t), ''), 'Sans titre'), 300), coalesce(p_date, current_date), coalesce(v_p.svc, 'chef'), 'confirmer', p_user)
  returning id into v_id;
  insert into public.exports (item, user_id, outil, ext_id, url, origine) values (v_id, p_user, p_outil, p_ext, coalesce(p_url, ''), 'outil');
  perform set_config('request.jwt.claim.sub', '', true);
  return v_id;
end $$;
revoke execute on function public.export_importer(uuid, text, text, text, text, date) from public, anon, authenticated;
grant execute on function public.export_importer(uuid, text, text, text, text, date) to service_role;

-- l'outil a changé la tâche : titre, date ou état de la fiche, au nom de la personne ; rien d'autre ne passe
create function public.export_maj(p_user uuid, p_item uuid, p_t text, p_date date, p_st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.exports where user_id = p_user and item = p_item) then return; end if;
  if p_st is not null and p_st not in ('planifie', 'diffuse') then return; end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  update public.items set
    t = coalesce(nullif(btrim(p_t), ''), t),
    date = coalesce(p_date, date),
    flou = case when p_date is not null then '' else flou end,
    st = coalesce(p_st, st)
  where id = p_item and st <> 'retire';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
revoke execute on function public.export_maj(uuid, uuid, text, date, text) from public, anon, authenticated;
grant execute on function public.export_maj(uuid, uuid, text, date, text) to service_role;
