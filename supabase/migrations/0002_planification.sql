-- Plan de com KEDGE : envoi des notifications et rappels programmés.
-- Chaque matin, la base prépare les rappels J-30, J-15, J-7 ; chaque minute, s'il y a des messages en attente,
-- elle appelle la fonction push (supabase/functions/push) qui les envoie sur les téléphones.
-- L'adresse de la fonction et le secret partagé sont rangés dans le coffre (Vault) par scripts/setup.mjs :
--   kplan_push_url    https://<projet>.supabase.co/functions/v1/push
--   kplan_cron_secret le même secret que CRON_SECRET côté fonction
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function public.flush_outbox() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  -- un message vieux de plus de deux jours n'a plus de sens (fonction pas encore branchée, panne) : on l'abandonne
  update public.outbox set sent_at = now(), error = 'trop ancien, pas envoyé'
  where sent_at is null and created_at < now() - interval '2 days';
  if not exists (select 1 from public.outbox where sent_at is null) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kplan_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'kplan_cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 20000);
end $$;
revoke execute on function public.flush_outbox() from public, anon, authenticated;

-- heures en temps universel : 7 h, c'est 8 h ou 9 h à Paris
select cron.schedule('kplan-rappels', '0 7 * * *', 'select public.queue_reminders()');
select cron.schedule('kplan-envoi', '* * * * *', 'select public.flush_outbox()');
select cron.schedule('kplan-menage', '30 3 * * *', $$delete from public.outbox where sent_at < now() - interval '60 days'$$);
