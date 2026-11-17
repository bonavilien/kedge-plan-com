-- Le rappel pour soi (reqs.dest = 'moi') : ouvert à tous les comptes sauf visiteur, et privé.
-- Seul son auteur le lit ; on peut en noter plusieurs sur la même fiche ; personne n'est prévenu (req_dests ne renvoie personne pour 'moi').

drop policy lire on public.reqs;
create policy lire on public.reqs for select to authenticated using (dest <> 'moi' or asker = auth.uid());

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter un rappel, choisis « Rappel pour moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if new.dest <> 'moi' and exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;
