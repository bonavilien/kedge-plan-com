-- 0027 : le premier compte d'une base sans pilote devient pilote ; les suivants non.
\set ON_ERROR_STOP 1
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); v uuid := gen_random_uuid();
begin
  update public.profiles set chef = false;
  insert into auth.users (id, email) values (v, 'visiteur@example.com');
  if (select chef from public.profiles where id = v) then raise exception 'le visiteur ne devient pas pilote'; end if;
  insert into auth.users (id, email) values (a, 'premiere.personne@exemple.fr');
  if not (select chef and media from public.profiles where id = a) then raise exception 'le premier compte doit être pilote (et gérer les partenariats)'; end if;
  insert into auth.users (id, email) values (b, 'deuxieme@exemple.fr');
  if (select chef from public.profiles where id = b) then raise exception 'le deuxième compte ne doit pas être pilote'; end if;
  raise notice 'premier pilote : bon';
end $$;
