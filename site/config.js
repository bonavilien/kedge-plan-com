// Réglages publics du site. Rien de secret ici : la clé publique ne donne que les droits écrits dans la base.
// scripts/setup.mjs remplit supabaseUrl, supabaseKey et vapidPublicKey.
window.KPLAN_CONFIG = {
  supabaseUrl: "https://othdqswtbhzphjhpvvsb.supabase.co",
  supabaseKey: "sb_publishable_u_XJ4ThpAf3BghAvzmK0YQ_1sYHge4V",
  vapidPublicKey: "BLeiK92J7J8u4sC207c5bnF_SaZvTQLqNb4aWc83-6M9GpIwl0eGNcIZEtNV9Kl1lFgfq9gc06Cm_NHGNfRbUX4",
  // écran d'accueil
  titre: "Plan de com 2026-2027",
  sigem: { annee: 2026, kedge: 10, cible: 7, devant: [{ r: 9, nom: "GEM" }, { r: 8, nom: "Audencia" }, { r: 7, nom: "NEOMA" }] },
};
