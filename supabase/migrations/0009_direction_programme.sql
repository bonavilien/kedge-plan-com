-- Demande à la Direction du Programme : un chef de projet note pour lui-même une info qu'il ira chercher
-- (dest 'programme'). Personne d'autre n'est notifié ; le chef la marque reçue lui-même (ou un autre chef).

-- qui peut l'envoyer : seulement un chef ; le reste des règles de check_req (0004) est inchangé
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest = 'programme' and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à la Direction du Programme' using errcode = '42501';
  end if;
  if new.dest not in ('chef', 'programme') and not exists (select 1 from public.services where k = new.dest) then
    raise exception 'service inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- 'programme' n'est pas un service : un service ne peut pas s'appeler ainsi
alter table public.services add constraint services_pas_programme check (k <> 'programme');
