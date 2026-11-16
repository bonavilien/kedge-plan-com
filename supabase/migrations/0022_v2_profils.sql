-- V2. Réglages > Mon profil et Équipe.
-- 1) Chacun modifie son nom et sa fonction, ses choix de notifications ; les droits restent aux chefs.
-- 2) La version de l'appli que chacun utilise, visible par les chefs dans Équipe.
-- 3) Trois choix de notifications : demandes (notif_demandes), changements d'un temps fort relayé
--    (notif_changements), créations (notif_all, déjà là). Les deux nouveaux sont cochés d'office.
alter table public.profiles
  add column version text not null default '' check (char_length(version) <= 30),
  add column version_at timestamptz,
  add column notif_demandes boolean not null default true,
  add column notif_changements boolean not null default true;

create function public.keep_profil_perso() returns trigger
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
  if old.visiteur and (new.nom, new.fonction, new.notif_all, new.notif_demandes, new.notif_changements)
     is distinct from (old.nom, old.fonction, old.notif_all, old.notif_demandes, old.notif_changements) then
    raise exception 'le compte visiteur ne se modifie pas' using errcode = '42501';
  end if;
  if new.version is distinct from old.version then new.version_at := now(); else new.version_at := old.version_at; end if;
  return new;
end $$;
create trigger profiles_perso before update on public.profiles for each row execute function public.keep_profil_perso();

create policy moi on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
