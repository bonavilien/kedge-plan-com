-- Une demande à soi-même (dest 'moi') : un chef de projet se note des éléments qu'il doit fournir lui-même.
-- Personne d'autre n'est prévenu (aucun profil ne reçoit 'moi') ; la demande est dans son À faire, il la marque faite.

-- 'moi' n'est pas un service : un service ne peut pas s'appeler ainsi
alter table public.services drop constraint if exists services_pas_moi;
alter table public.services add constraint services_pas_moi check (k <> 'moi');

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
  if new.dest not in ('chef', 'programme', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest) then
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
