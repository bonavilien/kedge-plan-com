-- Historique de chaque fiche (création, modifications, documents, relances)
-- et « prévenir à nouveau » après un changement de date, de titre ou de précisions.

-- =====================================================================
-- Journal : rempli par la base elle-même, personne ne peut l'écrire ni l'effacer
-- =====================================================================
create table public.journal (
  id bigint generated always as identity primary key,
  item uuid not null references public.items (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  kind text not null check (kind in ('creation', 'modif', 'document', 'prevenu')),
  diff jsonb not null default '{}'   -- modif : {champ: [avant, après]} ; document : {nom} ; prevenu : {quoi, n}
);
create index journal_item on public.journal (item, at);
alter table public.journal enable row level security;
create policy lire on public.journal for select to authenticated using (true);

-- les fiches déjà saisies ont au moins leur création
insert into public.journal (item, author, at, kind) select id, author, at, 'creation' from public.items;

-- création et modification d'une fiche : seuls les champs qu'on voit sont suivis (pas updated_at)
create function public.on_item_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '{}';
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.journal (item, author, at, kind) values (new.id, coalesce(new.author, auth.uid()), new.at, 'creation');
    return new;
  end if;
  foreach k in array array['t', 'date', 'flou', 'per', 'svc', 'cc', 'm', 'st', 'tf', 'partner', 'lieu', 'note'] loop
    if o -> k is distinct from n -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if d <> '{}' then
    insert into public.journal (item, kind, diff) values (new.id, 'modif', d);
  end if;
  return new;
end $$;
create trigger items_journal after insert or update on public.items for each row execute function public.on_item_journal();

create function public.on_link_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.journal (item, author, kind, diff) values (new.item, new.author, 'document', jsonb_build_object('nom', new.nom));
  return new;
end $$;
create trigger links_journal after insert on public.links for each row execute function public.on_link_journal();

-- =====================================================================
-- Prévenir à nouveau : la personne qui modifie choisit de prévenir, la base envoie.
-- Les mêmes personnes qu'à la création (prévenues de tout, services cités), plus le service porteur
-- et, pour un temps fort ou un sujet, les services de ses relais. Jamais l'auteur du changement.
-- =====================================================================
create function public.renotify(p_item uuid, p_quoi text) returns int
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  dests uuid[];
begin
  select * into it from public.items where id = p_item;
  if it.id is null then raise exception 'fiche introuvable'; end if;
  -- seuls ceux qui peuvent modifier la fiche peuvent prévenir (mêmes règles que la modification)
  if not ((it.partner is null and (public.is_chef() or it.svc = public.my_svc())) or (it.partner is not null and public.is_media())) then
    raise exception 'pas le droit de prévenir pour cette fiche' using errcode = '42501';
  end if;
  p_quoi := left(btrim(coalesce(p_quoi, '')), 300);
  if p_quoi = '' then raise exception 'rien à dire'; end if;
  dests := array(select id from public.profiles where id is distinct from auth.uid() and (
    notif_all or svc = any (it.cc) or svc = it.svc
    or svc in (select a.svc from public.items a where a.tf = it.id and a.st <> 'retire')));
  -- un double appui dans la même minute n'envoie qu'une fois
  perform public.notify(dests, 'Modifié : ' || it.t, public.nom_de(auth.uid()) || ' : ' || p_quoi, '#item=' || it.id,
    'modif:' || it.id || ':' || md5(p_quoi || to_char(now(), 'YYYY-MM-DD HH24:MI')));
  insert into public.journal (item, kind, diff) values (it.id, 'prevenu', jsonb_build_object('quoi', p_quoi, 'n', cardinality(dests)));
  return cardinality(dests);
end $$;
revoke execute on function public.renotify(uuid, text) from public, anon;
grant execute on function public.renotify(uuid, text) to authenticated;
revoke execute on function public.on_item_journal() from public, anon, authenticated;
revoke execute on function public.on_link_journal() from public, anon, authenticated;

-- temps réel : l'historique d'une fiche ouverte se met à jour tout seul
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.journal;
  end if;
end $$;
