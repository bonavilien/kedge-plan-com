-- Base KEDGE, avant de publier la 2.6 : SQL Editor, New query, coller tout, Run.
-- À coller APRÈS celui de la 2.5 (0030).
-- 0031 : l'écran Résultats (chiffres des diffusions) et le budget des partenariats (chefs de projet seulement).
begin;
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
insert into kplan_private.migrations (name) values ('0031_resultats_budget.sql') on conflict do nothing;
commit;
