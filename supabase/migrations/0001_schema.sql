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
