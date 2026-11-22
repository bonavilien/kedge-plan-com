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
