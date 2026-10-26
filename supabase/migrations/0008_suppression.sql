-- Supprimer pour de bon une fiche retirée : ceux qui peuvent la modifier (son service, les chefs, les comptes média
-- pour un partenariat), et seulement une fois retirée (retirer d'abord prévient les services concernés).
-- Ses documents, demandes, blocages et son historique partent avec elle ; les relais d'un temps fort supprimé restent, sans temps fort.
create policy supprimer on public.items for delete to authenticated using (
  st = 'retire'
  and ((partner is null and (public.is_chef() or svc = public.my_svc())) or (partner is not null and public.is_media()))
);
