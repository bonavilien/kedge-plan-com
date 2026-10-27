-- À coller tel quel dans Supabase : SQL Editor, New query, coller, Run.
-- Page Notifications : chacun retrouve ses notifications des 7 derniers jours et peut les effacer (migration 0017 du dépôt kedge-plan-com).
begin;

-- Page « Notifications » : chacun relit les notifications qu'il a reçues ces 7 derniers jours, et peut les effacer.
-- Une notification effacée reste dans outbox (elle empêche un rappel J-x d'être renvoyé) mais n'est plus montrée.
-- Au-delà de 7 jours, elle n'est plus montrée non plus ; le ménage de nuit la supprime à 60 jours (0002).
alter table public.outbox add column efface_at timestamptz;
create index outbox_user on public.outbox (user_id, created_at desc);

create policy lire_les_miennes on public.outbox for select to authenticated
  using (user_id = auth.uid() and efface_at is null and created_at > now() - interval '7 days');

-- effacer quelques notifications (p_ids) ou toutes (p_ids null) ; seulement les siennes
create function public.effacer_notifs(p_ids bigint[] default null) returns void
language sql security definer set search_path = public as $$
  update public.outbox set efface_at = now()
  where user_id = auth.uid() and efface_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.effacer_notifs(bigint[]) from public, anon;
grant execute on function public.effacer_notifs(bigint[]) to authenticated;

-- une nouvelle notification fait apparaître la pastille de la cloche sans recharger
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.outbox;
  end if;
end $$;

-- noté comme fait, pour que la mise à jour automatique depuis le PC ne la relance pas
insert into kplan_private.migrations (name) values ('0017_notifications.sql') on conflict do nothing;
commit;
