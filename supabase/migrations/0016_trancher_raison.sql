-- « Sujet à trancher » avec sa raison : why = « à trancher en réunion » ou « à trancher en réunion : <raison> » (voir app.js, TRANCHER).
-- La notification reprend la raison. Mêmes personnes prévenues qu'un blocage.
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record; tr boolean := new.why = 'à trancher en réunion' or new.why like 'à trancher en réunion : %';
begin
  select t, svc, partner into it from public.items where id = new.item;
  perform public.notify(
    array(select id from public.profiles where id is distinct from new.author and (chef or svc = it.svc or (it.partner is not null and media))),
    case when tr then 'Sujet à trancher' else 'Blocage' end,
    case when tr then public.nom_de(new.author) || ' met « ' || it.t || ' » à l''ordre du jour de la réunion'
        || coalesce(' : ' || nullif(btrim(substr(new.why, length('à trancher en réunion : ') + 1)), ''), '')
      else public.nom_de(new.author) || ' : « ' || it.t || ' » ' || new.why end,
    '#item=' || new.item);
  return new;
end $$;
