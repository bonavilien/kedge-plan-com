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
