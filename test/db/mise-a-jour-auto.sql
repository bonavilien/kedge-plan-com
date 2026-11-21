-- La mise à jour de nuit (0033) : le travail planifié, puis l'appel à la fonction seulement quand le coffre est rempli.
do $$
declare n0 bigint; c record;
begin
  if not exists (select 1 from cron.job where jobname = 'kplan-mise-a-jour' and schedule = '17 2 * * *' and command = 'select kplan_private.maj_auto()') then raise exception 'travail de nuit absent'; end if;
  if has_function_privilege('anon', 'kplan_private.maj_auto()', 'execute') or has_function_privilege('authenticated', 'kplan_private.maj_auto()', 'execute') then raise exception 'maj_auto ne doit pas être ouverte aux comptes'; end if;
  delete from vault.decrypted_secrets where name in ('kplan_maj_url', 'kplan_maj_secret');
  n0 := (select count(*) from net.calls);
  -- coffre vide (l'appli d'origine) : rien
  perform kplan_private.maj_auto();
  if (select count(*) from net.calls) <> n0 then raise exception 'sans coffre, la nuit ne doit rien appeler'; end if;
  -- l'adresse seule : rien non plus
  insert into vault.decrypted_secrets values ('kplan_maj_url', 'https://abcd.supabase.co/functions/v1/mise-a-jour');
  perform kplan_private.maj_auto();
  if (select count(*) from net.calls) <> n0 then raise exception 'sans secret, la nuit ne doit rien appeler'; end if;
  -- les deux : un appel, action auto, secret dans l'en-tête
  insert into vault.decrypted_secrets values ('kplan_maj_secret', 'secret-de-nuit');
  perform kplan_private.maj_auto();
  select * into c from net.calls order by id desc limit 1;
  if (select count(*) from net.calls) <> n0 + 1 or c.url <> 'https://abcd.supabase.co/functions/v1/mise-a-jour' or c.body <> '{"action":"auto"}'::jsonb or c.headers->>'x-kplan-auto' <> 'secret-de-nuit' then raise exception 'appel de nuit mal formé : % % %', c.url, c.body, c.headers; end if;
  delete from vault.decrypted_secrets where name in ('kplan_maj_url', 'kplan_maj_secret');
  raise notice 'mise à jour de nuit : bon';
end $$;
