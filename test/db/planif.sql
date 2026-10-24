-- Vérifie l'envoi : rien sans secret, un appel quand des messages attendent, les vieux messages abandonnés.
\set ON_ERROR_STOP on
set client_min_messages = warning;
select jobname, schedule from cron.job order by 1;
truncate public.outbox;
select public.flush_outbox();
select 'appels sans message', count(*) from net.calls;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'test@kedgebs.com');
select public.notify(array['00000000-0000-0000-0000-0000000000a1'::uuid], 'Titre', 'Corps', '#afaire');
select public.flush_outbox();
select 'appels sans secret', count(*) from net.calls;
insert into vault.decrypted_secrets values ('kplan_push_url', 'https://exemple.supabase.co/functions/v1/push'), ('kplan_cron_secret', 's3cret');
select public.flush_outbox();
select 'appels avec secret', count(*), max(url), max(headers->>'x-cron-secret') from net.calls;
update public.outbox set created_at = now() - interval '3 days';
select public.flush_outbox();
select 'vieux message abandonné', count(*) from public.outbox where error like 'trop ancien%';
select 'appels après abandon', count(*) from net.calls;
-- un compte connecté ne peut pas déclencher l'envoi
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
do $$ begin perform public.flush_outbox(); raise exception 'ATTENDU REFUSÉ'; exception when insufficient_privilege then raise notice 'OK refusé : flush_outbox par un compte'; end $$;
reset role;
