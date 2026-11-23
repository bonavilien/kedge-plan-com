-- 2.9.0 : le budget par devis, à l'année.
-- Un devis (un média, un programme, une année scolaire) a ses lignes ; chaque ligne se relie à une ou plusieurs actions du plan.
-- État du devis : reçu, signé, DA faite (demande d'achat), facturé. Le PDF du devis est rangé dans l'appli (Storage, dossier « devis »).
-- Tout est lu et réglé par les chefs de projet seulement : pour les autres comptes, les tables sont vides et le PDF introuvable.
-- Les montants sont en euros HT, entiers. Le total d'un devis = ses lignes payantes moins la remise.

create table public.devis (
  id uuid primary key default gen_random_uuid(),
  annee smallint not null check (annee between 2000 and 2100), -- 2026 = l'année scolaire 2026-2027
  media text not null default '' check (char_length(media) <= 120),
  programme text not null default '' check (char_length(programme) <= 60),
  numero text not null default '' check (char_length(numero) <= 60),
  recu date,
  remise integer not null default 0 check (remise >= 0 and remise <= 100000000),
  paiement text not null default '' check (char_length(paiement) <= 200),
  etat text not null default 'recu' check (etat in ('recu', 'signe', 'da', 'facture')),
  pdf text not null default '' check (char_length(pdf) <= 300),
  pdf_nom text not null default '' check (char_length(pdf_nom) <= 200),
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
create table public.devis_lignes (
  id uuid primary key default gen_random_uuid(),
  devis uuid not null references public.devis (id) on delete cascade,
  rang smallint not null default 0,
  t text not null default '' check (char_length(t) <= 200),
  detail text not null default '' check (char_length(detail) <= 400),
  qte smallint not null default 1 check (qte between 1 and 99), -- combien d'actions la ligne paie (« 4 épisodes »)
  montant integer not null default 0 check (montant >= 0 and montant <= 100000000), -- offerte : sa valeur
  offert boolean not null default false
);
create index devis_lignes_devis on public.devis_lignes (devis);
-- une ligne payée par une ou plusieurs actions du plan ; le lien part avec la ligne ou avec la fiche
create table public.devis_liens (
  ligne uuid not null references public.devis_lignes (id) on delete cascade,
  item uuid not null references public.items (id) on delete cascade,
  primary key (ligne, item)
);
create index devis_liens_item on public.devis_liens (item);
-- l'enveloppe de l'année, facultative
create table public.enveloppes_annee (
  annee smallint primary key check (annee between 2000 and 2100),
  montant integer not null check (montant >= 0 and montant <= 100000000)
);

alter table public.devis enable row level security;
alter table public.devis_lignes enable row level security;
alter table public.devis_liens enable row level security;
alter table public.enveloppes_annee enable row level security;
create policy chefs on public.devis for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy chefs on public.devis_lignes for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy chefs on public.devis_liens for all to authenticated using (public.is_chef()) with check (public.is_chef());
create policy chefs on public.enveloppes_annee for all to authenticated using (public.is_chef()) with check (public.is_chef());

-- qui a créé le devis : jamais quelqu'un d'autre que soi
create function public.keep_devis() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.author := auth.uid(); new.at := now();
  else new.author := old.author; new.at := old.at; end if;
  return new;
end $$;
create trigger devis_keep before insert or update on public.devis for each row execute function public.keep_devis();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.devis, public.devis_lignes, public.devis_liens, public.enveloppes_annee;
  end if;
end $$;

-- le PDF des devis : un dossier privé de Supabase Storage, 20 Mo par fichier, des PDF seulement, chefs de projet seulement
-- (une base Postgres sans Supabase Storage, comme celle des tests, saute cette partie)
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('devis', 'devis', false, 20971520, array['application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];
    execute 'drop policy if exists "devis chefs lire" on storage.objects';
    execute 'drop policy if exists "devis chefs deposer" on storage.objects';
    execute 'drop policy if exists "devis chefs changer" on storage.objects';
    execute 'drop policy if exists "devis chefs effacer" on storage.objects';
    execute $p$create policy "devis chefs lire" on storage.objects for select to authenticated using (bucket_id = 'devis' and public.is_chef())$p$;
    execute $p$create policy "devis chefs deposer" on storage.objects for insert to authenticated with check (bucket_id = 'devis' and public.is_chef())$p$;
    execute $p$create policy "devis chefs changer" on storage.objects for update to authenticated using (bucket_id = 'devis' and public.is_chef()) with check (bucket_id = 'devis' and public.is_chef())$p$;
    execute $p$create policy "devis chefs effacer" on storage.objects for delete to authenticated using (bucket_id = 'devis' and public.is_chef())$p$;
  end if;
end $$;
