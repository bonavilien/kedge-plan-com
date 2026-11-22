-- 0037 : l'admin garde ses droits de chef ; un admin visiteur ne lit plus le suivi.
\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('a1000000-0000-0000-0000-000000000001', 'admin@ex.com'), ('a1000000-0000-0000-0000-000000000002', 'chef2@ex.com');
update public.profiles set chef = true where id = 'a1000000-0000-0000-0000-000000000002';
do $$ begin
  if not (select admin from public.profiles where id = 'a1000000-0000-0000-0000-000000000001') then raise notice 'ÉCHEC : le premier compte devrait être admin'; end if;
end $$;
begin;
set local role authenticated; select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
do $$ begin
  begin update public.profiles set chef = false where id = 'a1000000-0000-0000-0000-000000000001'; raise notice 'ÉCHEC : un autre chef a retiré les droits de l''admin';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set fonction = 'Chef de projet' where id = 'a1000000-0000-0000-0000-000000000001';
  exception when others then raise notice 'ÉCHEC : la fonction de l''admin devrait rester modifiable : %', sqlerrm; end;
end $$;
rollback;
update public.profiles set visiteur = true where id = 'a1000000-0000-0000-0000-000000000001';
begin;
set local role authenticated; select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
do $$ begin if public.is_admin() then raise notice 'ÉCHEC : un admin visiteur reste admin'; end if; end $$;
rollback;
select 'admin protégé : bon' as resultat;
