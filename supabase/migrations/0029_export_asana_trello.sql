-- 2.4.0 : chacun envoie des actions dans SON Asana ou SON Trello, et elles y restent à jour.
-- Chaque personne relie son outil dans Réglages, Mon profil (sa clé, puis le projet Asana ou la liste Trello où arrivent
-- ses fiches). Sur une fiche, le bouton « Asana / Trello » crée la tâche ou la carte chez la personne qui clique.
-- Ensuite, à chaque changement de la fiche (titre, date, état, service, messages, note, documents…), la base appelle
-- la fonction « export », qui met à jour la tâche ou la carte de chaque personne qui l'a envoyée.
-- Supprimer la fiche met les tâches à la corbeille d'Asana, les cartes aux archives de Trello.
-- Les clés restent dans la base, jamais lisibles depuis l'appli (pas même par leur propriétaire) : seule la fonction les lit.

-- l'outil relié d'une personne : sa clé, sa destination, et de quoi écrire le lien de retour vers l'appli
create table public.outils (
  user_id uuid not null references public.profiles (id) on delete cascade,
  outil text not null check (outil in ('asana', 'trello')),
  jeton text not null,
  cible text not null,                         -- projet Asana ou liste Trello
  cible_nom text not null default '',          -- « Espace · Projet », « Tableau · Liste »
  site text not null default '',               -- adresse de l'appli, pour le lien « Ouvrir dans l'appli »
  app text not null default '',                -- nom de l'appli (Road to 7th, Plan de com…)
  maj timestamptz not null default now(),
  primary key (user_id, outil)
);
alter table public.outils enable row level security;
-- aucune règle : ni l'appli ni un visiteur ne lisent cette table, seule la fonction (clé de service) y accède
revoke all on public.outils from anon, authenticated;

-- l'adresse de la fonction export et le secret partagé avec la base (une seule ligne, écrite par la fonction)
create table public.export_conf (
  id boolean primary key default true check (id),
  adresse text not null,
  secret text not null
);
alter table public.export_conf enable row level security;
revoke all on public.export_conf from anon, authenticated;

-- une fiche envoyée par une personne : où elle est dans son outil
create table public.exports (
  item uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  outil text not null check (outil in ('asana', 'trello')),
  ext_id text not null,
  url text not null default '',
  erreur text not null default '',
  maj timestamptz not null default now(),
  primary key (item, user_id, outil)
);
alter table public.exports enable row level security;
create policy lire on public.exports for select to authenticated using (true);
revoke insert, update, delete on public.exports from anon, authenticated;

-- ce que l'appli a le droit de savoir : quels outils J'AI reliés, et vers où (jamais la clé)
create function public.outils_actifs() returns table (outil text, cible_nom text)
language sql stable security definer set search_path = public as $$
  select outil, cible_nom from public.outils where user_id = auth.uid() order by outil
$$;
revoke execute on function public.outils_actifs() from public, anon;
grant execute on function public.outils_actifs() to authenticated;

-- appeler la fonction export, après coup (pg_net part une fois la modification enregistrée)
create function public.export_appel(p_corps jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select adresse, secret into v from public.export_conf;
  if v.adresse is null then return; end if;
  perform net.http_post(
    url := v.adresse,
    body := p_corps,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-export-secret', v.secret),
    timeout_milliseconds := 20000);
end $$;
revoke execute on function public.export_appel(jsonb) from public, anon, authenticated;

-- une fiche envoyée change : on prévient la fonction
create function public.on_item_export() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.exports where item = new.id) then
    perform public.export_appel(jsonb_build_object('item', new.id));
  end if;
  return null;
end $$;
create trigger items_export after update on public.items for each row
  when (old.* is distinct from new.*) execute function public.on_item_export();

-- ses documents changent aussi la description
create function public.on_link_export() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_item uuid := coalesce(new.item, old.item);
begin
  if exists (select 1 from public.exports where item = v_item) then
    perform public.export_appel(jsonb_build_object('item', v_item));
  end if;
  return null;
end $$;
create trigger links_export after insert or update or delete on public.links for each row execute function public.on_link_export();

-- une fiche supprimée : avant qu'elle parte (et ses lignes d'export avec), on dit à la fonction quoi retirer, et chez qui
create function public.on_item_export_suppr() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_agg(jsonb_build_object('user_id', user_id, 'outil', outil, 'ext_id', ext_id)) into v from public.exports where item = old.id;
  if v is not null then perform public.export_appel(jsonb_build_object('supprimer', v)); end if;
  return old;
end $$;
create trigger items_export_suppr before delete on public.items for each row execute function public.on_item_export_suppr();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.exports;
  end if;
end $$;
