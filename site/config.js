// Réglages publics du site. Rien de secret ici : la clé publique ne donne que les droits écrits dans la base.
// scripts/setup.mjs remplit supabaseUrl, supabaseKey et vapidPublicKey.
window.KPLAN_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  vapidPublicKey: "",
  // écran d'accueil
  titre: "Plan de com 2026-2027",
  sigem: { annee: 2026, kedge: 10, cible: 7, devant: [{ r: 9, nom: "GEM" }, { r: 8, nom: "Audencia" }, { r: 7, nom: "NEOMA" }] },
};
