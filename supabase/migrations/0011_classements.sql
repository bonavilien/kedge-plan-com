-- Un classement (SIGEM, Financial Times…) : ni temps fort ni sujet, un moment de l'année à part.
-- date = jour de publication (ou son mois seulement, « Sept. »), rang = place actuelle de KEDGE, cible = l'objectif (top N).
-- Comme un temps fort, il peut avoir des relais (actions liées). Seuls les chefs de projet le saisissent : il est porté par 'chef'.
alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('action', 'tf', 'classement'));
alter table public.items add column rang smallint, add column cible smallint;
alter table public.items add constraint items_rang check (
  (rang is null or rang between 1 and 999) and (cible is null or cible between 1 and 999) and (kind = 'classement' or (rang is null and cible is null)));

-- service porteur connu, fiche liée qui est bien un temps fort, un sujet ou un classement, messages connus, « Incontournable » seul
create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans message ni partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0 or cardinality(new.m) > 0) then
    raise exception 'un classement est saisi par un chef de projet, sans message' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'INC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  if 'INC' = any (new.m) and cardinality(new.m) > 1 then
    new.m := array['INC'];
  end if;
  return new;
end $$;
drop trigger items_check on public.items;
create trigger items_check before insert or update of svc, tf, m, per, partner on public.items for each row execute function public.check_item();

create or replace function public.on_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case when new.kind = 'classement' then 'Nouveau classement'
                    when new.kind = 'tf' and cardinality(new.per) > 0 then 'Nouveau sujet'
                    when new.kind = 'tf' then 'Nouveau temps fort'
                    when new.partner is not null then 'Nouveau partenariat'
                    else 'Nouvelle action' end;
begin
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (
      notif_all or svc = any (new.cc)
      or (new.partner is null and (svc = new.svc or (new.svc = 'chef' and chef)))
      or (new.partner is not null and media))),
    quoi, public.nom_de(new.author) || ' : ' || new.t, '#item=' || new.id);
  return new;
end $$;

create or replace function public.on_item_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[] := array(select x from unnest(new.cc) as x where not (x = any (old.cc)));
  quoi text := case when new.kind = 'classement' then 'le classement' when new.kind = 'tf' and cardinality(new.per) > 0 then 'le sujet'
                    when new.kind = 'tf' then 'le temps fort' else 'l''action' end;
begin
  if coalesce(current_setting('kplan.renommage', true), '') = '1' then return new; end if;
  if new.svc is distinct from old.svc and new.st <> 'retire' and new.partner is null then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (svc = new.svc or (new.svc = 'chef' and chef))),
      'Confié à ton service', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'porte:' || new.id || ':' || new.svc || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if cardinality(added) > 0 and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and svc = any (added)),
      'Ton service est cité', public.nom_de(auth.uid()) || ' : ' || new.t, '#item=' || new.id,
      'cite:' || new.id || ':' || array_to_string(added, ',') || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if new.st = 'retire' and old.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Retiré : ' || new.t, public.nom_de(auth.uid()) || ' a retiré ' || quoi || '.', '#item=' || new.id,
      'retire:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  if old.st = 'retire' and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and (
        notif_all or svc = any (new.cc) or svc = new.svc or (new.svc = 'chef' and new.partner is null and chef) or (new.partner is not null and media)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Remis : ' || new.t, public.nom_de(auth.uid()) || ' a remis ' || quoi || '.', '#item=' || new.id,
      'remis:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;

-- le journal note aussi un changement de rang ou d'objectif
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
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note', 'rang', 'cible'] loop
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
