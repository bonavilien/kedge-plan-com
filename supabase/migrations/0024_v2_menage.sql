-- V2. Ménage de la base, le jour de la bascule, APRÈS une sauvegarde (scripts/sauvegarde.mjs).
-- On range les données dans la forme de la V2 et on éteint ce qu'elle n'utilise plus. Les colonnes devenues
-- inutiles (cc, offre, marketing) restent en place, vides : les supprimer demanderait de réécrire une quinzaine
-- de fonctions pour rien, et les garder ne coûte rien.

-- ---------- 1. Trois statuts (et « retiré » pour une fiche annulée) ----------
do $$ begin
  perform set_config('kplan.renommage', '1', true);  -- ni ligne d'historique ni notification
  update public.items set st = 'confirmer' where st = 'idee';
  update public.items set st = 'planifie' where st = 'production';
  -- 2. plus de « services prévenus »
  update public.items set cc = '{}' where cardinality(cc) > 0;
  perform set_config('kplan.renommage', '', true);
end $$;
alter table public.items drop constraint items_st_check;
alter table public.items add constraint items_st_check check (st in ('confirmer', 'planifie', 'diffuse', 'retire'));
alter table public.items add constraint items_sans_cc check (cardinality(cc) = 0);

-- ---------- 3. Plus de blocages : ceux qui restent ouverts sont levés ; « à trancher en réunion » continue ----------
update public.blocks set leve = true where not leve and why not like 'à trancher en réunion%';
alter table public.blocks add constraint blocks_trancher check (leve or why like 'à trancher en réunion%') not valid;

-- ---------- 4. Demandes : plus de Direction du Programme, de Dir. marketing ni de Resp. offre ----------
-- une note à la Direction du Programme était déjà une note pour soi : elle devient « Moi »
update public.reqs set dest = 'moi' where dest = 'programme';
-- une demande à la Resp. offre ou à la Dir. marketing va à la personne cochée si elle est seule, sinon aux chefs de projet
update public.reqs r set dest = coalesce(
  (select min(p.id::text) from public.profiles p where (r.dest = 'offre' and p.offre) or (r.dest = 'marketing' and p.marketing) having count(*) = 1), 'chef')
where r.dest in ('offre', 'marketing');
update public.profiles set offre = false, marketing = false where offre or marketing;
alter table public.profiles add constraint profiles_sans_offre check (not offre and not marketing);

create or replace function public.check_req() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.dest in ('programme', 'marketing', 'offre') then
    raise exception 'ce destinataire n''existe plus : demande à une personne ou à un service' using errcode = '22023';
  end if;
  if new.dest = 'moi' and not public.is_chef() then
    raise exception 'seul un chef de projet se note une demande à lui-même' using errcode = '42501';
  end if;
  if new.dest = auth.uid()::text then
    raise exception 'pour te noter une demande à toi-même, choisis « Moi »' using errcode = '22023';
  end if;
  if new.dest not in ('chef', 'moi') and not exists (select 1 from public.services where k = new.dest)
      and not exists (select 1 from public.profiles where id::text = new.dest and not visiteur) then
    raise exception 'destinataire inconnu : %', new.dest using errcode = '23503';
  end if;
  if exists (select 1 from public.reqs where item = new.item and dest = new.dest and type = new.type and st = 'ouverte'
      and (new.dest <> 'moi' or asker = auth.uid())) then
    raise exception 'déjà demandé' using errcode = '23505';
  end if;
  if (select count(*) from public.reqs where asker = auth.uid() and at > now() - interval '10 minutes') >= 10 then
    raise exception 'trop de demandes d''un coup, réessaie dans quelques minutes' using errcode = '54000';
  end if;
  return new;
end $$;

-- ---------- 5. Partenariats média : un pilote les gère, plus de droit à part ----------
update public.profiles set media = chef and not visiteur where media is distinct from (chef and not visiteur);
create function public.keep_media() returns trigger
language plpgsql set search_path = public as $$
begin new.media := new.chef and not new.visiteur; return new; end $$;
-- « profiles_media » passe après « profiles_keep » (ordre alphabétique) : celui-ci ne voit donc aucun changement de ce droit
create trigger profiles_media before insert or update on public.profiles for each row execute function public.keep_media();

-- ---------- 6. Notifications : chacun choisit ce qu'il reçoit (Réglages > Mon profil) ----------
-- demandes (notif_demandes) : demande reçue, éléments reçus, demande retirée, nouvelle échéance ;
-- changements (notif_changements) : un temps fort ou une action reporté, retiré, remis ;
-- créations : notif_all, comme avant. Les rappels J-30, J-15, J-7 et le reste arrivent toujours.
create or replace function public.notify(p_users uuid[], p_title text, p_body text, p_url text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  cat text := case
    when p_title in ('Demande d''éléments', 'Éléments reçus', 'Demande retirée', 'Nouvelle deadline') then 'demandes'
    when p_title like 'Reporté : %' or p_title like 'Retiré : %' or p_title like 'Remis : %' then 'changements' end;
begin
  insert into public.outbox (user_id, title, body, url, dedupe)
  select u, p_title, p_body, p_url, case when p_dedupe is null then null else p_dedupe || ':' || u end
  from unnest(p_users) as u
  where u is not null
    and (cat is null or exists (select 1 from public.profiles p where p.id = u
          and case cat when 'demandes' then p.notif_demandes else p.notif_changements end))
  on conflict (dedupe) do nothing;
end $$;
revoke execute on function public.notify(uuid[], text, text, text, text) from public, anon, authenticated;
