-- V2. À appliquer le jour de la bascule seulement : l'appli V1 ne connaît pas « Recrutement ».
-- 1) Le service Content rejoint RP, RS et Vidéo. Chacun se rattache à son service dans Réglages.
-- 2) « Incontournable » ('INC') devient « Recrutement » ('REC') : les rendez-vous avec les candidats
--    (JPO, admissibles), à couvrir sans relever d'un des 5 messages. Contrairement à « Incontournable »,
--    l'étiquette se cumule avec des messages.
-- 3) Un classement peut porter un message (Réputation), comme dans la V2.

insert into public.services (k, nom, court, ordre)
select 'content', 'Content', 'Content', coalesce(max(ordre), 0) + 1 from public.services
on conflict (k) do nothing;

create or replace function public.check_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.svc <> 'chef' and not exists (select 1 from public.services where k = new.svc) then
    raise exception 'service inconnu : %', new.svc using errcode = '23503';
  end if;
  -- un classement est porté par les chefs de projet, sans partenaire ni période
  if new.kind = 'classement' and (new.svc <> 'chef' or new.partner is not null or cardinality(new.per) > 0) then
    raise exception 'un classement est saisi par un chef de projet' using errcode = '23514';
  end if;
  -- un temps fort, un sujet ou un classement n'est lié à rien : seules les actions sont des relais
  if new.tf is not null and (new.kind <> 'action' or new.tf = new.id
     or not exists (select 1 from public.items where id = new.tf and kind in ('tf', 'classement'))) then
    raise exception 'une fiche ne peut être liée qu''à un temps fort, un sujet ou un classement' using errcode = '23514';
  end if;
  if not new.m <@ array['1', '2', '3', '4', '5', 'REC'] then
    raise exception 'message inconnu' using errcode = '23514';
  end if;
  return new;
end $$;

-- les fiches « Incontournable » passent en « Recrutement », sans ligne d'historique ni notification
do $$ begin
  perform set_config('kplan.renommage', '1', true);
  update public.items set m = array_replace(m, 'INC', 'REC') where 'INC' = any (m);
  perform set_config('kplan.renommage', '', true);
end $$;
