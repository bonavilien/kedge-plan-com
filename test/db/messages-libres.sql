-- 0028 : de 1 à 9 messages, l'étiquette hors messages en ligne 0, un message cité ne se supprime pas.
\set ON_ERROR_STOP 1
do $$
declare s text := (select k from public.services limit 1); i uuid := gen_random_uuid(); ok boolean;
begin
  if (select nom from public.messages where n = 0) is null then raise exception 'ligne 0 absente'; end if;
  insert into public.messages (n, nom) values (6, 'Sixième');
  insert into public.items (id, kind, t, date, svc, m) values (i, 'action', 'test', current_date, s, array['6', 'REC']);
  begin delete from public.messages where n = 6; ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'un message cité ne doit pas se supprimer'; end if;
  begin insert into public.items (kind, t, date, svc, m) values ('action', 'x', current_date, s, array['8']); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'un message inexistant doit être refusé'; end if;
  begin insert into public.messages (n, nom) values (10, 'Trop'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'pas plus de 9 messages'; end if;
  begin delete from public.messages where n = 0; ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'la ligne 0 ne se supprime pas'; end if;
  delete from public.items where id = i;
  delete from public.messages where n = 6;
  raise notice 'messages libres : bon';
end $$;
