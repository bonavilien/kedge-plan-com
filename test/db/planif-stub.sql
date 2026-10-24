-- Imite pg_net, pg_cron et le coffre de Supabase pour tester 0002_planification.sql sur un Postgres local.
create schema if not exists extensions;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema net;
create table net.calls (id bigint generated always as identity, url text, headers jsonb, body jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;
create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
