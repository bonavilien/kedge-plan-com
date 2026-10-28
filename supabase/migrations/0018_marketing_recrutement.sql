-- La Direction marketing et le Recrutement, comme la Direction du Programme : un chef de projet y note ce qu'il ira
-- chercher lui-même (dest 'marketing' / 'recrutement'). Ils n'ont pas de compte : personne n'est notifié, un chef la marque reçue.

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'recrutement') and not public.is_chef() then
    raise exception 'seul un chef de projet note une demande à une direction sans compte dans l''appli' using errcode = '42501';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'programme', 'marketing', 'recrutement', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest)
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

-- ce ne sont pas des services de l'appli : un service ne peut pas porter ces noms
alter table public.services add constraint services_pas_direction check (k not in ('marketing', 'recrutement'));
