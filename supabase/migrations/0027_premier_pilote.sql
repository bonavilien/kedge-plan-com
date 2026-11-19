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
