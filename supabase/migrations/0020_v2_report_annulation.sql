-- V2. Reporter ou annuler avec un motif, visible sur la fiche et sur ses relais.
-- Reporter : la date change et l'appli envoie l'ancienne date (report_de) et le motif (report_motif).
-- Annuler : le statut passe à « retiré » (comme avant) avec un motif ; rétablir efface le motif.
-- Qui et quand sont écrits par la base, pas par l'appli.
alter table public.items
  add column report_de text not null default '' check (char_length(report_de) <= 40),
  add column report_motif text not null default '' check (char_length(report_motif) <= 300),
  add column report_par uuid references public.profiles (id) on delete set null,
  add column report_at timestamptz,
  add column annule_motif text not null default '' check (char_length(annule_motif) <= 300),
  add column annule_par uuid references public.profiles (id) on delete set null,
  add column annule_at timestamptz;

create function public.keep_motifs() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.report_de := ''; new.report_motif := ''; new.report_par := null; new.report_at := null;
    new.annule_par := case when new.st = 'retire' then auth.uid() end;
    new.annule_at := case when new.st = 'retire' then now() end;
    if new.st <> 'retire' then new.annule_motif := ''; end if;
    return new;
  end if;
  -- report : compte seulement si la date change vraiment
  if new.report_motif is distinct from old.report_motif or new.report_de is distinct from old.report_de then
    if new.report_motif = '' and new.report_de = '' then
      new.report_par := null; new.report_at := null;
    elsif new.date is distinct from old.date or new.flou is distinct from old.flou then
      new.report_par := auth.uid(); new.report_at := now();
    else
      raise exception 'un report change la date' using errcode = '23514';
    end if;
  else
    new.report_par := old.report_par; new.report_at := old.report_at;
  end if;
  -- annulation
  if new.st = 'retire' and old.st <> 'retire' then
    new.annule_par := auth.uid(); new.annule_at := now();
  elsif new.st <> 'retire' then
    new.annule_motif := ''; new.annule_par := null; new.annule_at := null;
  else
    new.annule_par := old.annule_par; new.annule_at := old.annule_at;
  end if;
  return new;
end $$;
create trigger items_motifs before insert or update on public.items for each row execute function public.keep_motifs();

-- l'historique garde le motif du report et de l'annulation
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
  foreach k in array array['t', 'date', 'fin', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note', 'rang', 'cible', 'report_motif', 'annule_motif'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;

-- un report prévient le service porteur et les services qui relaient la fiche
create function public.on_item_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.report_at is not null and new.report_at is distinct from old.report_at and new.st <> 'retire' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and not visiteur and (
        svc = new.svc or (new.svc = 'chef' and chef)
        or svc in (select a.svc from public.items a where a.tf = new.id and a.st <> 'retire'))),
      'Reporté : ' || new.t,
      public.nom_de(auth.uid()) || case when new.report_motif <> '' then ' : ' || new.report_motif else ' a reporté la date.' end,
      '#item=' || new.id,
      'report:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD HH24:MI'));
  end if;
  return new;
end $$;
create trigger items_report after update on public.items for each row execute function public.on_item_report();
revoke execute on function public.on_item_report() from public, anon, authenticated;
