-- =====================================================================
-- Plan de com : installation complète de la base, en une fois.
-- Sur un projet Supabase NEUF : SQL Editor, New query, coller tout ce fichier, Run.
-- Supabase peut prévenir d'opérations « destructives » : c'est normal, confirmer.
-- Fabriqué par scripts/installation.mjs à partir de supabase/migrations (36 scripts, dernier : 0037_admin_protege.sql).
-- Ne pas le modifier à la main.
-- =====================================================================
begin;
create schema if not exists kplan_private;
create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());
do $$ begin
  if exists (select 1 from kplan_private.migrations) then
    raise exception 'Cette base est déjà installée : pour la mettre à jour, utilise le bouton « Mettre à jour » de l''appli (Réglages > Version).';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 0001_schema.sql
-- ---------------------------------------------------------------------
-- Plan de com KEDGE : schéma de la base.
-- Base vierge : seuls les référentiels (périodes, messages, services) sont pré-remplis, et restent modifiables.
-- Droits : tout le monde voit tout ; un service modifie ses actions ; les chefs modifient tout ;
-- seuls les comptes « média » saisissent les partenariats média.

-- =====================================================================
-- Référentiels
-- =====================================================================
create table public.periods (
  n smallint primary key,
  nom text not null,
  du date not null,
  au date not null,
  lib text not null default '',
  check (au >= du)
);

create table public.messages (
  n smallint primary key,
  nom text not null,
  info text not null default ''
);

create table public.services (
  k text primary key check (k <> 'chef'),
  nom text not null,
  court text not null,
  ordre smallint not null default 0
);

create table public.partners (
  k text primary key default replace(gen_random_uuid()::text, '-', ''),
  nom text not null
);

-- =====================================================================
-- Personnes : un profil par compte, créé tout seul à la création du compte
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null default '',
  fonction text not null default '',            -- affiché sous le nom (« Chef de projet », « Responsable de l'offre »…)
  svc text references public.services (k) on update cascade on delete set null, -- vide : pas de service de diffusion
  chef boolean not null default false,          -- voit et modifie tout, anime la réunion
  media boolean not null default false,         -- saisit les partenariats média
  notif_all boolean not null default false,     -- prévenu de chaque ajout
  created_at timestamptz not null default now()
);

create function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nom)
  values (new.id, initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '.', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_new_user();

create function public.is_chef() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select chef from public.profiles where id = auth.uid()), false)
$$;

create function public.is_media() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select media from public.profiles where id = auth.uid()), false)
$$;

create function public.my_svc() returns text
language sql stable security definer set search_path = public as $$
  -- '-' ne correspond à aucun service : un compte sans service ni droits de chef ne modifie rien
  select coalesce((select svc from public.profiles where id = auth.uid()), '-')
$$;

-- =====================================================================
-- Objets
-- =====================================================================
-- Une action, un temps fort (kind = 'tf') ou un sujet (temps fort sans date, posé sur des périodes entières : per non vide).
-- Un partenariat média est une action avec un partenaire.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('action', 'tf')),
  t text not null check (length(btrim(t)) > 0),
  date date not null,
  flou text not null default '',                -- « Oct. », « Date à confirmer » : la date n'est connue qu'au mois
  per smallint[] not null default '{}',         -- sujet : numéros des périodes
  svc text not null,                            -- service porteur, ou 'chef'
  cc text[] not null default '{}',              -- services prévenus
  m text[] not null default '{}',               -- messages ('1' à '5') ou 'INC' (incontournable)
  st text not null default 'planifie' check (st in ('idee', 'confirmer', 'planifie', 'production', 'diffuse', 'retire')),
  tf uuid references public.items (id) on delete set null,   -- temps fort ou sujet lié
  partner text references public.partners (k) on update cascade on delete restrict,
  lieu text not null default '',
  note text not null default '',
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_date on public.items (date);
create index items_tf on public.items (tf);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();

-- Liens SharePoint : un lien posé sur une action liée apparaît aussi sur son temps fort, et inversement (fait côté appli)
create table public.links (
  id uuid primary key default gen_random_uuid(),
  item uuid not null references public.items (id) on delete cascade,
  nom text not null default 'Document SharePoint',
  url text not null check (url ~* '^https?://'),
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
create index links_item on public.links (item);

-- Demandes d'éléments : dest est un service, ou 'chef' (les chefs)
create table public.reqs (
  id uuid primary key default gen_random_uuid(),
  item uuid not null references public.items (id) on delete cascade,
  asker uuid references public.profiles (id) on delete set null default auth.uid(),
  dest text not null,
  type text not null,
  quoi text not null default '',
  pour date not null,
  st text not null default 'ouverte' check (st in ('ouverte', 'recue')),
  at timestamptz not null default now()
);
create index reqs_item on public.reqs (item);

-- Points de blocage
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  item uuid not null references public.items (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  why text not null check (length(btrim(why)) > 0),
  leve boolean not null default false,
  at timestamptz not null default now()
);
create index blocks_item on public.blocks (item);

-- Réponses personnelles aux rappels (« Non, c'est bon ») et nouveautés vues
create table public.answers (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key text not null,
  val text not null,
  primary key (user_id, key)
);
create table public.seen (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item uuid not null references public.items (id) on delete cascade,
  primary key (user_id, item)
);

-- Réglages partagés (date de la dernière réunion…)
create table public.meta (
  k text primary key,
  v text not null
);

-- Notifications : abonnements push des téléphones, et boîte d'envoi remplie par la base
create table public.push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table public.outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default '',
  dedupe text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index outbox_pending on public.outbox (id) where sent_at is null;

-- =====================================================================
-- Droits (RLS)
-- =====================================================================
alter table public.periods enable row level security;
alter table public.messages enable row level security;
alter table public.services enable row level security;
alter table public.partners enable row level security;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.links enable row level security;
alter table public.reqs enable row level security;
alter table public.blocks enable row level security;
alter table public.answers enable row level security;
alter table public.seen enable row level security;
alter table public.meta enable row level security;
alter table public.push_subs enable row level security;
alter table public.outbox enable row level security; -- aucune règle : seul le serveur y touche

-- référentiels : lus par tous, modifiés par les chefs
create policy lire on public.periods for select to authenticated using (true);
create policy gerer on public.periods for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy lire on public.messages for select to authenticated using (true);
create policy gerer on public.messages for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy lire on public.services for select to authenticated using (true);
create policy gerer on public.services for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy lire on public.partners for select to authenticated using (true);
create policy gerer on public.partners for all to authenticated using (public.is_media() or public.is_chef()) with check (public.is_media() or public.is_chef());

-- profils : lus par tous ; l'équipe se gère depuis Supabase ou par un chef
create policy lire on public.profiles for select to authenticated using (true);
create policy gerer on public.profiles for update to authenticated using (public.is_chef()) with check (public.is_chef());

-- objets : un service publie et modifie les siens, les chefs tout, les partenariats par les comptes média
create policy lire on public.items for select to authenticated using (true);
create policy publier on public.items for insert to authenticated with check (
  author = auth.uid()
  and (public.is_chef() or svc = public.my_svc())
  and (partner is null or public.is_media())
);
create policy modifier on public.items for update to authenticated
  using ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()))
  with check ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()));

create policy lire on public.links for select to authenticated using (true);
create policy ajouter on public.links for insert to authenticated with check (author = auth.uid());
create policy retirer on public.links for delete to authenticated using (author = auth.uid() or public.is_chef());

create policy lire on public.reqs for select to authenticated using (true);
create policy demander on public.reqs for insert to authenticated with check (asker = auth.uid());
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc())
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc());

create policy lire on public.blocks for select to authenticated using (true);
create policy signaler on public.blocks for insert to authenticated with check (author = auth.uid());
create policy lever on public.blocks for update to authenticated
  using (public.is_chef() or author = auth.uid() or exists (select 1 from public.items i where i.id = item and i.svc = public.my_svc()))
  with check (true);

create policy les_miennes on public.answers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy les_miennes on public.seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy lire on public.meta for select to authenticated using (true);
create policy gerer on public.meta for all to authenticated using (public.is_chef()) with check (public.is_chef());

create policy les_miens on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Notifications : la base remplit la boîte d'envoi, une fonction serveur l'envoie en push
-- =====================================================================
create function public.notify(p_users uuid[], p_title text, p_body text, p_url text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.outbox (user_id, title, body, url, dedupe)
  select u, p_title, p_body, p_url, case when p_dedupe is null then null else p_dedupe || ':' || u end
  from unnest(p_users) as u
  where u is not null
  on conflict (dedupe) do nothing;
end $$;

create function public.nom_de(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select nom from public.profiles where id = p), ''), 'Quelqu''un')
$$;

-- ajout d'une action, d'un temps fort ou d'un sujet : les services cités, et les comptes « prévenus de tout »
create function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (notif_all or svc = any (new.cc))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;
create trigger items_notify after insert on public.items for each row execute function public.on_item_added();

-- demande d'éléments : le service visé (ou les chefs) ; éléments reçus : la personne qui a demandé
create function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  elsif new.st = 'recue' and old.st <> 'recue' then
    perform public.notify(array[new.asker], 'Éléments reçus', new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  end if;
  return new;
end $$;
create trigger reqs_notify after insert or update of st on public.reqs for each row execute function public.on_req();

-- blocage : les chefs et le service de l'action
create function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select t, svc into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc)),
    'Blocage', public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why, '#item=' || new.item);
  return new;
end $$;
create trigger blocks_notify after insert on public.blocks for each row execute function public.on_block();

-- lien ajouté : le service de l'action et les services cités
create function public.on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select t, svc, cc into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (svc = it.svc or svc = any (it.cc))),
    'Nouveau document', public.nom_de(new.author) || ' a ajouté « ' || new.nom || ' » sur « ' || it.t || ' »', '#item=' || new.item);
  return new;
end $$;
create trigger links_notify after insert on public.links for each row execute function public.on_link();

-- rappels J-30, J-15, J-7 avant chaque action datée au jour près, au service qui la porte (une seule fois par jalon)
create function public.queue_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, (i.date - today) as j
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) in (30, 15, 7)
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.j)),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.j);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;
revoke execute on function public.notify(uuid[], text, text, text, text) from public, anon, authenticated;

-- =====================================================================
-- Temps réel : l'écran réunion et les listes se mettent à jour tout seuls
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.items, public.links, public.reqs, public.blocks, public.meta, public.partners;
  end if;
end $$;

-- =====================================================================
-- Référentiels de départ (modifiables ensuite)
-- =====================================================================
insert into public.periods (n, nom, du, au, lib) values
  (1, 'Installer', '2026-09-01', '2026-10-31', 'Sept. – oct. 2026'),
  (2, 'Considérer', '2026-11-01', '2026-12-31', 'Nov. – déc. 2026'),
  (3, 'Préférer', '2027-01-01', '2027-03-31', 'Janv. – mars 2027'),
  (4, 'Convertir', '2027-04-01', '2027-05-31', 'Avril – mai 2027'),
  (5, 'Décider', '2027-06-01', '2027-07-15', 'Juin – mi-juillet 2027');

insert into public.messages (n, nom, info) values
  (1, 'Filières', 'Finance · Supply · Sales, employabilité, consortia, excellence académique'),
  (2, 'Alumni', 'Le réseau alumni'),
  (3, 'International', 'Top universités, stages et expérience à l''international'),
  (4, 'Continuum', 'Le continuum prépa (PGE), géopolitique'),
  (5, 'Réputation', 'Classements');

insert into public.services (k, nom, court, ordre) values
  ('rp', 'Relations presse', 'RP', 1),
  ('rs', 'Réseaux sociaux', 'RS', 2),
  ('video', 'Production vidéo', 'Vidéo', 3);

insert into public.meta (k, v) values ('last_meeting', to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD'));
insert into kplan_private.migrations (name) values ('0001_schema.sql');

-- ---------------------------------------------------------------------
-- 0002_planification.sql
-- ---------------------------------------------------------------------
-- Plan de com KEDGE : envoi des notifications et rappels programmés.
-- Chaque matin, la base prépare les rappels J-30, J-15, J-7 ; chaque minute, s'il y a des messages en attente,
-- elle appelle la fonction push (supabase/functions/push) qui les envoie sur les téléphones.
-- L'adresse de la fonction et le secret partagé sont rangés dans le coffre (Vault) par scripts/setup.mjs :
--   kplan_push_url    https://<projet>.supabase.co/functions/v1/push
--   kplan_cron_secret le même secret que CRON_SECRET côté fonction
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function public.flush_outbox() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  -- un message vieux de plus de deux jours n'a plus de sens (fonction pas encore branchée, panne) : on l'abandonne
  update public.outbox set sent_at = now(), error = 'trop ancien, pas envoyé'
  where sent_at is null and created_at < now() - interval '2 days';
  if not exists (select 1 from public.outbox where sent_at is null) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kplan_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'kplan_cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 20000);
end $$;
revoke execute on function public.flush_outbox() from public, anon, authenticated;

-- heures en temps universel : 7 h, c'est 8 h ou 9 h à Paris
select cron.schedule('kplan-rappels', '0 7 * * *', 'select public.queue_reminders()');
select cron.schedule('kplan-envoi', '* * * * *', 'select public.flush_outbox()');
select cron.schedule('kplan-menage', '30 3 * * *', $$delete from public.outbox where sent_at < now() - interval '60 days'$$);
insert into kplan_private.migrations (name) values ('0002_planification.sql');

-- ---------------------------------------------------------------------
-- 0003_historique.sql
-- ---------------------------------------------------------------------
-- Historique de chaque fiche (création, modifications, documents, relances)
-- et « prévenir à nouveau » après un changement de date, de titre ou de précisions.

-- =====================================================================
-- Journal : rempli par la base elle-même, personne ne peut l'écrire ni l'effacer
-- =====================================================================
create table public.journal (
  id bigint generated always as identity primary key,
  item uuid not null references public.items (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  kind text not null check (kind in ('creation', 'modif', 'document', 'prevenu')),
  diff jsonb not null default '{}'   -- modif : {champ: [avant, après]} ; document : {nom} ; prevenu : {quoi, n}
);
create index journal_item on public.journal (item, at);
alter table public.journal enable row level security;
create policy lire on public.journal for select to authenticated using (true);

-- les fiches déjà saisies ont au moins leur création
insert into public.journal (item, author, at, kind) select id, author, at, 'creation' from public.items;

-- création et modification d'une fiche : seuls les champs qu'on voit sont suivis (pas updated_at)
create function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), new.at, 'creation');
    return new;
  end if;
  foreach k in array array['t', 'date', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
create trigger items_journal after insert or update on public.items for each row execute function public.on_item_journal();

create function public.on_link_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.journal (item, author, kind, diff) values (new.item, new.author, 'document', jsonb_build_object('nom', new.nom));
  return new;
end $$;
create trigger links_journal after insert on public.links for each row execute function public.on_link_journal();

-- =====================================================================
-- Prévenir à nouveau : la personne qui modifie choisit de prévenir, la base envoie.
-- Les mêmes personnes qu'à la création (prévenues de tout, services cités), plus le service porteur
-- et, pour un temps fort ou un sujet, les services de ses relais. Jamais l'auteur du changement.
-- =====================================================================
create function public.renotify(p_item uuid, p_quoi text) returns int
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  dests uuid[];
begin
  select * into it from public.items where id = p_item;
  if it.id is null then raise exception 'fiche introuvable'; end if;
  -- seuls ceux qui peuvent modifier la fiche peuvent prévenir (mêmes règles que la modification)
  if not ((it.partner is null and (public.is_chef() or it.svc = public.my_svc())) or (it.partner is not null and public.is_media())) then
    raise exception 'pas le droit de prévenir pour cette fiche' using errcode = '42501';
  end if;
  p_quoi := left(btrim(coalesce(p_quoi, '')), 300);
  if p_quoi = '' then raise exception 'rien à dire'; end if;
  dests := array(select id from public.profiles where id is distinct from auth.uid() and (
    notif_all or svc = any (it.cc) or svc = it.svc
    or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire')));
  -- un double appui dans la même minute n'envoie qu'une fois
  perform public.notify(dests, 'Modifié : ' || it.t, public.nom_de(auth.uid()) || ' : ' || p_quoi, '#item=' || it.id,
    'modif:' || it.id || ':' || md5(p_quoi || to_char(now(), 'YYYY-MM-DD HH24:MI')));
  insert into public.journal (item, kind, diff) values (it.id, 'prevenu', jsonb_build_object('quoi', p_quoi, 'n', cardinality(dests)));
  return cardinality(dests);
end $$;
revoke execute on function public.renotify(uuid, text) from public, anon;
grant execute on function public.renotify(uuid, text) to authenticated;
revoke execute on function public.on_item_journal() from public, anon, authenticated;
revoke execute on function public.on_link_journal() from public, anon, authenticated;

-- temps réel : l'historique d'une fiche ouverte se met à jour tout seul
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.journal;
  end if;
end $$;
insert into kplan_private.migrations (name) values ('0003_historique.sql');

-- ---------------------------------------------------------------------
-- 0004_corrections.sql
-- ---------------------------------------------------------------------
-- Corrections après la campagne de tests du 25 octobre 2026 :
-- droits resserrés (comptes sans service, champs figés, partenariats), notifications manquantes,
-- rappels J-30 / J-15 / J-7 rattrapés et liés à la date, envoi réessayé après une panne.

-- =====================================================================
-- Droits
-- =====================================================================
-- un compte sans service n'a aucun service : null n'est égal à rien, donc il ne publie ni ne modifie rien
create or replace function public.my_svc() returns text
language sql stable security definer set search_path = public as $$
  select svc from public.profiles where id = auth.uid()
$$;

-- un partenariat est porté par le chef de projet : c'est le droit « média » qui compte, pas le service
drop policy publier on public.items;
create policy publier on public.items for insert to authenticated with check (
  author = auth.uid()
  and ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()))
);

-- seuls les comptes « média » gèrent la liste des partenaires
drop policy gerer on public.partners;
create policy gerer on public.partners for all to authenticated using (public.is_media()) with check (public.is_media());

-- les documents : ceux qui publient (service, chef, média) ; un compte en lecture seule demande des éléments
drop policy ajouter on public.links;
create policy ajouter on public.links for insert to authenticated
  with check (author = auth.uid() and (public.is_chef() or public.is_media() or public.my_svc() is not null));

-- lever un blocage : les chefs, l'auteur du blocage, ceux qui peuvent modifier la fiche
drop policy lever on public.blocks;
create policy lever on public.blocks for update to authenticated
  using (public.is_chef() or author = auth.uid() or exists (select 1 from public.items i where i.id = item
    and ((i.partner is null and i.svc = public.my_svc()) or (i.partner is not null and public.is_media()))))
  with check (leve);

-- ce qu'on ne réécrit pas après coup. Seuls les comptes connectés sont tenus (le tableau de bord Supabase reste libre).
create function public.keep_items() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.at := now(); return new; end if;
  new.author := old.author; new.at := old.at; new.kind := old.kind;
  return new;
end $$;
create trigger items_keep before insert or update on public.items for each row execute function public.keep_items();

-- une demande : le service sollicité ne fait que répondre ; la personne qui demande (ou un chef) peut changer quoi et la deadline
create function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  -- l'heure de la base, pas celle envoyée par le téléphone (la limite de 10 demandes en dépend)
  if tg_op = 'INSERT' then new.at := now(); return new; end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if (new.dest, new.type) is distinct from (old.dest, old.type) and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger reqs_keep before insert or update on public.reqs for each row execute function public.keep_reqs();

-- un blocage se lève, il ne se réécrit pas
create function public.keep_blocks() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.at := now(); return new; end if;
  new.item := old.item; new.author := old.author; new.why := old.why; new.at := old.at;
  return new;
end $$;
create trigger blocks_keep before insert or update on public.blocks for each row execute function public.keep_blocks();

-- un document : l'heure de la base, et un lien SharePoint sécurisé (https), comme dans l'appli
create function public.keep_links() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.url !~* '^https://' then raise exception 'le lien doit commencer par https://' using errcode = '23514'; end if;
  new.at := now();
  return new;
end $$;
create trigger links_keep before insert on public.links for each row execute function public.keep_links();

-- un document retiré se voit dans l'historique, comme un document ajouté
create function public.on_unlink_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.items where id = old.item) then
    insert into public.journal (item, kind, diff) values (old.item, 'document', jsonb_build_object('nom', old.nom, 'retire', true));
  end if;
  return old;
end $$;
create trigger links_unjournal after delete on public.links for each row execute function public.on_unlink_journal();

-- le droit « média » ne se donne et ne se retire que par un compte média (Julien reste seul à saisir les partenariats)
create function public.keep_profiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.media is distinct from old.media and not public.is_media() then
    raise exception 'seul un compte « Partenariats média » peut changer ce droit' using errcode = '42501';
  end if;
  if new.id = auth.uid() and new.chef is distinct from old.chef then
    raise exception 'un autre chef de projet doit changer tes droits de chef' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_keep before update on public.profiles for each row execute function public.keep_profiles();

-- un abonnement de téléphone passe à la personne qui l'active (téléphone partagé, compte changé sans se déconnecter)
create function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'connecte-toi' using errcode = '42501'; end if;
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke execute on function public.save_push(text, text, text) from public, anon;
grant execute on function public.save_push(text, text, text) to authenticated;

-- =====================================================================
-- Cohérence des fiches
-- =====================================================================
-- service porteur connu, temps fort lié qui en est bien un, messages connus, « Incontournable » seul
create function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un temps fort ou un sujet n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind = 'tf' or new.tf = new.id or not exists (select 1 from public.items where id = new.tf and kind = 'tf')) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort ou un sujet' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'INC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  if 'INC' = any (new.m) and cardinality(new.m) > 1 then
    new.m := array['INC'];
  end if;
  return new;
end $$;
create trigger items_check before insert or update of svc, tf, m on public.items for each row execute function public.check_item();

-- un service renommé : ses fiches, ses citations et ses demandes suivent (les profils suivent déjà)
create function public.on_service_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.k is distinct from old.k then
    -- un renommage n'est pas une nouvelle : les fiches suivent sans prévenir personne
    perform set_config('kplan.renommage', '1', true);
    update public.items set svc = new.k where svc = old.k;
    update public.items set cc = array_replace(cc, old.k, new.k) where old.k = any (cc);
    update public.reqs set dest = new.k where dest = old.k;
    perform set_config('kplan.renommage', '', true);
  end if;
  return new;
end $$;
create trigger services_rename after update of k on public.services for each row execute function public.on_service_rename();

-- un service qui porte encore des fiches ou des demandes ouvertes ne se supprime pas (elles n'auraient plus de service)
create function public.check_service_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.items where svc = old.k) or exists (select 1 from public.reqs where dest = old.k and st = 'ouverte') then
    raise exception 'ce service porte encore des fiches : passe-les à un autre service avant de le supprimer' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger services_delete before delete on public.services for each row execute function public.check_service_delete();

-- les périodes ne se chevauchent pas ; vérifié à la fin de la requête, pour qu'une frontière se déplace en une fois
create function public.check_period() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.periods p where p.n <> new.n and p.du <= new.au and p.au >= new.du) then
    raise exception 'cette période chevauche une autre période' using errcode = '23P01';
  end if;
  return new;
end $$;
create constraint trigger periods_no_overlap after insert or update on public.periods deferrable initially immediate
  for each row execute function public.check_period();

-- =====================================================================
-- Notifications
-- =====================================================================
-- à la création : le service porteur aussi (une action posée par un chef pour RP prévient RP),
-- les chefs pour une action du chef de projet, les comptes média pour un partenariat
create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = any (new.cc)
      or (new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

-- après coup : un service ajouté à « Qui prévenir » est prévenu, un nouveau service porteur aussi ;
-- une fiche retirée prévient ceux qui la suivaient (les chefs pour une fiche du chef de projet, les comptes média pour un partenariat)
create function public.on_item_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[] := array(select x from unnest(new.cc) as x where not (x = any (old.cc)));
  quoi text := case when new.kind = 'tf' and cardinality(new.per) > 0 then 'le sujet' when new.kind = 'tf' then 'le temps fort' else 'l''action' end;
begin
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  if new.svc is distinct from old.svc and new.st <> 'retire' and new.partner is null then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (svc = new.svc or (new.svc = 'chef' and chef))),
      'Confié à ton service', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'porte:' || new.id || ':' || new.svc || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if cardinality(added) > 0 and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and svc = any (added)),
      'Ton service est cité', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'cite:' || new.id || ':' || array_to_string(added, ',') || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Retiré : ' || new.t, public.nom_de(auth.uid()) || ' a retiré ' || quoi || '.', '#item=' || new.id,
      'retire:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  if old.st = 'retire' and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Remis : ' || new.t, public.nom_de(auth.uid()) || ' a remis ' || quoi || '.', '#item=' || new.id,
      'remis:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;
create trigger items_changed after update of svc, cc, st on public.items for each row execute function public.on_item_changed();

-- demande d'éléments : une notification par demande (une demande identique encore ouverte est refusée plus bas) ;
-- « éléments reçus » ne prévient pas la personne qui le note elle-même
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus', new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  end if;
  return new;
end $$;

-- une deadline changée : le service sollicité est prévenu, et la personne qui a demandé si c'est un chef qui change la date ;
-- le changement s'inscrit dans l'historique de la fiche
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check check (kind in ('creation', 'modif', 'document', 'prevenu', 'deadline'));
create function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest or id = new.asker)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || old.pour || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;
create trigger reqs_pour after update of pour on public.reqs for each row execute function public.on_req_pour();

-- une demande identique encore ouverte est refusée, et on ne peut pas en envoyer des dizaines d'affilée
create function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest <> 'chef' and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger reqs_check before insert on public.reqs for each row execute function public.check_req();

-- document ajouté : le service porteur, les services cités, ceux des relais d'un temps fort,
-- les chefs pour une fiche du chef de projet, les comptes média pour un partenariat, les prévenus de tout
create or replace function public.on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select id, t, svc, cc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = it.svc or svc = any (it.cc) or (it.svc = 'chef' and it.partner is null and chef) or (it.partner is not null and media)
      or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire'))),
    'Nouveau document', public.nom_de(new.author) || ' a ajouté « ' || new.nom || ' » sur « ' || it.t || ' »', '#item=' || new.item);
  return new;
end $$;

-- blocage : les chefs, le service de la fiche, et les comptes média pour un partenariat (seuls à pouvoir le modifier)
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select t, svc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc or (it.partner is not null and media))),
    'Blocage', public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why, '#item=' || new.item);
  return new;
end $$;

-- prévenir à nouveau : un double appui n'écrit ni n'envoie deux fois, et pas plus de 5 relances par heure et par fiche
create or replace function public.renotify(p_item uuid, p_quoi text) returns int
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  dests uuid[];
  k text;
begin
  select * into it from public.items where id = p_item;
  if it.id is null then raise exception 'fiche introuvable'; end if;
  -- coalesce : sans service, my_svc() est vide et la comparaison ne vaut ni vrai ni faux
  if not coalesce((it.partner is null and (public.is_chef() or it.svc = public.my_svc())) or (it.partner is not null and public.is_media()), false) then
    raise exception 'pas le droit de prévenir pour cette fiche' using errcode = '42501';
  end if;
  p_quoi := left(btrim(coalesce(p_quoi, '')), 300);
  if p_quoi = '' then raise exception 'rien à dire'; end if;
  k := 'modif:' || it.id || ':' || md5(p_quoi || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  if exists (select 1 from public.outbox where dedupe like k || ':%')
     or exists (select 1 from public.journal where item = it.id and kind = 'prevenu' and author = auth.uid() and diff ->> 'quoi' = p_quoi and at > now() - interval '1 minute') then
    return 0;
  end if;
  if (select count(*) from public.journal where item = it.id and kind = 'prevenu' and author = auth.uid() and at > now() - interval '1 hour') >= 5 then
    raise exception 'déjà prévenu plusieurs fois cette heure-ci' using errcode = '54000';
  end if;
  dests := array(select id from public.profiles where id is distinct from auth.uid() and (
    notif_all or svc = any (it.cc) or svc = it.svc or (it.svc = 'chef' and it.partner is null and chef) or (it.partner is not null and media)
    or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire')));
  perform public.notify(dests, 'Modifié : ' || it.t, public.nom_de(auth.uid()) || ' : ' || p_quoi, '#item=' || it.id, k);
  insert into public.journal (item, kind, diff) values (it.id, 'prevenu', jsonb_build_object('quoi', p_quoi, 'n', cardinality(dests)));
  return cardinality(dests);
end $$;

-- le journal note l'heure de la base, pas celle du téléphone
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;

-- =====================================================================
-- Rappels J-30, J-15, J-7
-- =====================================================================
-- Chaque matin, pour chaque action datée au jour près dans les 30 jours : le jalon le plus proche déjà atteint
-- (30, 15 ou 7), s'il n'a pas encore été envoyé pour cette date. Une action créée à J-5, ou un matin manqué,
-- reçoit donc son rappel au passage suivant ; une action décalée repart avec ses nouveaux jalons.
-- Pas de rappel pour celui qui a déjà demandé des éléments sur la fiche ou son temps fort (lui ou son service),
-- ni pour celui qui a répondu « Pas besoin » pour cette date et ce jalon.
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- =====================================================================
-- Envoi : un message qui n'a pu partir (panne passagère) est réessayé à la minute suivante, cinq fois au plus
-- =====================================================================
alter table public.outbox add column tries smallint not null default 0;

revoke execute on function public.keep_items() from public, anon, authenticated;
revoke execute on function public.keep_links() from public, anon, authenticated;
revoke execute on function public.on_unlink_journal() from public, anon, authenticated;
revoke execute on function public.check_service_delete() from public, anon, authenticated;
-- un nom ne se lit qu'une fois connecté
revoke execute on function public.nom_de(uuid) from public, anon;
grant execute on function public.nom_de(uuid) to authenticated;
revoke execute on function public.keep_reqs() from public, anon, authenticated;
revoke execute on function public.keep_blocks() from public, anon, authenticated;
revoke execute on function public.keep_profiles() from public, anon, authenticated;
revoke execute on function public.check_item() from public, anon, authenticated;
revoke execute on function public.check_req() from public, anon, authenticated;
revoke execute on function public.check_period() from public, anon, authenticated;
revoke execute on function public.on_service_rename() from public, anon, authenticated;
revoke execute on function public.on_item_changed() from public, anon, authenticated;
revoke execute on function public.on_req_pour() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0004_corrections.sql');

-- ---------------------------------------------------------------------
-- 0005_visiteur.sql
-- ---------------------------------------------------------------------
-- Mode visiteur : un compte qui voit tout et ne change rien (ni demande d'éléments, ni blocage, ni document).
-- Réglé par un chef de projet dans Profil > Équipe ; un visiteur n'a ni service, ni droits de chef ou média.

alter table public.profiles add column visiteur boolean not null default false;

create function public.is_visiteur() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select visiteur from public.profiles where id = auth.uid()), false)
$$;

drop policy demander on public.reqs;
create policy demander on public.reqs for insert to authenticated with check (asker = auth.uid() and not public.is_visiteur());

drop policy signaler on public.blocks;
create policy signaler on public.blocks for insert to authenticated with check (author = auth.uid() and not public.is_visiteur());

drop policy ajouter on public.links;
create policy ajouter on public.links for insert to authenticated
  with check (author = auth.uid() and not public.is_visiteur() and (public.is_chef() or public.is_media() or public.my_svc() is not null));

-- un visiteur reste en lecture seule même si on lui coche un droit par erreur
create function public.keep_visiteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visiteur then new.svc := null; new.chef := false; new.media := false; new.notif_all := false; end if;
  return new;
end $$;
create trigger profiles_visiteur before insert or update on public.profiles for each row execute function public.keep_visiteur();

-- le compte visiteur@example.com (l'adresse de site/config.js) est visiteur dès sa création dans Supabase
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nom, visiteur)
  values (new.id, initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '.', 1)), lower(coalesce(new.email, '')) = 'visiteur@example.com')
  on conflict (id) do nothing;
  return new;
end $$;
update public.profiles p set visiteur = true from auth.users u where u.id = p.id and lower(u.email) = 'visiteur@example.com';
insert into kplan_private.migrations (name) values ('0005_visiteur.sql');

-- ---------------------------------------------------------------------
-- 0006_reponses.sql
-- ---------------------------------------------------------------------
-- Demandes d'éléments : la personne qui demande (ou un chef) peut retirer sa demande,
-- et le service sollicité répond avec un message et, au besoin, un document.
-- Le document va sur le temps fort (ou le sujet) quand l'action y est liée, sinon sur la fiche :
-- il se voit donc partout où la demande se voit.

alter table public.reqs drop constraint reqs_st_check;
alter table public.reqs add constraint reqs_st_check check (st in ('ouverte', 'recue', 'annulee'));
alter table public.reqs
  add column reponse text not null default '' check (char_length(reponse) <= 1000),
  add column repondu_par uuid references public.profiles (id) on delete set null,
  add column repondu_at timestamptz;
-- le document envoyé en réponse à une demande
alter table public.links add column req uuid references public.reqs (id) on delete set null;

-- ce qu'on ne réécrit pas après coup, plus : retirer (demandeur ou chef, sans retour) et la réponse, écrite une fois
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if old.st = 'annulee' then
    new.st := 'annulee';
  elsif new.st = 'annulee' and not (public.is_chef() or old.asker = auth.uid()) then
    raise exception 'seule la personne qui a demandé, ou un chef, retire la demande' using errcode = '42501';
  end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    new.reponse := left(btrim(coalesce(new.reponse, '')), 1000); new.repondu_par := auth.uid(); new.repondu_at := now();
  else
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
  end if;
  if (new.dest, new.type) is distinct from (old.dest, old.type) and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- notifications : la réponse arrive avec son message ; une demande retirée prévient le service sollicité
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande retirée', public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  end if;
  return new;
end $$;

-- l'historique de la fiche garde la réponse et le retrait
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check
  check (kind in ('creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait'));
create function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest));
  end if;
  return new;
end $$;
create trigger reqs_journal after update of st on public.reqs for each row execute function public.on_req_journal();
revoke execute on function public.on_req_journal() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0006_reponses.sql');

-- ---------------------------------------------------------------------
-- 0007_services.sql
-- ---------------------------------------------------------------------
-- Corrections après les tests par service du 25 octobre 2026 :
-- demandes d'une fiche retirée, rappels après un retrait de demande, une seule notification par réponse,
-- droits gardés lors d'un passage en visiteur, réponse qui ne se rouvre pas.

-- =====================================================================
-- Une fiche retirée : ses demandes encore ouvertes sont retirées, le service sollicité est prévenu.
-- Sauf une action liée à un temps fort (ou un sujet) encore actif : ses demandes servent à tout le temps fort et restent.
-- =====================================================================
create function public.on_item_retire_reqs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'retire' and old.st <> 'retire'
     and not (new.tf is not null and exists (select 1 from public.items t where t.id = new.tf and t.st <> 'retire')) then
    perform set_config('kplan.retrait', '1', true);
    update public.reqs set st = 'annulee' where item = new.id and st = 'ouverte';
    perform set_config('kplan.retrait', '', true);
  end if;
  return new;
end $$;
create trigger items_retire_reqs after update of st on public.items for each row execute function public.on_item_retire_reqs();
revoke execute on function public.on_item_retire_reqs() from public, anon, authenticated;

-- ce qu'on ne réécrit pas après coup : une demande reçue reste reçue (sa réponse ne disparaît pas),
-- une demande retirée reste retirée ; la fiche retirée retire elle-même ses demandes
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if coalesce(current_setting('kplan.retrait', true), '') = '1' then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
    return new;
  end if;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if old.st in ('annulee', 'recue') then
    new.st := old.st;
  elsif new.st = 'annulee' and not (public.is_chef() or old.asker = auth.uid()) then
    raise exception 'seule la personne qui a demandé, ou un chef, retire la demande' using errcode = '42501';
  end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    new.reponse := left(btrim(coalesce(new.reponse, '')), 1000); new.repondu_par := auth.uid(); new.repondu_at := now();
  else
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
  end if;
  if (new.dest, new.type) is distinct from (old.dest, old.type) and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- notifications : une demande retirée avec sa fiche le dit
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || new.type
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

-- =====================================================================
-- Rappels J-30, J-15, J-7 : une demande retirée ne compte plus comme « déjà demandé » (comme dans l'appli)
-- =====================================================================
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee'
                                and (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- =====================================================================
-- Document joint à une réponse : la personne qui a demandé a déjà « Éléments reçus », pas de second message
-- =====================================================================
create or replace function public.on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select id, t, svc, cc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author
      and id is distinct from (select asker from public.reqs where id = new.req) and (
      notif_all or svc = it.svc or svc = any (it.cc) or (it.svc = 'chef' and it.partner is null and chef) or (it.partner is not null and media)
      or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire'))),
    'Nouveau document', public.nom_de(new.author) || ' a ajouté « ' || new.nom || ' » sur « ' || it.t || ' »', '#item=' || new.item);
  return new;
end $$;

-- =====================================================================
-- Passer quelqu'un en visiteur lui retire ses droits : le droit média ne se retire que par un compte média,
-- et ses propres droits de chef par un autre chef (comme quand on décoche l'interrupteur)
-- =====================================================================
create or replace function public.keep_profiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  -- ce qu'il restera une fois le visiteur appliqué (keep_visiteur passe après)
  if (new.media and not new.visiteur) is distinct from old.media and not public.is_media() then
    raise exception 'seul un compte « Partenariats média » peut changer ce droit' using errcode = '42501';
  end if;
  if new.id = auth.uid() and (new.chef and not new.visiteur) is distinct from old.chef then
    raise exception 'un autre chef de projet doit changer tes droits de chef' using errcode = '42501';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0007_services.sql');

-- ---------------------------------------------------------------------
-- 0008_suppression.sql
-- ---------------------------------------------------------------------
-- Supprimer pour de bon une fiche retirée : ceux qui peuvent la modifier (son service, les chefs, les comptes média
-- pour un partenariat), et seulement une fois retirée (retirer d'abord prévient les services concernés).
-- Ses documents, demandes, blocages et son historique partent avec elle ; les relais d'un temps fort supprimé restent, sans temps fort.
create policy supprimer on public.items for delete to authenticated using (
  st = 'retire'
  and ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()))
);
insert into kplan_private.migrations (name) values ('0008_suppression.sql');

-- ---------------------------------------------------------------------
-- 0009_direction_programme.sql
-- ---------------------------------------------------------------------
-- Demande à la Direction du Programme : un chef de projet note pour lui-même une info qu'il ira chercher
-- (dest 'programme'). Personne d'autre n'est notifié ; le chef la marque reçue lui-même (ou un autre chef).

-- qui peut l'envoyer : seulement un chef ; le reste des règles de check_req (0004) est inchangé
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest not in ('chef', 'programme') and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 'programme' n'est pas un service : un service ne peut pas s'appeler ainsi
alter table public.services add constraint services_pas_programme check (k <> 'programme');
insert into kplan_private.migrations (name) values ('0009_direction_programme.sql');

-- ---------------------------------------------------------------------
-- 0010_plusieurs_jours.sql
-- ---------------------------------------------------------------------
-- Un temps fort sur plusieurs jours (semaine séminaire…) : date = premier jour, fin = dernier jour.
-- Vide pour un temps fort d'un jour, une action, un sujet ou une date connue au mois seulement.
-- Les rappels J-30, J-15, J-7 ne changent pas : ils portent sur la date de chaque action.
alter table public.items add column fin date;
alter table public.items add constraint items_fin check (fin is null or (kind = 'tf' and fin > date));

-- le journal note aussi un changement de fin
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
revoke execute on function public.on_item_journal() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0010_plusieurs_jours.sql');

-- ---------------------------------------------------------------------
-- 0011_classements.sql
-- ---------------------------------------------------------------------
-- Un classement (SIGEM, Financial Times…) : ni temps fort ni sujet, un moment de l'année à part.
-- date = jour de publication (ou son mois seulement, « Sept. »), rang = place actuelle de KEDGE, cible = l'objectif (top N).
-- Comme un temps fort, il peut avoir des relais (actions liées). Seuls les chefs de projet le saisissent : il est porté par 'chef'.
alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('action', 'tf', 'classement'));
alter table public.items add column rang smallint, add column cible smallint;
alter table public.items add constraint items_rang check (
  (rang is null or rang between 1 and 999) and (cible is null or cible between 1 and 999) and (kind = 'classement' or (rang is null and cible is null)));

-- service porteur connu, fiche liée qui est bien un temps fort, un sujet ou un classement, messages connus, « Incontournable » seul
create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans message ni partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0 or cardinality(new.m) > 0) then
    raise exception 'un classement est saisi par un chef de projet, sans message' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'INC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  if 'INC' = any (new.m) and cardinality(new.m) > 1 then
    new.m := array['INC'];
  end if;
  return new;
end $$;
drop trigger items_check on public.items;
create trigger items_check before insert or update of svc, tf, m, per, partner on public.items for each row execute function public.check_item();

create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'classement' then 'Nouveau classement'
                    when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = any (new.cc)
      or (new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

create or replace function public.on_item_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[] := array(select x from unnest(new.cc) as x where not (x = any (old.cc)));
  quoi text := case when new.kind = 'classement' then 'le classement' when new.kind = 'tf' and cardinality(new.per) > 0 then 'le sujet'
                    when new.kind = 'tf' then 'le temps fort' else 'l''action' end;
begin
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  if new.svc is distinct from old.svc and new.st <> 'retire' and new.partner is null then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (svc = new.svc or (new.svc = 'chef' and chef))),
      'Confié à ton service', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'porte:' || new.id || ':' || new.svc || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if cardinality(added) > 0 and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and svc = any (added)),
      'Ton service est cité', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'cite:' || new.id || ':' || array_to_string(added, ',') || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Retiré : ' || new.t, public.nom_de(auth.uid()) || ' a retiré ' || quoi || '.', '#item=' || new.id,
      'retire:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  if old.st = 'retire' and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Remis : ' || new.t, public.nom_de(auth.uid()) || ' a remis ' || quoi || '.', '#item=' || new.id,
      'remis:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;

-- le journal note aussi un changement de rang ou d'objectif
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note', 'rang', 'cible'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
revoke execute on function public.on_item_journal() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0011_classements.sql');

-- ---------------------------------------------------------------------
-- 0012_corrections_26_oct.sql
-- ---------------------------------------------------------------------
-- Corrections après la campagne de tests du 26 octobre 2026, et demandes à la « Resp. offre ».

-- =====================================================================
-- La responsable de l'offre (Estelle) reçoit des demandes d'éléments, comme un service (dest 'offre').
-- Un chef coche « Resp. offre » dans Équipe ; un profil dont la fonction est « Responsable de l'offre » l'est d'office.
-- =====================================================================
alter table public.profiles add column offre boolean not null default false;
update public.profiles set offre = true where fonction ilike 'responsable de l%offre%' and not visiteur;
alter table public.services add constraint services_pas_offre check (k <> 'offre');

create function public.is_offre() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select offre from public.profiles where id = auth.uid()), false)
$$;

-- elle répond aux demandes qui lui sont faites
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()))
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()));

-- un visiteur ne reçoit rien
create or replace function public.keep_visiteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visiteur then new.svc := null; new.chef := false; new.media := false; new.notif_all := false; new.offre := false; end if;
  return new;
end $$;

-- destinataires d'une demande : un service, les chefs, la responsable de l'offre (la Direction du Programme : personne)
create function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where (p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
$$;
revoke execute on function public.req_dests(text) from public, anon, authenticated;

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest not in ('chef', 'programme', 'offre') and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from auth.uid()),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || new.type
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || old.pour || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- =====================================================================
-- Une demande garde son destinataire : le changer après coup contournait la règle « Direction du Programme : chefs
-- seulement », et le service d'arrivée n'était jamais prévenu. Pour demander à quelqu'un d'autre, on retire et on redemande.
-- Exceptions : un service renommé (0004), une fiche supprimée qui confie ses demandes à son temps fort (kplan.transfert, plus bas).
-- =====================================================================
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  -- un service renommé (son code change) et une fiche supprimée qui confie ses demandes : seuls cas où dest ou item bougent
  if coalesce(current_setting('kplan.transfert', true), '') = '1' or coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at; new.dest := old.dest;
  if coalesce(current_setting('kplan.retrait', true), '') = '1' then
    new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
    return new;
  end if;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if old.st in ('annulee', 'recue') then
    new.st := old.st;
  elsif new.st = 'annulee' and not (public.is_chef() or old.asker = auth.uid()) then
    raise exception 'seule la personne qui a demandé, ou un chef, retire la demande' using errcode = '42501';
  end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    new.reponse := left(btrim(coalesce(new.reponse, '')), 1000); new.repondu_par := auth.uid(); new.repondu_at := now();
  else
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
  end if;
  if new.type is distinct from old.type and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- =====================================================================
-- Supprimer une fiche ne fait plus perdre ce qui sert encore ailleurs :
-- - un relais d'un temps fort encore actif : ses demandes (ouvertes ou reçues) passent sur le temps fort ;
-- - un temps fort : les documents envoyés en réponse aux demandes de ses relais restent, sur ces relais.
-- =====================================================================
create function public.on_item_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tf is not null and exists (select 1 from public.items t where t.id = old.tf and t.st <> 'retire') then
    perform set_config('kplan.transfert', '1', true);
    update public.reqs set item = old.tf where item = old.id and st <> 'annulee';
    perform set_config('kplan.transfert', '', true);
  end if;
  update public.links l set item = q.item from public.reqs q where l.item = old.id and l.req = q.id and q.item <> old.id;
  return old;
end $$;
create trigger items_delete before delete on public.items for each row execute function public.on_item_delete();
revoke execute on function public.on_item_delete() from public, anon, authenticated;

-- =====================================================================
-- Un dernier jour seulement pour un temps fort daté au jour près (ni sujet, ni date connue au mois)
-- =====================================================================
update public.items set fin = null
  where fin is not null and not (kind = 'tf' and fin > date and coalesce(cardinality(per), 0) = 0 and (flou = '' or flou ~ '^\d'));
alter table public.items drop constraint items_fin;
alter table public.items add constraint items_fin check (
  fin is null or (kind = 'tf' and fin > date and coalesce(cardinality(per), 0) = 0 and (flou = '' or flou ~ '^\d')));
insert into kplan_private.migrations (name) values ('0012_corrections_26_oct.sql');

-- ---------------------------------------------------------------------
-- 0013_demande_a_soi.sql
-- ---------------------------------------------------------------------
-- Une demande à soi-même (dest 'moi') : un chef de projet se note des éléments qu'il doit fournir lui-même.
-- Personne d'autre n'est prévenu (aucun profil ne reçoit 'moi') ; la demande est dans son À faire, il la marque faite.

-- 'moi' n'est pas un service : un service ne peut pas s'appeler ainsi
alter table public.services drop constraint if exists services_pas_moi;
alter table public.services add constraint services_pas_moi check (k <> 'moi');

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest not in ('chef', 'programme', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  -- une note à soi-même n'empêche pas un autre chef de se noter la même
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0013_demande_a_soi.sql');

-- ---------------------------------------------------------------------
-- 0014_demande_a_un_chef.sql
-- ---------------------------------------------------------------------
-- Demander des éléments à un chef de projet en particulier (dest = son identifiant), plus seulement à « les chefs ».
-- Lui seul est notifié, la demande arrive dans son À faire et il y répond. Pour se noter une demande à soi-même : « Moi » (0013).
-- Les demandes déjà faites à 'chef' (tous les chefs) restent valables.

-- il répond aux demandes qui lui sont faites
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()) or dest = auth.uid()::text)
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre()) or dest = auth.uid()::text);

-- destinataires d'une demande : un service, les chefs, la responsable de l'offre, un chef nommé (la Direction du Programme et « Moi » : personne)
create or replace function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where (p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre) or id::text = p_dest
$$;
revoke execute on function public.req_dests(text) from public, anon, authenticated;

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'programme', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and chef and not visiteur) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  -- une note à soi-même n'empêche pas un autre chef de se noter la même
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0014_demande_a_un_chef.sql');

-- ---------------------------------------------------------------------
-- 0015_sujet_a_trancher.sql
-- ---------------------------------------------------------------------
-- « Sujet à trancher » : rangé dans blocks avec le motif réservé « à trancher en réunion » (voir app.js, TRANCHER).
-- La notification ne dit plus « Blocage » pour ces sujets. Mêmes personnes prévenues qu'un blocage.
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select t, svc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc or (it.partner is not null and media))),
    case when new.why = 'à trancher en réunion' then 'Sujet à trancher' else 'Blocage' end,
    case when new.why = 'à trancher en réunion' then public.nom_de(new.author) || ' met « ' || it.t || ' » à l''ordre du jour de la réunion'
      else public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why end,
    '#item=' || new.item);
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0015_sujet_a_trancher.sql');

-- ---------------------------------------------------------------------
-- 0016_trancher_raison.sql
-- ---------------------------------------------------------------------
-- « Sujet à trancher » avec sa raison : why = « à trancher en réunion » ou « à trancher en réunion : <raison> » (voir app.js, TRANCHER).
-- La notification reprend la raison. Mêmes personnes prévenues qu'un blocage.
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record; tr boolean := new.why = 'à trancher en réunion' or new.why like 'à trancher en réunion : %';
begin
  select t, svc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc or (it.partner is not null and media))),
    case when tr then 'Sujet à trancher' else 'Blocage' end,
    case when tr then public.nom_de(new.author) || ' met « ' || it.t || ' » à l''ordre du jour de la réunion'
        || coalesce(' : ' || nullif(btrim(substr(new.why, length('à trancher en réunion : ') + 1)), ''), '')
      else public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why end,
    '#item=' || new.item);
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0016_trancher_raison.sql');

-- ---------------------------------------------------------------------
-- 0017_notifications.sql
-- ---------------------------------------------------------------------
-- Page « Notifications » : chacun relit les notifications qu'il a reçues ces 7 derniers jours, et peut les effacer.
-- Une notification effacée reste dans outbox (elle empêche un rappel J-x d'être renvoyé) mais n'est plus montrée.
-- Au-delà de 7 jours, elle n'est plus montrée non plus ; le ménage de nuit la supprime à 60 jours (0002).
alter table public.outbox add column efface_at timestamptz;
create index outbox_user on public.outbox (user_id, created_at desc);

create policy lire_les_miennes on public.outbox for select to authenticated
  using (user_id = auth.uid() and efface_at is null and created_at > now() - interval '7 days');

-- effacer quelques notifications (p_ids) ou toutes (p_ids null) ; seulement les siennes
create function public.effacer_notifs(p_ids bigint[] default null) returns void
language sql security definer set search_path = public as $$
  update public.outbox set efface_at = now()
  where user_id = auth.uid() and efface_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.effacer_notifs(bigint[]) from public, anon;
grant execute on function public.effacer_notifs(bigint[]) to authenticated;

-- une nouvelle notification fait apparaître la pastille de la cloche sans recharger
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.outbox;
  end if;
end $$;
insert into kplan_private.migrations (name) values ('0017_notifications.sql');

-- ---------------------------------------------------------------------
-- 0018_marketing_recrutement.sql
-- ---------------------------------------------------------------------
-- La Direction marketing et recrutement reçoit des demandes d'éléments comme la responsable de l'offre (dest 'marketing') :
-- un chef coche « Dir. marketing et recrutement » dans Équipe ; les personnes cochées sont prévenues et répondent.

alter table public.profiles add column marketing boolean not null default false;
alter table public.services add constraint services_pas_marketing check (k <> 'marketing');

create function public.is_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select marketing from public.profiles where id = auth.uid()), false)
$$;

-- elle répond aux demandes qui lui sont faites
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre())
         or (dest = 'marketing' and public.is_marketing()) or dest = auth.uid()::text)
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre())
         or (dest = 'marketing' and public.is_marketing()) or dest = auth.uid()::text);

-- un visiteur ne reçoit rien
create or replace function public.keep_visiteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visiteur then new.svc := null; new.chef := false; new.media := false; new.notif_all := false; new.offre := false; new.marketing := false; end if;
  return new;
end $$;

-- destinataires d'une demande : un service, les chefs, la responsable de l'offre, la Direction marketing et recrutement,
-- un chef nommé (la Direction du Programme et « Moi » : personne)
create or replace function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where (p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
    or (p_dest = 'marketing' and marketing) or id::text = p_dest
$$;

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'programme', 'offre', 'marketing', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and chef and not visiteur) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  -- une note à soi-même n'empêche pas un autre chef de se noter la même
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0018_marketing_recrutement.sql');

-- ---------------------------------------------------------------------
-- 0019_v2_content_recrutement.sql
-- ---------------------------------------------------------------------
-- V2. À appliquer le jour de la bascule seulement : l'appli V1 ne connaît pas « Recrutement ».
-- 1) Le service Content rejoint RP, RS et Vidéo. Chacun se rattache à son service dans Réglages.
-- 2) « Incontournable » ('INC') devient « Recrutement » ('REC') : les rendez-vous avec les candidats
--    (JPO, admissibles), à couvrir sans relever d'un des 5 messages. Contrairement à « Incontournable »,
--    l'étiquette se cumule avec des messages.
-- 3) Un classement peut porter un message (Réputation), comme dans la V2.

insert into public.services (k, nom, court, ordre)
select 'content', 'Content', 'Content', coalesce(max(ordre), 0) + 1 from public.services
on conflict (k) do nothing;

create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0) then
    raise exception 'un classement est saisi par un chef de projet' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'REC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  return new;
end $$;

-- les fiches « Incontournable » passent en « Recrutement », sans ligne d'historique ni notification
do $$ begin
  perform set_config('kplan.renommage', '1', true);
  update public.items set m = array_replace(m, 'INC', 'REC') where 'INC' = any (m);
  perform set_config('kplan.renommage', '', true);
end $$;
insert into kplan_private.migrations (name) values ('0019_v2_content_recrutement.sql');

-- ---------------------------------------------------------------------
-- 0020_v2_report_annulation.sql
-- ---------------------------------------------------------------------
-- V2. Reporter ou annuler avec un motif, visible sur la fiche et sur ses relais.
-- Reporter : la date change et l'appli envoie l'ancienne date (report_de) et le motif (report_motif).
-- Annuler : le statut passe à « retiré » (comme avant) avec un motif ; rétablir efface le motif.
-- Qui et quand sont écrits par la base, pas par l'appli.
alter table public.items
  add column report_de text not null default '' check (char_length(report_de) <= 40),
  add column report_motif text not null default '' check (char_length(report_motif) <= 300),
  add column report_par uuid references public.profiles (id) on delete set null,
  add column report_at timestamptz,
  add column annule_motif text not null default '' check (char_length(annule_motif) <= 300),
  add column annule_par uuid references public.profiles (id) on delete set null,
  add column annule_at timestamptz;

create function public.keep_motifs() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.report_de := ''; new.report_motif := ''; new.report_par := null; new.report_at := null;
    new.annule_par := case when new.st = 'retire' then auth.uid() end;
    new.annule_at := case when new.st = 'retire' then now() end;
    if new.st <> 'retire' then new.annule_motif := ''; end if;
    return new;
  end if;
  -- report : compte seulement si la date change vraiment
  if new.report_motif is distinct from old.report_motif or new.report_de is distinct from old.report_de then
    if new.report_motif = '' and new.report_de = '' then
      new.report_par := null; new.report_at := null;
    elsif new.date is distinct from old.date or new.flou is distinct from old.flou then
      new.report_par := auth.uid(); new.report_at := now();
    else
      raise exception 'un report change la date' using errcode = '23514';
    end if;
  else
    new.report_par := old.report_par; new.report_at := old.report_at;
  end if;
  -- annulation
  if new.st = 'retire' and old.st <> 'retire' then
    new.annule_par := auth.uid(); new.annule_at := now();
  elsif new.st <> 'retire' then
    new.annule_motif := ''; new.annule_par := null; new.annule_at := null;
  else
    new.annule_par := old.annule_par; new.annule_at := old.annule_at;
  end if;
  return new;
end $$;
create trigger items_motifs before insert or update on public.items for each row execute function public.keep_motifs();

-- l'historique garde le motif du report et de l'annulation
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note', 'rang', 'cible', 'report_motif', 'annule_motif'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;

-- un report prévient le service porteur et les services qui relaient la fiche
create function public.on_item_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.report_at is not null and new.report_at is distinct from old.report_at and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and not visiteur and (
        svc = new.svc or (new.svc = 'chef' and chef)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Reporté : ' || new.t,
      public.nom_de(auth.uid()) || case when new.report_motif <> '' then ' : ' || new.report_motif else ' a reporté la date.' end,
      '#item=' || new.id,
      'report:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;
create trigger items_report after update on public.items for each row execute function public.on_item_report();
revoke execute on function public.on_item_report() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0020_v2_report_annulation.sql');

-- ---------------------------------------------------------------------
-- 0021_v2_carnet.sql
-- ---------------------------------------------------------------------
-- V2. Carnet de lieux et de contacts, partagé par toute l'équipe.
-- Le lieu d'une fiche reste un texte (items.lieu) : le carnet sert à le proposer.
create table public.lieux (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) > 0 and char_length(nom) <= 120),
  at timestamptz not null default now()
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(btrim(nom)) > 0 and char_length(nom) <= 120),
  role text not null default '' check (char_length(role) <= 120),
  mail text not null default '' check (char_length(mail) <= 200),
  tel text not null default '' check (char_length(tel) <= 40),
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
-- quel contact sur quelle fiche
create table public.item_contacts (
  item uuid not null references public.items (id) on delete cascade,
  contact uuid not null references public.contacts (id) on delete cascade,
  primary key (item, contact)
);
create index item_contacts_contact on public.item_contacts (contact);

alter table public.lieux enable row level security;
alter table public.contacts enable row level security;
alter table public.item_contacts enable row level security;

-- qui peut modifier une fiche (mêmes règles que la table items)
create function public.peut_modifier(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i where i.id = p_item and (
    (i.partner is null and (public.is_chef() or i.svc = public.my_svc())) or (i.partner is not null and public.is_media())))
$$;

create policy lire on public.lieux for select to authenticated using (true);
create policy gerer on public.lieux for all to authenticated using (public.is_chef()) with check (public.is_chef());

create policy lire on public.contacts for select to authenticated using (true);
-- un chef gère tout le carnet ; une personne d'un service ajoute un contact et corrige ceux qu'elle a ajoutés
create policy ajouter on public.contacts for insert to authenticated
  with check (author = auth.uid() and not public.is_visiteur() and (public.is_chef() or public.my_svc() is not null));
create policy modifier on public.contacts for update to authenticated
  using (public.is_chef() or (author = auth.uid() and not public.is_visiteur()))
  with check (public.is_chef() or (author = auth.uid() and not public.is_visiteur()));
create policy retirer on public.contacts for delete to authenticated using (public.is_chef());

create policy lire on public.item_contacts for select to authenticated using (true);
create policy ajouter on public.item_contacts for insert to authenticated with check (public.peut_modifier(item));
create policy retirer on public.item_contacts for delete to authenticated using (public.peut_modifier(item));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lieux, public.contacts, public.item_contacts;
  end if;
end $$;
insert into kplan_private.migrations (name) values ('0021_v2_carnet.sql');

-- ---------------------------------------------------------------------
-- 0022_v2_profils.sql
-- ---------------------------------------------------------------------
-- V2. Réglages > Mon profil et Équipe.
-- 1) Chacun modifie son nom et sa fonction, ses choix de notifications ; les droits restent aux chefs.
-- 2) La version de l'appli que chacun utilise, visible par les chefs dans Équipe.
-- 3) Trois choix de notifications : demandes (notif_demandes), changements d'un temps fort relayé
--    (notif_changements), créations (notif_all, déjà là). Les deux nouveaux sont cochés d'office.
alter table public.profiles
  add column version text not null default '' check (char_length(version) <= 30),
  add column version_at timestamptz,
  add column notif_demandes boolean not null default true,
  add column notif_changements boolean not null default true;

create function public.keep_profil_perso() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_chef() then
    if new.version is distinct from old.version then new.version_at := now(); end if;
    return new;
  end if;
  -- sans être chef, on ne touche qu'à sa propre ligne, et pas à ses droits
  if new.id <> auth.uid() then
    raise exception 'seul un chef de projet règle l''équipe' using errcode = '42501';
  end if;
  if (new.chef, new.media, new.visiteur, new.offre, new.marketing, new.svc)
     is distinct from (old.chef, old.media, old.visiteur, old.offre, old.marketing, old.svc) then
    raise exception 'un chef de projet règle tes droits et ton service' using errcode = '42501';
  end if;
  if old.visiteur and (new.nom, new.fonction, new.notif_all, new.notif_demandes, new.notif_changements)
     is distinct from (old.nom, old.fonction, old.notif_all, old.notif_demandes, old.notif_changements) then
    raise exception 'le compte visiteur ne se modifie pas' using errcode = '42501';
  end if;
  if new.version is distinct from old.version then new.version_at := now(); else new.version_at := old.version_at; end if;
  return new;
end $$;
create trigger profiles_perso before update on public.profiles for each row execute function public.keep_profil_perso();

create policy moi on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
insert into kplan_private.migrations (name) values ('0022_v2_profils.sql');

-- ---------------------------------------------------------------------
-- 0023_v2_demandes.sql
-- ---------------------------------------------------------------------
-- V2. Demander des éléments à une personne ou à un service.
-- 1) On peut demander à n'importe quelle personne de l'équipe par son nom (plus seulement à un chef de projet) :
--    elle seule est prévenue (req_dests, 0014) et elle y répond (règle « repondre », déjà en place).
-- 2) La Direction du Programme et la Dir. marketing et recrutement ne sont plus des destinataires :
--    la demande va à un chef de projet, qui ira chercher l'info. Les demandes déjà faites restent lisibles.
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing') then
    raise exception 'ce destinataire n''existe plus : demande à un chef de projet' using errcode = '22023';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  -- une note à soi-même n'empêche pas un autre chef de se noter la même
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0023_v2_demandes.sql');

-- ---------------------------------------------------------------------
-- 0024_v2_menage.sql
-- ---------------------------------------------------------------------
-- V2. Ménage de la base, le jour de la bascule, APRÈS une sauvegarde (scripts/sauvegarde.mjs).
-- On range les données dans la forme de la V2 et on éteint ce qu'elle n'utilise plus. Les colonnes devenues
-- inutiles (cc, offre, marketing) restent en place, vides : les supprimer demanderait de réécrire une quinzaine
-- de fonctions pour rien, et les garder ne coûte rien.

-- ---------- 1. Trois statuts (et « retiré » pour une fiche annulée) ----------
do $$ begin
  perform set_config('kplan.renommage', '1', true);  -- ni ligne d'historique ni notification
  update public.items set st = 'confirmer' where st = 'idee';
  update public.items set st = 'planifie' where st = 'production';
  -- 2. plus de « services prévenus »
  update public.items set cc = '{}' where cardinality(cc) > 0;
  perform set_config('kplan.renommage', '', true);
end $$;
alter table public.items drop constraint items_st_check;
alter table public.items add constraint items_st_check check (st in ('confirmer', 'planifie', 'diffuse', 'retire'));
alter table public.items add constraint items_sans_cc check (cardinality(cc) = 0);

-- ---------- 3. Plus de blocages : ceux qui restent ouverts sont levés ; « à trancher en réunion » continue ----------
update public.blocks set leve = true where not leve and why not like 'à trancher en réunion%';
alter table public.blocks add constraint blocks_trancher check (leve or why like 'à trancher en réunion%') not valid;

-- ---------- 4. Demandes : plus de Direction du Programme, de Dir. marketing ni de Resp. offre ----------
-- une note à la Direction du Programme était déjà une note pour soi : elle devient « Moi »
update public.reqs set dest = 'moi' where dest = 'programme';
-- une demande à la Resp. offre ou à la Dir. marketing va à la personne cochée si elle est seule, sinon aux chefs de projet
update public.reqs r set dest = coalesce(
  (select min(p.id::text) from public.profiles p where (r.dest = 'offre' and p.offre) or (r.dest = 'marketing' and p.marketing) having count(*) = 1), 'chef')
where r.dest in ('offre', 'marketing');
update public.profiles set offre = false, marketing = false where offre or marketing;
alter table public.profiles add constraint profiles_sans_offre check (not offre and not marketing);

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- ---------- 5. Partenariats média : un pilote les gère, plus de droit à part ----------
update public.profiles set media = chef and not visiteur where media is distinct from (chef and not visiteur);
create function public.keep_media() returns trigger
language plpgsql set search_path = public as $$
begin new.media := new.chef and not new.visiteur; return new; end $$;
-- « profiles_media » passe après « profiles_keep » (ordre alphabétique) : celui-ci ne voit donc aucun changement de ce droit
create trigger profiles_media before insert or update on public.profiles for each row execute function public.keep_media();

-- ---------- 6. Notifications : chacun choisit ce qu'il reçoit (Réglages > Mon profil) ----------
-- demandes (notif_demandes) : demande reçue, éléments reçus, demande retirée, nouvelle échéance ;
-- changements (notif_changements) : un temps fort ou une action reporté, retiré, remis ;
-- créations : notif_all, comme avant. Les rappels J-30, J-15, J-7 et le reste arrivent toujours.
create or replace function public.notify(p_users uuid[], p_title text, p_body text, p_url text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  cat text := case
    when p_title in ('Demande d''éléments', 'Éléments reçus', 'Demande retirée', 'Nouvelle deadline') then 'demandes'
    when p_title like 'Reporté : %' or p_title like 'Retiré : %' or p_title like 'Remis : %' then 'changements' end;
begin
  insert into public.outbox (user_id, title, body, url, dedupe)
  select u, p_title, p_body, p_url, case when p_dedupe is null then null else p_dedupe || ':' || u end
  from unnest(p_users) as u
  where u is not null
    and (cat is null or exists (select 1 from public.profiles p where p.id = u
          and case cat when 'demandes' then p.notif_demandes else p.notif_changements end))
  on conflict (dedupe) do nothing;
end $$;
revoke execute on function public.notify(uuid[], text, text, text, text) from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0024_v2_menage.sql');

-- ---------------------------------------------------------------------
-- 0025_v2_rappel_pour_moi.sql
-- ---------------------------------------------------------------------
-- Le rappel pour soi (reqs.dest = 'moi') : ouvert à tous les comptes sauf visiteur, et privé.
-- Seul son auteur le lit ; on peut en noter plusieurs sur la même fiche ; personne n'est prévenu (req_dests ne renvoie personne pour 'moi').

drop policy lire on public.reqs;
create policy lire on public.reqs for select to authenticated using (dest <> 'moi' or asker = auth.uid());

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0025_v2_rappel_pour_moi.sql');

-- ---------------------------------------------------------------------
-- 0026_v2_corrections_17_nov.sql
-- ---------------------------------------------------------------------
-- 2.0.2 : corrections de la campagne de tests du 17 novembre.
-- Le « Rappel pour moi » reste vraiment privé, une demande se relance pour de vrai,
-- et un compte qui a reporté ou annulé une fiche peut être supprimé.

-- 1. Personne d'autre que son auteur ne modifie un rappel pour soi, même un pilote, même par une requête sans filtre
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using ((dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text))
  with check ((dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text));

-- 2. Un rappel pour soi ne laisse aucune trace dans l'historique (que tout le monde lit)
create or replace function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest));
  end if;
  return new;
end $$;

create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.dest = 'moi' then return new; end if;
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', new.type || ' pour « ' || titre || ' » : avant le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || old.pour || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- les traces déjà laissées par des rappels pour soi
delete from public.journal where diff->>'dest' = 'moi';

-- 3. Annuler une fiche n'efface pas les rappels pour soi : leur auteur décide
create or replace function public.on_item_retire_reqs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'retire' and old.st <> 'retire'
     and not (new.tf is not null and exists (select 1 from public.items t where t.id = new.tf and t.st <> 'retire')) then
    perform set_config('kplan.retrait', '1', true);
    update public.reqs set st = 'annulee' where item = new.id and st = 'ouverte' and dest <> 'moi';
    perform set_config('kplan.retrait', '', true);
  end if;
  return new;
end $$;

-- 4. Un rappel pour soi ne coupe pas les rappels J-30 / J-15 / J-7 du service
CREATE OR REPLACE FUNCTION public.queue_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee' and q.dest <> 'moi'
                                and (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  return n;
end $function$;

-- 5. Les rappels pour soi ne comptent pas dans la limite de 10 demandes en 10 minutes
CREATE OR REPLACE FUNCTION public.check_req()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $function$;

-- 6. Supprimer un compte qui a reporté ou annulé une fiche : la base remet « par qui » à vide au lieu de refuser
create or replace function public.keep_motifs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.report_de := ''; new.report_motif := ''; new.report_par := null; new.report_at := null;
    new.annule_par := case when new.st = 'retire' then auth.uid() end;
    new.annule_at := case when new.st = 'retire' then now() end;
    if new.st <> 'retire' then new.annule_motif := ''; end if;
    return new;
  end if;
  if new.report_motif is distinct from old.report_motif or new.report_de is distinct from old.report_de then
    if new.report_motif = '' and new.report_de = '' then
      new.report_par := null; new.report_at := null;
    elsif new.date is distinct from old.date or new.flou is distinct from old.flou then
      new.report_par := auth.uid(); new.report_at := now();
    else
      raise exception 'un report change la date' using errcode = '23514';
    end if;
  else
    new.report_par := old.report_par; new.report_at := old.report_at;
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    new.annule_par := auth.uid(); new.annule_at := now();
  elsif new.st <> 'retire' then
    new.annule_motif := ''; new.annule_par := null; new.annule_at := null;
  else
    new.annule_par := old.annule_par; new.annule_at := old.annule_at;
  end if;
  -- le compte n'existe plus (il vient d'être supprimé) : on garde le motif, sans le nom
  if new.report_par is not null and not exists (select 1 from public.profiles where id = new.report_par) then new.report_par := null; end if;
  if new.annule_par is not null and not exists (select 1 from public.profiles where id = new.annule_par) then new.annule_par := null; end if;
  return new;
end $$;
revoke execute on function public.keep_motifs() from public, anon, authenticated;

-- 7. Relancer une demande : seule la personne qui l'a faite, une fois par jour ; le destinataire est prévenu
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check check (kind = any (array['creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait', 'relance']));
create or replace function public.relancer(p_req uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reqs; titre text;
begin
  select * into r from public.reqs where id = p_req;
  if r.id is null or r.asker is distinct from auth.uid() then raise exception 'seule la personne qui a demandé relance' using errcode = '42501'; end if;
  if r.st <> 'ouverte' or r.dest = 'moi' then raise exception 'cette demande n''attend plus de réponse' using errcode = '22023'; end if;
  titre := (select t from public.items where id = r.item);
  perform public.notify(
    array(select id from public.req_dests(r.dest) as id where id is distinct from auth.uid()),
    'Demande d''éléments', 'Relance de ' || public.nom_de(auth.uid()) || ' : ' || r.type || ' pour « ' || titre || ' »', '#item=' || r.item,
    'relance:' || r.id || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (r.item, 'relance', jsonb_build_object('type', r.type, 'dest', r.dest));
end $$;
revoke execute on function public.relancer(uuid) from public, anon;
grant execute on function public.relancer(uuid) to authenticated;

-- 8. Un prénom et une fonction de taille raisonnable (les comptes existants ne sont pas vérifiés)
alter table public.profiles add constraint profiles_nom_court check (char_length(coalesce(nom, '')) <= 60) not valid;
alter table public.profiles add constraint profiles_fonction_courte check (char_length(coalesce(fonction, '')) <= 120) not valid;

-- 9. Qui est prévenu à la création (décision de Julien, 17 novembre) :
--    un temps fort, un sujet ou un classement prévient tous les services et les pilotes ;
--    une action ne prévient que son service (et qui a coché « à chaque nouvelle fiche ») : elle se lit sous son temps fort.
create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'classement' then 'Nouveau classement'
                    when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and not visiteur and (
      notif_all
      or (new.kind in ('tf', 'classement') and (svc is not null or chef))
      or (new.kind = 'action' and new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

-- 10. « Prévenir » : sur une action, l'auteur alerte un service précis (une fois par jour et par service)
create or replace function public.prevenir(p_item uuid, p_svc text) returns void
language plpgsql security definer set search_path = public as $$
declare titre text;
begin
  if auth.uid() is null or public.is_visiteur() then raise exception 'le compte visiteur ne prévient pas' using errcode = '42501'; end if;
  titre := (select t from public.items where id = p_item);
  if titre is null then raise exception 'fiche introuvable' using errcode = '23503'; end if;
  if not exists (select 1 from public.services where k = p_svc) and p_svc <> 'chef' then raise exception 'service inconnu' using errcode = '23503'; end if;
  perform public.notify(
    array(select id from public.req_dests(p_svc) as id where id is distinct from auth.uid()),
    'Pour info', public.nom_de(auth.uid()) || ' te signale « ' || titre || ' »', '#item=' || p_item,
    'prevenir:' || p_item || ':' || p_svc || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (p_item, 'prevenu', jsonb_build_object('svc', p_svc));
end $$;
revoke execute on function public.prevenir(uuid, text) from public, anon;
grant execute on function public.prevenir(uuid, text) to authenticated;
insert into kplan_private.migrations (name) values ('0026_v2_corrections_17_nov.sql');

-- ---------------------------------------------------------------------
-- 0027_premier_pilote.sql
-- ---------------------------------------------------------------------
-- 2.2.0 : une nouvelle copie de l'appli démarre sans aucun pilote. Le tout premier compte créé dans Supabase
-- (Authentication > Add user) devient donc pilote tout seul : il peut ensuite tout régler depuis l'appli.
-- Sur une base qui a déjà un pilote (celle de KEDGE), rien ne change.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_premier boolean := not exists (select 1 from public.profiles where chef);
begin
  insert into public.profiles (id, nom, visiteur, chef)
  values (new.id, initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '.', 1)),
    lower(coalesce(new.email, '')) = 'visiteur@example.com',
    v_premier and lower(coalesce(new.email, '')) <> 'visiteur@example.com')
  on conflict (id) do nothing;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0027_premier_pilote.sql');

-- ---------------------------------------------------------------------
-- 0028_messages_libres.sql
-- ---------------------------------------------------------------------
-- 2.2.0 : une autre équipe n'a pas forcément 5 messages clés. De 1 à 9 messages, réglés dans Réglages > Messages.
-- L'étiquette hors messages (« Recrutement » chez KEDGE, code 'REC' sur les fiches) devient la ligne n = 0 de la table :
-- son nom et sa précision se règlent aussi.
alter table public.messages add constraint messages_n_borne check (n between 0 and 9);
insert into public.messages (n, nom, info) values (0, 'Recrutement', 'JPO, admissibles : à couvrir, hors des messages clés') on conflict (n) do nothing;

-- une fiche ne cite que des messages qui existent (ou l'étiquette hors messages)
create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0) then
    raise exception 'un classement est saisi par un chef de projet' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ (array['REC'] || array(select n::text from public.messages where n > 0)) then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  return new;
end $$;

-- un message encore cité par des fiches ne se supprime pas ; l'étiquette hors messages non plus
create or replace function public.check_message_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.n = 0 then raise exception 'l''étiquette hors messages se renomme, elle ne se supprime pas' using errcode = '23514'; end if;
  if exists (select 1 from public.items where old.n::text = any (m)) then
    raise exception 'ce message est cité par des fiches : retire-le d''abord de ces fiches' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger messages_delete before delete on public.messages for each row execute function public.check_message_delete();
insert into kplan_private.migrations (name) values ('0028_messages_libres.sql');

-- ---------------------------------------------------------------------
-- 0029_export_asana_trello.sql
-- ---------------------------------------------------------------------
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
insert into kplan_private.migrations (name) values ('0029_export_asana_trello.sql');

-- ---------------------------------------------------------------------
-- 0030_demander_en_une_phrase.sql
-- ---------------------------------------------------------------------
-- 2.5.0 : « Demander en une phrase ». Sur la fiche, une seule ligne : « @Estelle les visuels pour vendredi dans 2 semaines ».
-- Une phrase sans date part « pour info » : la personne est prévenue, sans échéance, sans rappel, sans réponse attendue.
-- La veille de l'échéance, la personne à qui on a demandé reçoit un rappel.

-- 1. Une demande sans date = un message pour info (jamais pour un rappel pour soi, qui a toujours sa date)
alter table public.reqs alter column pour drop not null;

-- 2. On peut écrire plusieurs messages à la même personne sur la même fiche : seul le même texte, encore ouvert, est refusé
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest = 'moi' and new.pour is null then
    raise exception 'un rappel pour soi a toujours une date' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type
      and quoi = new.quoi and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 3. Les notifications disent la phrase elle-même ; « Pour info » quand il n'y a pas de date
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre text := (select t from public.items where id = new.item);
  quoi text := left(coalesce(nullif(btrim(new.quoi), ''), new.type), 140);
begin
  if tg_op = 'INSERT' then
    if new.pour is null then
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Pour info', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »)',
        '#item=' || new.item, 'req:' || new.id);
    else
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Demande', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »), pour le ' || to_char(new.pour, 'DD/MM'),
        '#item=' || new.item, 'req:' || new.id);
    end if;
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      public.nom_de(auth.uid()) || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from auth.uid()),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || quoi
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || quoi || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

-- 4. Une nouvelle date : prévenu ; une date retirée (le message devient pour info) : rien
create or replace function public.on_req_pour() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if new.dest = 'moi' or new.pour is null then return new; end if;
  if new.pour is distinct from old.pour and new.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (id in (select public.req_dests(new.dest)) or id = new.asker)),
      'Nouvelle deadline', left(coalesce(nullif(btrim(new.quoi), ''), new.type), 140) || ' (« ' || titre || ' ») : pour le ' || to_char(new.pour, 'DD/MM'), '#item=' || new.item,
      'pour:' || new.id || ':' || coalesce(old.pour::text, '') || ':' || new.pour || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
    insert into public.journal (item, kind, diff) values (new.item, 'deadline', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', jsonb_build_array(old.pour, new.pour)));
  end if;
  return new;
end $$;

-- 5. Relancer : seulement une demande qui a une date (un message pour info n'attend rien)
create or replace function public.relancer(p_req uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reqs; titre text;
begin
  select * into r from public.reqs where id = p_req;
  if r.id is null or r.asker is distinct from auth.uid() then raise exception 'seule la personne qui a demandé relance' using errcode = '42501'; end if;
  if r.st <> 'ouverte' or r.dest = 'moi' or r.pour is null then raise exception 'cette demande n''attend plus de réponse' using errcode = '22023'; end if;
  titre := (select t from public.items where id = r.item);
  perform public.notify(
    array(select id from public.req_dests(r.dest) as id where id is distinct from auth.uid()),
    'Demande', 'Relance de ' || public.nom_de(auth.uid()) || ' : ' || left(coalesce(nullif(btrim(r.quoi), ''), r.type), 140) || ' (« ' || titre || ' »)', '#item=' || r.item,
    'relance:' || r.id || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'));
  insert into public.journal (item, kind, diff) values (r.item, 'relance', jsonb_build_object('type', r.type, 'dest', r.dest));
end $$;
revoke execute on function public.relancer(uuid) from public, anon;
grant execute on function public.relancer(uuid) to authenticated;

-- 6. Les nouveaux titres comptent comme des « demandes » (chacun peut les couper dans Mon profil)
create or replace function public.notify(p_users uuid[], p_title text, p_body text, p_url text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  cat text := case
    when p_title in ('Demande d''éléments', 'Demande', 'Pour info', 'Pour demain', 'Éléments reçus', 'Demande retirée', 'Nouvelle deadline') then 'demandes'
    when p_title like 'Reporté : %' or p_title like 'Retiré : %' or p_title like 'Remis : %' then 'changements' end;
begin
  insert into public.outbox (user_id, title, body, url, dedupe)
  select u, p_title, p_body, p_url, case when p_dedupe is null then null else p_dedupe || ':' || u end
  from unnest(p_users) as u
  where u is not null
    and (cat is null or exists (select 1 from public.profiles p where p.id = u
          and case cat when 'demandes' then p.notif_demandes else p.notif_changements end))
  on conflict (dedupe) do nothing;
end $$;
revoke execute on function public.notify(uuid[], text, text, text, text) from public, anon, authenticated;

-- 7. La veille de l'échéance, un rappel à qui on a demandé (à 8 h, avec les rappels J-30 / J-15 / J-7)
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee' and q.dest <> 'moi'
                                and (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  -- la veille d'une échéance encore ouverte
  for r in
    select q.id, q.dest, q.asker, q.item, q.pour, left(coalesce(nullif(btrim(q.quoi), ''), q.type), 140) as quoi, i.t
    from public.reqs q join public.items i on i.id = q.item
    where q.st = 'ouverte' and q.dest <> 'moi' and q.pour = today + 1 and i.st <> 'retire'
  loop
    perform public.notify(
      array(select d from public.req_dests(r.dest) d where d is distinct from r.asker),
      'Pour demain', public.nom_de(r.asker) || ' attend : ' || r.quoi || ' (« ' || r.t || ' »)', '#item=' || r.item,
      'veille:' || r.id || ':' || r.pour);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;
insert into kplan_private.migrations (name) values ('0030_demander_en_une_phrase.sql');

-- ---------------------------------------------------------------------
-- 0031_resultats_budget.sql
-- ---------------------------------------------------------------------
-- 2.6.0 : l'écran Résultats.
-- 1. Les chiffres d'une diffusion (vues, clics, inscrits, retombées presse), notés sur la fiche par qui peut la modifier, lus par tous.
-- 2. Le budget des partenariats payants et l'enveloppe de chaque période : lus et réglés par les chefs de projet seulement.

-- 1. Résultats : un objet { "vues": 14200, "clics": 210 }, des nombres entiers de 0 à un milliard
create function public.res_ok(r jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(r) = 'object' and not exists (
    select 1 from jsonb_each(r) e
    where e.key not in ('vues', 'clics', 'inscrits', 'retombees')
       or jsonb_typeof(e.value) <> 'number'
       or (e.value)::numeric < 0 or (e.value)::numeric > 1000000000
       or (e.value)::numeric <> trunc((e.value)::numeric))
$$;
alter table public.items add column res jsonb not null default '{}'::jsonb;
alter table public.items add constraint items_res_ok check (public.res_ok(res));

-- l'historique de la fiche garde aussi les résultats
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note', 'rang', 'cible', 'report_motif', 'annule_motif', 'res'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
revoke execute on function public.on_item_journal() from public, anon, authenticated;

-- 2. Budget : un montant en euros par partenariat ; il part avec la fiche
create table public.budget (
  item uuid primary key references public.items (id) on delete cascade,
  montant integer not null check (montant >= 0 and montant <= 100000000),
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
-- l'enveloppe d'une période, facultative ; elle part avec la période
create table public.enveloppes (
  per smallint primary key references public.periods (n) on update cascade on delete cascade,
  montant integer not null check (montant >= 0 and montant <= 100000000)
);
alter table public.budget enable row level security;
alter table public.enveloppes enable row level security;
-- seuls les chefs de projet les lisent et les règlent : pour les autres comptes, les tables sont vides
create policy chefs on public.budget for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy chefs on public.enveloppes for all to authenticated using (public.is_chef()) with check (public.is_chef());

-- qui a changé un montant, et quand
create function public.keep_budget() returns trigger
language plpgsql set search_path = public as $$
begin
  new.author := auth.uid(); new.at := now();
  return new;
end $$;
create trigger budget_keep before insert or update on public.budget for each row execute function public.keep_budget();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.budget, public.enveloppes;
  end if;
end $$;
insert into kplan_private.migrations (name) values ('0031_resultats_budget.sql');

-- ---------------------------------------------------------------------
-- 0032_correctifs_2_6_1.sql
-- ---------------------------------------------------------------------
-- 2.6.1 : corrections de la campagne de tests du 20 novembre (version 2.6).
-- 1. Un message « pour info » peut être réécrit à la même personne : seul le même texte d'une demande datée encore ouverte est refusé.
-- 2. Un « pour info » n'efface plus le rappel J-7 « As-tu besoin d'éléments ? ».
-- 3. On ne « répond » pas à un message pour info, et le retirer ne prévient personne d'une « demande retirée ».
-- 4. Chaque message écrit laisse une ligne dans l'historique : la cloche de l'appli le montre au destinataire.
-- 5. Les résultats se fusionnent dans la base : deux personnes qui notent en même temps ne s'effacent plus.
-- 6. Un compte passé visiteur ne reçoit plus les rappels « Pour demain » et ne répond plus.

-- 1. « déjà demandé » : seulement une demande datée, même texte, encore ouverte
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest = 'moi' and new.pour is null then
    raise exception 'un rappel pour soi a toujours une date' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and new.pour is not null and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type
      and quoi = new.quoi and st = 'ouverte' and pour is not null) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and dest <> 'moi' and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de messages d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 3a. Un message pour info n'attend pas de réponse
create or replace function public.check_req_info() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.st = 'recue' and old.st = 'ouverte' and old.pour is null and old.dest <> 'moi' then
    raise exception 'un message pour info n''attend pas de réponse : écris un nouveau message' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists reqs_info on public.reqs;
create trigger reqs_info before update of st on public.reqs for each row execute function public.check_req_info();

-- 3b. Notifications : retirer un message pour info (ou annuler sa fiche) ne prévient personne
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre text := (select t from public.items where id = new.item);
  quoi text := left(coalesce(nullif(btrim(new.quoi), ''), new.type), 140);
begin
  if tg_op = 'INSERT' then
    if new.pour is null then
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Pour info', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »)',
        '#item=' || new.item, 'req:' || new.id);
    else
      perform public.notify(
        array(select d from public.req_dests(new.dest) d where d is distinct from new.asker),
        'Demande', public.nom_de(new.asker) || ' : ' || quoi || ' (« ' || titre || ' »), pour le ' || to_char(new.pour, 'DD/MM'),
        '#item=' || new.item, 'req:' || new.id);
    end if;
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      public.nom_de(auth.uid()) || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' and new.pour is not null then
    perform public.notify(
      array(select d from public.req_dests(new.dest) d where d is distinct from auth.uid()),
      'Demande retirée',
      case when coalesce(current_setting('kplan.retrait', true), '') = '1'
        then public.nom_de(auth.uid()) || ' a retiré « ' || titre || ' » : plus besoin de ' || quoi
        else public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || quoi || ' pour « ' || titre || ' »' end,
      '#item=' || new.item);
  end if;
  return new;
end $$;

-- 4. Un message écrit (demande ou pour info) entre dans l'historique, sans son texte : à qui, quoi, pour quand
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check check (kind = any (array['creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait', 'relance', 'message']));
create or replace function public.on_req_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  insert into public.journal (item, author, kind, diff) values (new.item, new.asker, 'message', jsonb_build_object('type', new.type, 'dest', new.dest, 'pour', new.pour));
  return new;
end $$;
revoke execute on function public.on_req_message() from public, anon, authenticated;
drop trigger if exists reqs_message on public.reqs;
create trigger reqs_message after insert on public.reqs for each row execute function public.on_req_message();
-- la réponse garde qui avait demandé : la cloche du demandeur la montre
create or replace function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dest = 'moi' then return new; end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'asker', new.asker, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest, 'info', new.pour is null));
  end if;
  return new;
end $$;

-- 2. Rappels du matin : un message pour info ne compte pas comme une demande d'éléments
create or replace function public.queue_reminders() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.t, i.svc, i.partner, i.date, i.tf, (i.date - today) as j,
           case when i.date - today <= 7 then 7 when i.date - today <= 15 then 15 else 30 end as jal
    from public.items i
    where i.kind = 'action' and i.st not in ('retire', 'diffuse')
      and (i.flou = '' or i.flou ~ '^\d')
      and (i.date - today) between 1 and 30
  loop
    perform public.notify(
      array(select p.id from public.profiles p
            where not p.visiteur
              and ((r.partner is null and p.svc = r.svc) or (r.partner is not null and p.media)
                   or (r.partner is null and r.svc = 'chef' and p.chef))
              and not exists (select 1 from public.answers a where a.user_id = p.id and a.key = r.id || '-' || r.date || '-' || r.jal)
              and not exists (select 1 from public.reqs q left join public.profiles qa on qa.id = q.asker
                              where q.st <> 'annulee' and q.dest <> 'moi' and q.pour is not null
                                and (q.item = r.id or q.item = r.tf or q.item in (select s.id from public.items s where r.tf is not null and s.tf = r.tf))
                                and (q.asker = p.id or (p.svc is not null and qa.svc = p.svc)
                                     -- une action du chef de projet : un chef a demandé, c'est fait pour tous les chefs
                                     or (r.svc = 'chef' and p.chef and qa.chef)))
              -- rappels envoyés avant 0004 (clé sans date) : comptés seulement pendant 15 jours, le temps qu'ils changent de jalon
              and not exists (select 1 from public.outbox o where o.dedupe = 'rappel:' || r.id || ':' || r.jal || ':' || p.id
                              and o.created_at > now() - interval '15 days')),
      'J-' || r.j || ' : ' || r.t, 'As-tu besoin d''éléments ? C''est le moment de les demander.', '#afaire',
      'rappel:' || r.id || ':' || r.date || ':' || r.jal);
    n := n + 1;
  end loop;
  -- la veille d'une échéance encore ouverte
  for r in
    select q.id, q.dest, q.asker, q.item, q.pour, left(coalesce(nullif(btrim(q.quoi), ''), q.type), 140) as quoi, i.t
    from public.reqs q join public.items i on i.id = q.item
    where q.st = 'ouverte' and q.dest <> 'moi' and q.pour = today + 1 and i.st <> 'retire'
  loop
    perform public.notify(
      array(select d from public.req_dests(r.dest) d where d is distinct from r.asker),
      'Pour demain', public.nom_de(r.asker) || ' attend : ' || r.quoi || ' (« ' || r.t || ' »)', '#item=' || r.item,
      'veille:' || r.id || ':' || r.pour);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- 6. Un visiteur ne reçoit pas les messages d'un service, et ne répond pas
create or replace function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where not visiteur and ((p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
    or (p_dest = 'marketing' and marketing) or id::text = p_dest)
$$;
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (not public.is_visiteur() and (dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text))
  with check (not public.is_visiteur() and (dest <> 'moi' or asker = auth.uid()) and (is_chef() or asker = auth.uid() or dest = my_svc() or (dest = 'offre' and is_offre()) or (dest = 'marketing' and is_marketing()) or dest = auth.uid()::text));

-- 5. Noter des résultats : seules les unités touchées changent, ce qu'un collègue vient de noter reste.
-- Mêmes droits qu'une modification de la fiche (la règle d'accès de items s'applique : security invoker).
create or replace function public.set_res(p_item uuid, p_pose jsonb, p_retire text[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  if jsonb_typeof(coalesce(p_pose, '{}'::jsonb)) <> 'object' then raise exception 'résultats illisibles' using errcode = '22023'; end if;
  update public.items set res = (coalesce(res, '{}'::jsonb) || coalesce(p_pose, '{}'::jsonb)) - coalesce(p_retire, '{}'::text[])
  where id = p_item returning res into r;
  if not found then raise exception 'tu n''as pas le droit de modifier cette fiche, ou elle a été supprimée' using errcode = '42501'; end if;
  return r;
end $$;
revoke execute on function public.set_res(uuid, jsonb, text[]) from public, anon;
grant execute on function public.set_res(uuid, jsonb, text[]) to authenticated;
insert into kplan_private.migrations (name) values ('0032_correctifs_2_6_1.sql');

-- ---------------------------------------------------------------------
-- 0034_photo_profil.sql
-- ---------------------------------------------------------------------
-- 2.7 : sa photo dans Réglages > Mon profil, visible sur tous les visages de l'appli.
-- Un petit carré JPEG (160 px) en data URL, préparé par l'appli ; la base refuse tout le reste (taille, format).
-- Chacun change sa propre photo (règle « moi » de 0022) ; les chefs de projet peuvent tout modifier.
-- Numéro 0034 : 0033 est réservé à la mise à jour automatique des copies (2.7 installateur, pas encore publiée).
alter table public.profiles
  add column if not exists photo text
    constraint profiles_photo_format check (photo is null or (char_length(photo) <= 60000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));
insert into kplan_private.migrations (name) values ('0034_photo_profil.sql');

-- ---------------------------------------------------------------------
-- 0035_suivi_outil.sql
-- ---------------------------------------------------------------------
-- 2.8 : le suivi de l'outil, lu par l'ADMIN seul (Réglages > Suivi, export pour Claude) :
--   phrases que la barre n'a pas comprises, erreurs de l'appli, « Annuler » juste après la barre,
--   recherches sans résultat, écrans ouverts (comptés par semaine, sans nom).
-- Un seul compte admin, pas tous les chefs de projet.
-- L'admin = le tout premier chef de projet créé dans la base (sur une copie : celui qui l'a installée).
-- Le droit ne se change pas depuis l'appli : seulement ici, dans Supabase (SQL Editor).
-- Tout s'efface tout seul au bout de 3 mois.
-- Numéro 0035 : 0033 est réservé à la mise à jour automatique des copies, 0034 = photos.

alter table public.profiles add column if not exists admin boolean not null default false;

-- un seul admin au départ : le premier chef de projet créé (si aucun admin n'existe encore)
update public.profiles p set admin = true
where p.id = (select pr.id from public.profiles pr join auth.users u on u.id = pr.id where pr.chef order by u.created_at limit 1)
  and not exists (select 1 from public.profiles where admin);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.profiles where id = auth.uid()), false)
$$;

-- personne ne se donne (ni ne donne) le droit admin depuis l'appli
create or replace function public.keep_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.admin := false; return new; end if;
  if new.admin is distinct from old.admin then new.admin := old.admin; end if;
  return new;
end $$;
drop trigger if exists profiles_admin on public.profiles;
create trigger profiles_admin before insert or update on public.profiles for each row execute function public.keep_admin();

-- une nouvelle copie : le tout premier compte devient chef ET admin
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_premier boolean := not exists (select 1 from public.profiles where chef);
  v_visiteur boolean := lower(coalesce(new.email, '')) = 'visiteur@example.com';
begin
  insert into public.profiles (id, nom, visiteur, chef)
  values (new.id, initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '.', 1)), v_visiteur, v_premier and not v_visiteur)
  on conflict (id) do nothing;
  if v_premier and not v_visiteur then
    update public.profiles set admin = true where id = new.id and not exists (select 1 from public.profiles where admin);
  end if;
  return new;
end $$;

create table if not exists public.phrases_barre (
  id bigint generated always as identity primary key,
  txt text not null check (char_length(txt) between 2 and 300),
  raison text not null default 'rien' check (raison in ('rien', 'reecrit')),
  qui uuid default auth.uid() references public.profiles(id) on delete set null,
  quand timestamptz not null default now()
);
alter table public.phrases_barre enable row level security;
drop policy if exists ecrire on public.phrases_barre;
drop policy if exists lire on public.phrases_barre;
drop policy if exists vider on public.phrases_barre;
-- tout compte connecté (sauf le visiteur) dépose ses phrases, à son nom ; il ne peut pas les relire
create policy ecrire on public.phrases_barre for insert to authenticated
  with check (qui = auth.uid() and not public.is_visiteur());
create policy lire on public.phrases_barre for select to authenticated using (public.is_admin());
create policy vider on public.phrases_barre for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.phrases_barre to authenticated;

-- pas plus de 30 phrases par personne et par heure (une barre qui s'emballe ne remplit pas la base)
create or replace function public.limite_phrases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.phrases_barre where qui = new.qui and quand > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists phrases_limite on public.phrases_barre;
create trigger phrases_limite before insert on public.phrases_barre for each row execute function public.limite_phrases();

-- ménage : on oublie les phrases de plus de 3 mois (chaque nuit, 3 h UTC)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('phrases-barre-menage') where exists (select 1 from cron.job where jobname = 'phrases-barre-menage');
    perform cron.schedule('phrases-barre-menage', '0 3 * * *', $c$delete from public.phrases_barre where quand < now() - interval '3 months'$c$);
  end if;
end $$;

-- le reste du suivi : une ligne par événement ; les écrans arrivent déjà comptés (n), sans nom
create table if not exists public.suivi (
  id bigint generated always as identity primary key,
  type text not null check (type in ('erreur', 'annule', 'recherche', 'ecran')),
  txt text not null check (char_length(txt) between 1 and 500),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 2000),
  version text check (char_length(version) <= 20),
  qui uuid default auth.uid() references public.profiles(id) on delete set null,
  quand timestamptz not null default now()
);
alter table public.suivi enable row level security;
drop policy if exists ecrire on public.suivi;
drop policy if exists lire on public.suivi;
drop policy if exists vider on public.suivi;
-- chacun dépose à son nom, sauf les écrans qui partent sans nom ; le visiteur ne dépose rien
create policy ecrire on public.suivi for insert to authenticated
  with check (not public.is_visiteur() and ((type <> 'ecran' and qui = auth.uid()) or (type = 'ecran' and qui is null)));
create policy lire on public.suivi for select to authenticated using (public.is_admin());
create policy vider on public.suivi for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.suivi to authenticated;

-- pas plus de 60 lignes par personne et par heure (et 200 lignes d'écrans par heure pour tout le monde)
create or replace function public.limite_suivi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'ecran' then
    if (select count(*) from public.suivi where type = 'ecran' and quand > now() - interval '1 hour') >= 200 then return null; end if;
  elsif (select count(*) from public.suivi where qui = new.qui and quand > now() - interval '1 hour') >= 60 then return null;
  end if;
  return new;
end $$;
drop trigger if exists suivi_limite on public.suivi;
create trigger suivi_limite before insert on public.suivi for each row execute function public.limite_suivi();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('suivi-menage') where exists (select 1 from cron.job where jobname = 'suivi-menage');
    perform cron.schedule('suivi-menage', '10 3 * * *', $c$delete from public.suivi where quand < now() - interval '3 months'$c$);
  end if;
end $$;

-- pour vérifier : qui est admin ?
select nom as admin from public.profiles where admin;
insert into kplan_private.migrations (name) values ('0035_suivi_outil.sql');

-- ---------------------------------------------------------------------
-- 0036_correctifs_2_8_1.sql
-- ---------------------------------------------------------------------
-- 2.8.1 : corrections de la campagne de tests du 22 novembre (base).
-- 1. Le suivi n'accepte que des nombres raisonnables dans detail (n des écrans, sec des annulations).
-- 2. L'heure d'une ligne du suivi ou d'une phrase est toujours celle du serveur (les limites ne se contournent plus).
-- 3. La limite des écrans se compte par personne, dans un compteur que personne ne lit (les écrans restent sans nom).
-- 4. Le compte visiteur, partagé, ne change plus sa photo.

alter table public.suivi drop constraint if exists suivi_detail_forme;
delete from public.suivi where (type = 'ecran' and not (jsonb_typeof(detail->'n') = 'number' and (detail->>'n')::numeric between 1 and 1000))
  or (type = 'annule' and detail ? 'sec' and not (jsonb_typeof(detail->'sec') = 'number' and (detail->>'sec')::numeric between 0 and 3600));
alter table public.suivi add constraint suivi_detail_forme check (
  (type <> 'ecran' or (jsonb_typeof(detail->'n') = 'number' and (detail->>'n')::numeric between 1 and 1000))
  and (type <> 'annule' or not (detail ? 'sec') or (jsonb_typeof(detail->'sec') = 'number' and (detail->>'sec')::numeric between 0 and 3600))
);
update public.suivi set quand = now() where quand > now();
update public.phrases_barre set quand = now() where quand > now();

create table if not exists kplan_private.suivi_compteur (qui uuid not null, heure timestamptz not null, n int not null default 0, primary key (qui, heure));
alter table kplan_private.suivi_compteur enable row level security; -- personne ne le lit : seule la fonction limite_suivi y écrit

create or replace function public.limite_phrases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.quand := now();
  if (select count(*) from public.phrases_barre where qui = new.qui and quand > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end $$;

create or replace function public.limite_suivi() returns trigger
language plpgsql security definer set search_path = public, kplan_private as $$
declare v_n int;
begin
  new.quand := now();
  if new.type = 'ecran' then
    if auth.uid() is null then return new; end if;
    insert into kplan_private.suivi_compteur as c (qui, heure, n) values (auth.uid(), date_trunc('hour', now()), 1)
      on conflict (qui, heure) do update set n = c.n + 1 returning n into v_n;
    delete from kplan_private.suivi_compteur where heure < now() - interval '2 hours';
    if v_n > 40 then return null; end if;
  elsif (select count(*) from public.suivi where qui = new.qui and quand > now() - interval '1 hour') >= 60 then return null;
  end if;
  return new;
end $$;

create or replace function public.keep_profil_perso() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_chef() then
    if new.version is distinct from old.version then new.version_at := now(); end if;
    return new;
  end if;
  -- sans être chef, on ne touche qu'à sa propre ligne, et pas à ses droits
  if new.id <> auth.uid() then
    raise exception 'seul un chef de projet règle l''équipe' using errcode = '42501';
  end if;
  if (new.chef, new.media, new.visiteur, new.offre, new.marketing, new.svc)
     is distinct from (old.chef, old.media, old.visiteur, old.offre, old.marketing, old.svc) then
    raise exception 'un chef de projet règle tes droits et ton service' using errcode = '42501';
  end if;
  if old.visiteur and (new.nom, new.fonction, new.notif_all, new.notif_demandes, new.notif_changements, new.photo)
     is distinct from (old.nom, old.fonction, old.notif_all, old.notif_demandes, old.notif_changements, old.photo) then
    raise exception 'le compte visiteur ne se modifie pas' using errcode = '42501';
  end if;
  if new.version is distinct from old.version then new.version_at := now(); else new.version_at := old.version_at; end if;
  return new;
end $$;
insert into kplan_private.migrations (name) values ('0036_correctifs_2_8_1.sql');

-- ---------------------------------------------------------------------
-- 0037_admin_protege.sql
-- ---------------------------------------------------------------------
-- 2.8.2 : l'admin (Julien sur la base KEDGE) garde ses droits.
-- 1. Un autre chef ne peut plus lui retirer ses droits de chef ni le passer en visiteur (lui seul, ou Supabase).
-- 2. Un admin passé visiteur ne lit plus le Suivi.
create or replace function public.keep_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.admin := false; return new; end if;
  if new.admin is distinct from old.admin then new.admin := old.admin; end if;
  if old.admin and auth.uid() <> old.id and (new.chef, new.visiteur) is distinct from (old.chef, old.visiteur) then
    raise exception 'les droits de l''admin ne se changent que par lui-même' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin and not coalesce(visiteur, false) from public.profiles where id = auth.uid()), false)
$$;
insert into kplan_private.migrations (name) values ('0037_admin_protege.sql');

commit;
-- Terminé. Étape suivante du guide : créer ton compte (Authentication > Add user). Le premier compte devient pilote.
