// La barre de commandes : phrases « équipe com pressée » (sans accents, fautes, abréviations, politesse, négations, pièges).
// Même format que test/commandes/phrases.mjs. today = 2026-11-21 (samedi).
// node phrases-equipe.mjs              → teste le code du dépôt
// KP_JS=/chemin/vers/js node phrases-equipe.mjs   → teste une copie (ex. ./fix-js)
// --json → sortie machine (une ligne JSON par phrase)
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const DIR = process.env.KP_JS || new URL("../../../site/js", import.meta.url).pathname;
const C = require(DIR + "/commande.js");
const ctx = { today: "2026-11-21", services: [{ k: "rp", nom: "Relations presse", court: "RP" }, { k: "rs", nom: "Réseaux sociaux", court: "RS" }, { k: "video", nom: "Production vidéo", court: "Vidéo" }, { k: "content", nom: "Content", court: "Content" }],
  people: [{ k: "estelle", nom: "Estelle" }, { k: "aurelie", nom: "Aurélie" }, { k: "stephane", nom: "Stéphane" }, { k: "julien", nom: "Julien" }, { k: "louise", nom: "Louise" }] };
// [phrase, intention, vérifications facultatives { quoi, date, date2, du, au, service, heure, n }, groupe]
export const P = [
  ["rajoute stp un post linkedin sur le classement FT mercredi", "creer", { date: "2026-11-25" }],
  ["on poste un reel JPO dimanche", "creer", { date: "2026-11-22" }],
  ["faudrait une story pour les admissibles apres-demain", "creer", { date: "2026-11-23" }],
  ["tu pourrais ajouter un mailing alumni le 2 dec ?", "creer", { date: "2026-12-02" }],
  ["Nouvelle action: video temoignage etudiant fin decembre", "creer", { date: "2026-12-31" }],
  ["cale une interview radio du directeur jeudi prochain", "creer", { date: "2026-11-26" }],
  ["on reporte la story JPO a mercredi", "decaler", { date: "2026-11-25" }],
  ["mercredi, repousse la newsletter", "decaler", { date: "2026-11-25" }],
  ["tu peux me reporter le CP au 9 ?", "decaler", { date: "2026-12-09" }],
  ["la page web JPO glisse au 4 decembre", "decaler", { date: "2026-12-04" }],
  ["decale de 3 jours le post linkedin", "decaler"],
  ["le webinaire passe au jeudi 10 decembre", "decaler", { date: "2026-12-10" }],
  ["faut qu'on repousse le gala au 18", "decaler", { date: "2026-12-18" }],
  ["on oublie le live insta", "annuler"],
  ["le webinaire ne se fera pas", "annuler"],
  ["on n'a plus besoin de la brochure PGE", "annuler"],
  ["enleve la story JPO du plan stp", "annuler"],
  ["on ne decale plus le teaser", null],
  ["on ne supprime pas la story", null],
  ["la newsletter n'est pas encore partie", null],
  ["la newsletter est partie ?", "chercher"],
  ["le teaser est valide", "confirmer"],
  ["c'est ok pour la story JPO", "confirmer"],
  ["remets le gala en a confirmer", "aconfirmer"],
  ["la story JPO a fait 4 500 vues", "resultats"],
  ["le mailing alumni c'est 32 clics", "resultats"],
  ["le stand coute 2k€", "budget"],
  ["confie la brochure au contenu", "service", { service: "content" }],
  ["la presse s'occupe du point presse", "service", { service: "rp" }],
  ["relie le reel a la JPO Bordeaux", "lier"],
  ["renomme la story en Story J-2 JPO", "renommer"],
  ["duplique le post linkedin pour le 8 decembre", "dupliquer", { date: "2026-12-08" }],
  ["Louise, tu peux me faire les visuels du gala", "demander"],
  ["rappelle moi d'envoyer le CP lundi", "rappel"],
  ["ajoute une note au gala : badge a imprimer", "note"],
  ["le shooting se fera au campus de Paris", "lieu"],
  ["epingle la newsletter alumni stp", "epingler"],
  ["retire la newsletter alumni des epingles", "desepingler"],
  ["ouvre la newsletter alumni", "ouvrir"],
  ["va dans le calendrier", "aller"],
  ["qui est sur le teaser ?", "chercher"],
  ["qu'est ce qu'on a vendredi ?", "chercher", { date: "2026-11-27" }],
  ["annule ça stp", "defaire"],
  ["merci !", null],
  ["Story J-7 JPO", null],
  ["decale la story J-7 JPO a lundi", "decaler", { date: "2026-11-23" }],
  ["annule le post car on a plus le visuel", "annuler", { quoi: "le post" }],
  ["decale le post Car Wash a jeudi", "decaler", { date: "2026-11-26" }],
];

const json = process.argv.includes("--json");
let ko = 0;
for (const [s, k, v = {}] of P) {
  const r = C.analyser(s, ctx), b = r.best, err = [];
  if ((b ? b.k : null) !== k) err.push(`intention ${b ? b.k : "—"} au lieu de ${k}`);
  else if (b) {
    const z = (n) => b.slots[n] && b.slots[n].zones.find((x) => x.k === "d");
    const dz = z("date") || (b.slots.sujet && b.slots.sujet.zones.find((x) => x.k === "d")) || (b.slots.texte && b.slots.texte.zones.find((x) => x.k === "d"));
    if (v.quoi && b.slots.quoi && b.slots.quoi.txt !== v.quoi) err.push(`quoi « ${b.slots.quoi.txt} »`);
    if (v.date && (!dz || dz.iso !== v.date)) err.push(`date ${dz && dz.iso}`);
    if (v.date2 && (!z("date2") || z("date2").iso !== v.date2)) err.push(`date2 ${z("date2") && z("date2").iso}`);
    if (v.du && (!dz || dz.du !== v.du)) err.push(`du ${dz && dz.du}`);
    if (v.au && (!dz || dz.au !== v.au)) err.push(`au ${dz && dz.au}`);
    if (v.service && !(Object.values(b.slots).some((x) => x.zones.some((y) => y.svc === v.service)))) err.push("service");
    if (v.heure && (!r.glob.heure || r.glob.heure.txt !== v.heure)) err.push(`heure ${r.glob.heure && r.glob.heure.txt}`);
    if (v.n && !(b.slots.decalage && b.slots.decalage.zones[0].n === v.n)) err.push("décalage");
  }
  if (err.length) ko++;
  if (json) console.log(JSON.stringify({ s, k, ok: !err.length, err, got: b ? b.k : null, quoi: b && b.slots.quoi ? b.slots.quoi.txt : undefined, tok: r.tok, tpl: b && b.tpl }));
  else if (err.length) console.log("✗", s, "→", err.join(", "), "| jetons :", r.tok);
}
if (!json) console.log(`${P.length - ko} / ${P.length} phrases comprises`);
if (import.meta.url === `file://${process.argv[1]}`) process.exit(ko ? 1 : 0);
