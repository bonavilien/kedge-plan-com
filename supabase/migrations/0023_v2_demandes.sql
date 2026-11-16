-- V2. Demander des éléments à une personne ou à un service.
-- 1) On peut demander à n'importe quelle personne de l'équipe par son nom (plus seulement à un chef de projet) :
--    elle seule est prévenue (req_dests, 0014) et elle y répond (règle « repondre », déjà en place).
-- 2) La Direction du Programme et la Dir. marketing et recrutement ne sont plus des destinataires :
--    la demande va à un chef de projet, qui ira chercher l'info. Les demandes déjà faites restent lisibles.
create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing') then
    raise exception 'ce destinataire n''existe plus : demande à un chef de projet' using errcode = '22023';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'offre', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
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
