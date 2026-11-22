-- 2.8.1 : corrections de la campagne de tests du 22 novembre (base).
-- 1. Le suivi n'accepte que des nombres raisonnables dans detail (n des écrans, sec des annulations).
-- 2. L'heure d'une ligne du suivi ou d'une phrase est toujours celle du serveur (les limites ne se contournent plus).
-- 3. La limite des écrans se compte par personne, dans un compteur que personne ne lit (les écrans restent sans nom).
-- 4. Le compte visiteur, partagé, ne change plus sa photo.

alter table public.suivi drop constraint if exists suivi_detail_forme;
delete from public.suivi where (type = 'ecran' and not (jsonb_typeof(detail->'n') = 'number' and (detail->>'n')::numeric between 1 and 1000))
  or (type = 'annule' and detail ? 'sec' and not (jsonb_typeof(detail->'sec') = 'number' and (detail->>'sec')::numeric between 0 and 3600));
alter table public.suivi add constraint suivi_detail_forme check (
  (type <> 'ecran' or (jsonb_typeof(detail->'n') = 'number' and (detail->>'n')::numeric between 1 and 1000))
  and (type <> 'annule' or not (detail ? 'sec') or (jsonb_typeof(detail->'sec') = 'number' and (detail->>'sec')::numeric between 0 and 3600))
);
update public.suivi set quand = now() where quand > now();
update public.phrases_barre set quand = now() where quand > now();

create table if not exists kplan_private.suivi_compteur (qui uuid not null, heure timestamptz not null, n int not null default 0, primary key (qui, heure));
alter table kplan_private.suivi_compteur enable row level security; -- personne ne le lit : seule la fonction limite_suivi y écrit

create or replace function public.limite_phrases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.quand := now();
  if (select count(*) from public.phrases_barre where qui = new.qui and quand > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end $$;

create or replace function public.limite_suivi() returns trigger
language plpgsql security definer set search_path = public, kplan_private as $$
declare v_n int;
begin
  new.quand := now();
  if new.type = 'ecran' then
    if auth.uid() is null then return new; end if;
    insert into kplan_private.suivi_compteur as c (qui, heure, n) values (auth.uid(), date_trunc('hour', now()), 1)
      on conflict (qui, heure) do update set n = c.n + 1 returning n into v_n;
    delete from kplan_private.suivi_compteur where heure < now() - interval '2 hours';
    if v_n > 40 then return null; end if;
  elsif (select count(*) from public.suivi where qui = new.qui and quand > now() - interval '1 hour') >= 60 then return null;
  end if;
  return new;
end $$;

create or replace function public.keep_profil_perso() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_chef() then
    if new.version is distinct from old.version then new.version_at := now(); end if;
    return new;
  end if;
  -- sans être chef, on ne touche qu'à sa propre ligne, et pas à ses droits
  if new.id <> auth.uid() then
    raise exception 'seul un chef de projet règle l''équipe' using errcode = '42501';
  end if;
  if (new.chef, new.media, new.visiteur, new.offre, new.marketing, new.svc)
     is distinct from (old.chef, old.media, old.visiteur, old.offre, old.marketing, old.svc) then
    raise exception 'un chef de projet règle tes droits et ton service' using errcode = '42501';
  end if;
  if old.visiteur and (new.nom, new.fonction, new.notif_all, new.notif_demandes, new.notif_changements, new.photo)
     is distinct from (old.nom, old.fonction, old.notif_all, old.notif_demandes, old.notif_changements, old.photo) then
    raise exception 'le compte visiteur ne se modifie pas' using errcode = '42501';
  end if;
  if new.version is distinct from old.version then new.version_at := now(); else new.version_at := old.version_at; end if;
  return new;
end $$;
