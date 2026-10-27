-- « Sujet à trancher » : rangé dans blocks avec le motif réservé « à trancher en réunion » (voir app.js, TRANCHER).
-- La notification ne dit plus « Blocage » pour ces sujets. Mêmes personnes prévenues qu'un blocage.
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select t, svc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc or (it.partner is not null and media))),
    case when new.why = 'à trancher en réunion' then 'Sujet à trancher' else 'Blocage' end,
    case when new.why = 'à trancher en réunion' then public.nom_de(new.author) || ' met « ' || it.t || ' » à l''ordre du jour de la réunion'
      else public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why end,
    '#item=' || new.item);
  return new;
end $$;
