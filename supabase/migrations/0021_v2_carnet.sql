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
