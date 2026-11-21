-- Les copies se mettent à jour toutes seules, chaque nuit (2.7.0).
-- Vers 3 h ou 4 h à Paris, la base d'une copie appelle sa fonction « mise-a-jour » (supabase/functions/mise-a-jour)
-- avec l'action « auto » : la fonction récupère les nouveaux scripts de base puis le code du dépôt d'origine, et
-- relance la publication du site. Personne n'a besoin de cliquer.
-- L'adresse de la fonction et le secret sont rangés dans le coffre (Vault), par l'installateur ou par la fonction
-- elle-même la première fois qu'un pilote ouvre Réglages :
--   kplan_maj_url     https://<projet>.supabase.co/functions/v1/mise-a-jour
--   kplan_maj_secret  un secret au hasard, comparé par la fonction
-- Sans ces deux entrées (l'appli d'origine, ou une copie où la fonction n'est pas encore installée), rien ne se passe.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists kplan_private;

create or replace function kplan_private.maj_auto() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kplan_maj_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'kplan_maj_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'auto'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kplan-auto', v_secret),
    timeout_milliseconds := 60000);
end $$;
revoke execute on function kplan_private.maj_auto() from public, anon, authenticated;

-- heure en temps universel : 2 h 17, c'est 3 h 17 ou 4 h 17 à Paris, loin des rappels de 7 h
select cron.schedule('kplan-mise-a-jour', '17 2 * * *', 'select kplan_private.maj_auto()');
