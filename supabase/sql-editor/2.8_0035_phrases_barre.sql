-- 2.8 : la barre de commandes garde les phrases qu'elle n'a pas comprises, pour compléter son catalogue.
-- Seul l'ADMIN les lit (Réglages > Phrases) : un seul compte, pas tous les chefs de projet.
-- L'admin = le tout premier chef de projet créé dans la base (sur une copie : celui qui l'a installée).
-- Le droit ne se change pas depuis l'appli : seulement ici, dans Supabase (SQL Editor).
-- Les phrases s'effacent toutes seules au bout de 3 mois.
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

-- pour vérifier : qui est admin ?
select nom as admin from public.profiles where admin;
