-- Demandes d'éléments : la personne qui demande (ou un chef) peut retirer sa demande,
-- et le service sollicité répond avec un message et, au besoin, un document.
-- Le document va sur le temps fort (ou le sujet) quand l'action y est liée, sinon sur la fiche :
-- il se voit donc partout où la demande se voit.

alter table public.reqs drop constraint reqs_st_check;
alter table public.reqs add constraint reqs_st_check check (st in ('ouverte', 'recue', 'annulee'));
alter table public.reqs
  add column reponse text not null default '' check (char_length(reponse) <= 1000),
  add column repondu_par uuid references public.profiles (id) on delete set null,
  add column repondu_at timestamptz;
-- le document envoyé en réponse à une demande
alter table public.links add column req uuid references public.reqs (id) on delete set null;

-- ce qu'on ne réécrit pas après coup, plus : retirer (demandeur ou chef, sans retour) et la réponse, écrite une fois
create or replace function public.keep_reqs() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.at := now(); new.st := 'ouverte'; new.reponse := ''; new.repondu_par := null; new.repondu_at := null;
    return new;
  end if;
  new.item := old.item; new.asker := old.asker; new.at := old.at;
  if not (public.is_chef() or old.asker = auth.uid()) then
    new.dest := old.dest; new.type := old.type; new.quoi := old.quoi; new.pour := old.pour;
  end if;
  if old.st = 'annulee' then
    new.st := 'annulee';
  elsif new.st = 'annulee' and not (public.is_chef() or old.asker = auth.uid()) then
    raise exception 'seule la personne qui a demandé, ou un chef, retire la demande' using errcode = '42501';
  end if;
  if new.st = 'recue' and old.st = 'ouverte' then
    new.reponse := left(btrim(coalesce(new.reponse, '')), 1000); new.repondu_par := auth.uid(); new.repondu_at := now();
  else
    new.reponse := old.reponse; new.repondu_par := old.repondu_par; new.repondu_at := old.repondu_at;
  end if;
  if (new.dest, new.type) is distinct from (old.dest, old.type) and new.st = 'ouverte' and exists (select 1 from public.reqs
      where id <> new.id and item = new.item and dest = new.dest and type = new.type and st = 'ouverte') then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  return new;
end $$;

-- notifications : la réponse arrive avec son message ; une demande retirée prévient le service sollicité
create or replace function public.on_req() returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text := (select t from public.items where id = new.item);
begin
  if tg_op = 'INSERT' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from new.asker and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande d''éléments', public.nom_de(new.asker) || ' demande : ' || new.type || ' pour « ' || titre || ' », avant le ' || to_char(new.pour, 'DD/MM'),
      '#item=' || new.item, 'req:' || new.id);
  elsif new.st = 'recue' and old.st <> 'recue' and new.asker is distinct from auth.uid() then
    perform public.notify(array[new.asker], 'Éléments reçus',
      new.type || ' pour « ' || titre || ' »' || case when new.reponse <> '' then ' : ' || left(new.reponse, 140) else '' end, '#item=' || new.item);
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    perform public.notify(
      array(select id from public.profiles where id is distinct from auth.uid() and ((new.dest = 'chef' and chef) or svc = new.dest)),
      'Demande retirée', public.nom_de(auth.uid()) || ' n''a plus besoin de : ' || new.type || ' pour « ' || titre || ' »', '#item=' || new.item);
  end if;
  return new;
end $$;

-- l'historique de la fiche garde la réponse et le retrait
alter table public.journal drop constraint journal_kind_check;
alter table public.journal add constraint journal_kind_check
  check (kind in ('creation', 'modif', 'document', 'prevenu', 'deadline', 'reponse', 'retrait'));
create function public.on_req_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.st = 'recue' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'reponse', jsonb_build_object('type', new.type, 'dest', new.dest, 'reponse', new.reponse));
  elsif new.st = 'annulee' and old.st = 'ouverte' then
    insert into public.journal (item, kind, diff) values (new.item, 'retrait', jsonb_build_object('type', new.type, 'dest', new.dest));
  end if;
  return new;
end $$;
create trigger reqs_journal after update of st on public.reqs for each row execute function public.on_req_journal();
revoke execute on function public.on_req_journal() from public, anon, authenticated;
