// Réglages publics du site. Rien de secret ici : la clé publique ne donne que les droits écrits dans la base.
// scripts/setup.mjs remplit supabaseUrl, supabaseKey et vapidPublicKey.
window.KPLAN_CONFIG = {
  // V2 : true = l'appli lit et écrit dans la base ci-dessous (la nouvelle base de la V2) ; false = données de démonstration
  brancher: true,
  supabaseUrl: "https://zntbzyueqnndykukfaav.supabase.co",
  supabaseKey: "sb_publishable_3FQRYT4f2SUFYyknWkOzhg_2St-pfLe",
  vapidPublicKey: "BJUnpTxEcDGPsVqUrQxCxFi4KTWn6a9-EhJxGRQSC3TrDr7wC-PpFL0AJlQrLPBU7eOqD8aoZciwZjcxvf0qmf4",
  // compte visiteur (lecture seule) : l'écran de connexion propose « Entrer en visiteur » et ne demande que le mot de passe
  visiteur: "visiteur@kedgebs.com",
  // écran d'accueil
  titre: "Plan de com 2026-2027",
  sigem: { annee: 2026, kedge: 10, cible: 7, devant: [{ r: 9, nom: "GEM" }, { r: 8, nom: "Audencia" }, { r: 7, nom: "NEOMA" }] },
};
