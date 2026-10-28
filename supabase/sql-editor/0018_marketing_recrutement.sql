-- À coller tel quel dans Supabase : SQL Editor, New query, coller, Run.
-- Demandes d'éléments à la Direction marketing et recrutement (migration 0018 du dépôt kedge-plan-com).
-- Supabase peut signaler une opération « destructive » (drop policy) : c'est sans risque, la règle est recréée aussitôt.
begin;

-- La Direction marketing et recrutement reçoit des demandes d'éléments comme la responsable de l'offre (dest 'marketing') :
-- un chef coche « Dir. marketing et recrutement » dans Équipe ; les personnes cochées sont prévenues et répondent.

alter table public.profiles add column marketing boolean not null default false;
alter table public.services add constraint services_pas_marketing check (k <> 'marketing');

create function public.is_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select marketing from public.profiles where id = auth.uid()), false)
$$;

-- elle répond aux demandes qui lui sont faites
drop policy repondre on public.reqs;
create policy repondre on public.reqs for update to authenticated
  using (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre())
         or (dest = 'marketing' and public.is_marketing()) or dest = auth.uid()::text)
  with check (public.is_chef() or asker = auth.uid() or dest = public.my_svc() or (dest = 'offre' and public.is_offre())
         or (dest = 'marketing' and public.is_marketing()) or dest = auth.uid()::text);

-- un visiteur ne reçoit rien
create or replace function public.keep_visiteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visiteur then new.svc := null; new.chef := false; new.media := false; new.notif_all := false; new.offre := false; new.marketing := false; end if;
  return new;
end $$;

-- destinataires d'une demande : un service, les chefs, la responsable de l'offre, la Direction marketing et recrutement,
-- un chef nommé (la Direction du Programme et « Moi » : personne)
create or replace function public.req_dests(p_dest text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where (p_dest = 'chef' and chef) or svc = p_dest or (p_dest = 'offre' and offre)
    or (p_dest = 'marketing' and marketing) or id::text = p_dest
$$;

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'programme', 'offre', 'marketing', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and chef and not visiteur) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  -- une note à soi-même n'empêche pas un autre chef de se noter la même
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- noté comme fait, pour que la mise à jour automatique depuis le PC ne la relance pas
insert into kplan_private.migrations (name) values ('0018_marketing_recrutement.sql') on conflict do nothing;
commit;
