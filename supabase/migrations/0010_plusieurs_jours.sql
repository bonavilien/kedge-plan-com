-- Un temps fort sur plusieurs jours (semaine séminaire…) : date = premier jour, fin = dernier jour.
-- Vide pour un temps fort d'un jour, une action, un sujet ou une date connue au mois seulement.
-- Les rappels J-30, J-15, J-7 ne changent pas : ils portent sur la date de chaque action.
alter table public.items add column fin date;
alter table public.items add constraint items_fin check (fin is null or (kind = 'tf' and fin > date));

-- le journal note aussi un changement de fin
create or replace function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), now(), 'creation');
    return new;
  end if;
  -- un service renommé n'est pas une modification de la fiche
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
revoke execute on function public.on_item_journal() from public, anon, authenticated;
