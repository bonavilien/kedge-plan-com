-- 2.11.0 : un lien de fiche s'ouvre sans compte.
-- Une personne qui reçoit le lien d'une fiche et n'est pas connectée voit cette fiche, en lecture seule, avec un bouton pour se connecter.
-- Les tables restent fermées aux visiteurs sans compte : seule cette fonction leur répond, une fiche à la fois, par son identifiant
-- (impossible à deviner). Elle ne rend que l'essentiel : titre, dates, service, messages, état, lieu, temps fort, relais et liens
-- (les liens SharePoint demandent de toute façon un compte KEDGE). Choix de Julien, 26/11.
-- Jamais : la note, le budget et les devis, les messages et demandes, les rappels privés, l'activité, les résultats, ni aucun nom de personne.

create or replace function public.fiche_publique(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with it as (select * from public.items where id = p_id),
  msg as (
    select coalesce(jsonb_agg(m.nom order by m.n), '[]'::jsonb) as noms
    from it, public.messages m
    where (m.n > 0 and m.n::text = any (it.m)) or (m.n = 0 and 'REC' = any (it.m))
  ),
  par as (select p.id, p.t, p.date, p.flou, p.fin, p.lieu from it join public.items p on p.id = it.tf),
  rel as (
    select coalesce(jsonb_agg(jsonb_build_object('t', r.t, 'date', r.date, 'flou', r.flou, 'id', r.id, 'svc', coalesce(s.court, case when r.svc = 'chef' then 'Chefs de projet' end, ''),
      'st', r.st) order by r.date, r.t), '[]'::jsonb) as liste
    from it join public.items r on r.tf = it.id left join public.services s on s.k = r.svc
    where r.st <> 'retire'
  ),
  docs as (
    select coalesce(jsonb_agg(jsonb_build_object('t', l.nom, 'url', l.url) order by l.at), '[]'::jsonb) as liste
    from it join public.links l on l.item = it.id
    where l.url ~* '^https?://'
  ),
  pers as (
    select coalesce(jsonb_agg(jsonb_build_object('nom', pe.nom, 'du', pe.du, 'au', pe.au) order by pe.n), '[]'::jsonb) as liste
    from it join public.periods pe on pe.n = any (it.per)
  )
  select jsonb_build_object(
    'id', it.id,
    'kind', it.kind,
    't', it.t,
    'date', it.date,
    'flou', it.flou,
    'fin', it.fin,
    'periodes', pers.liste,
    'svc', case when it.svc = 'chef' then 'Chefs de projet' else coalesce((select s.nom from public.services s where s.k = it.svc), '') end,
    'partenariat', it.partner is not null,
    'media', coalesce((select pa.nom from public.partners pa where pa.k = it.partner), ''),
    'messages', msg.noms,
    'st', it.st,
    'lieu', it.lieu,
    'rang', it.rang,
    'cible', it.cible,
    'report_de', it.report_de,
    'tf', (select jsonb_build_object('id', par.id, 't', par.t, 'date', par.date, 'flou', par.flou, 'fin', par.fin, 'lieu', par.lieu) from par),
    'relais', rel.liste,
    'docs', docs.liste
  )
  from it, msg, rel, docs, pers
$$;

revoke execute on function public.fiche_publique(uuid) from public;
grant execute on function public.fiche_publique(uuid) to anon, authenticated;
