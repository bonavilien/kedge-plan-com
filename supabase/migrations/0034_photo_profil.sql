-- 2.7 : sa photo dans Réglages > Mon profil, visible sur tous les visages de l'appli.
-- Un petit carré JPEG (160 px) en data URL, préparé par l'appli ; la base refuse tout le reste (taille, format).
-- Chacun change sa propre photo (règle « moi » de 0022) ; les chefs de projet peuvent tout modifier.
-- Numéro 0034 : 0033 est réservé à la mise à jour automatique des copies (2.7 installateur, pas encore publiée).
alter table public.profiles
  add column if not exists photo text
    constraint profiles_photo_format check (photo is null or (char_length(photo) <= 60000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));
