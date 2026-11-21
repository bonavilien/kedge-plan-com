// La barre de commandes : chaque phrase et l'intention attendue. Une phrase que l'équipe écrit et que la barre rate = une ligne de plus ici.
// node test/commandes/phrases.mjs
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const C = require("../../site/js/commande.js");
const ctx = { today: "2026-11-21", services: [{ k: "rp", nom: "Relations presse", court: "RP" }, { k: "rs", nom: "Réseaux sociaux", court: "RS" }, { k: "video", nom: "Production vidéo", court: "Vidéo" }, { k: "content", nom: "Content", court: "Content" }],
  people: [{ k: "estelle", nom: "Estelle" }, { k: "aurelie", nom: "Aurélie" }, { k: "stephane", nom: "Stéphane" }, { k: "julien", nom: "Julien" }, { k: "louise", nom: "Louise" }] };
// [phrase, intention, vérifications facultatives { quoi, date, date2, du, au, service, heure, n }]
const P = [
  ["Ajoute une relance PGE demain à 9 h", "creer", { quoi: "relance PGE", date: "2026-11-22", heure: "9 h" }],
  ["Décale le tournage Major Prépa de vendredi à mardi prochain", "decaler", { quoi: "le tournage Major Prépa", date: "2026-11-27", date2: "2026-11-24" }],
  ["On laisse tomber le carrousel JPO Paris", "annuler", { quoi: "le carrousel JPO Paris" }],
  ["Qu'est-ce qui est prévu pour le PGE la semaine prochaine ?", "chercher", { du: "2026-11-23", au: "2026-11-29" }],
  // créer
  ["ajoute un post LinkedIn JPO jeudi à 10 h", "creer", { date: "2026-11-26", heure: "10 h" }],
  ["crée une newsletter alumni pour le 15 décembre", "creer", { date: "2026-12-15" }],
  ["prévois un communiqué classement FT le 11 décembre", "creer", { date: "2026-12-11" }],
  ["programme une interview vidéo d'un admis mardi", "creer", { date: "2026-11-24" }],
  ["il faut un post LinkedIn sur le classement FT lundi", "creer", { date: "2026-11-23" }],
  ["mets un carrousel JPO Bordeaux le 3 décembre", "creer", { date: "2026-12-03" }],
  ["Ajoute un temps fort Salon Studyrama le 12 décembre", "creer", { quoi: "Salon Studyrama" }],
  ["ajoute un partenariat avec Studyrama en janvier", "creer", { du: "2027-01-01" }],
  ["les RS font un carrousel JPO Bordeaux jeudi", "creer", { service: "rs" }],
  ["ajoute une vidéo campus pour la vidéo le 4 décembre", "creer", { service: "video", date: "2026-12-04" }],
  ["nouvelle action : tribune du directeur courant janvier", "creer", { du: "2027-01-01" }],
  ["lundi on fait un post sur le forum", "creer", { date: "2026-11-23" }],
  ["tu peux ajouter une story JPO vendredi stp", "creer", { date: "2026-11-27" }],
  ["ajoute le teaser JPO", "creer", { quoi: "teaser JPO" }],
  // décaler
  ["tu peux décaler la newsletter alumni à jeudi stp", "decaler", { date: "2026-11-26" }],
  ["reporte le gala d'une semaine car la salle est prise", "decaler", { n: 7 }],
  ["avance le teaser de 2 jours", "decaler", { n: 2 }],
  ["décale le teaser courant décembre", "decaler", { du: "2026-12-01" }],
  ["le tournage Major Prépa passe à jeudi", "decaler", { date: "2026-11-26" }],
  ["on décale la newsletter de décembre à janvier", "decaler"],
  ["repousse la page web JPO au 2 décembre", "decaler", { date: "2026-12-02" }],
  ["déplace l'invitation presse à la semaine prochaine", "decaler", { du: "2026-11-23" }],
  ["bouge le carrousel JPO Paris à lundi", "decaler", { date: "2026-11-23" }],
  ["la tribune est reportée au 8 décembre", "decaler", { date: "2026-12-08" }],
  ["finalement le teaser c'est mercredi", "decaler", { date: "2026-11-25" }],
  ["il faut décaler le point presse à vendredi", "decaler", { date: "2026-11-27" }],
  ["décale le teaser", "decaler"],
  ["décale le teaser à la semaine d'après", "decaler"],
  ["reporte le communiqué FT au 14 décembre parce que le classement sort plus tard", "decaler", { date: "2026-12-14" }],
  // annuler / rétablir / supprimer
  ["on laisse tomber le carrousel JPO", "annuler"],
  ["annule le teaser", "annuler"],
  ["plus besoin du carrousel JPO Bordeaux", "annuler"],
  ["le point presse tombe à l'eau", "annuler"],
  ["la brève Séoul est annulée", "annuler"],
  ["on oublie la newsletter de décembre", "annuler"],
  ["on zappe le post LinkedIn", "annuler"],
  ["pas de carrousel JPO Paris finalement", "annuler"],
  ["retire le teaser du plan", "annuler"],
  ["finalement on garde le carrousel JPO Paris", "retablir"],
  ["rétablis le teaser", "retablir"],
  ["supprime la brève Séoul", "supprimer"],
  ["efface définitivement le teaser", "supprimer"],
  // état
  ["le carrousel JPO Paris est en ligne", "diffuser"],
  ["le teaser est diffusé", "diffuser"],
  ["j'ai publié le post LinkedIn", "diffuser"],
  ["c'est posté pour les stories Shanghai", "diffuser"],
  ["confirme le teaser", "confirmer"],
  ["le tournage Major Prépa est calé", "confirmer"],
  ["remets le teaser à confirmer", "aconfirmer"],
  ["le gala n'est plus sûr", "aconfirmer"],
  // résultats, budget
  ["Le communiqué FT a fait 12 400 vues et 300 clics", "resultats"],
  ["le carrousel JPO : 8 400 vues", "resultats"],
  ["note 45 inscrits pour le webinaire", "resultats"],
  ["la vidéo campus a fait 2,5k vues", "resultats"],
  ["le dossier L'Étudiant coûte 1 650 €", "budget"],
  ["budget du salon L'Étudiant : 3 200 euros", "budget"],
  // service, lier, renommer, dupliquer
  ["passe le teaser de la journée aux RS", "service", { service: "rs" }],
  ["confie le portrait alumni à la vidéo", "service", { service: "video" }],
  ["le teaser c'est pour les RS", "service", { service: "rs" }],
  ["rattache le teaser à la journée portes ouvertes", "lier"],
  ["le carrousel JPO Paris est un relais de la journée portes ouvertes", "lier"],
  ["renomme le teaser en Teaser JPO Bordeaux", "renommer"],
  ["change le titre du teaser en Teaser officiel", "renommer"],
  ["duplique le carrousel JPO Paris pour le 3 décembre", "dupliquer", { date: "2026-12-03" }],
  ["copie la newsletter alumni", "dupliquer"],
  // demander, rappel, note, lieu
  ["demande à Estelle les visuels pour le carrousel JPO Paris avant vendredi", "demander"],
  ["Stéphane tu peux m'envoyer les rushs du tournage pour lundi", "demander"],
  ["demande à Aurélie le programme du point presse", "demander"],
  ["rappelle-moi de relancer Aurélie pour la tribune lundi", "rappel"],
  ["rappel : vérifier les visuels du gala jeudi", "rappel"],
  ["ajoute une note au gala : prévoir 2 photographes", "note"],
  ["le gala aura lieu au campus de Bordeaux", "lieu"],
  ["le tournage Major Prépa se fera à Marseille", "lieu"],
  // épingler, ouvrir, aller
  ["épingle le gala", "epingler"],
  ["désépingle le classement FT", "desepingler"],
  ["ouvre la fiche du gala", "ouvrir"],
  ["montre-moi le calendrier de décembre", "aller"],
  ["va dans les résultats", "aller"],
  ["montre la période Préférer", "aller"],
  ["ouvre le budget", "aller"],
  // retrouver
  ["c'est quand la JPO ?", "chercher"],
  ["quelles actions vidéo en décembre ?", "chercher", { du: "2026-12-01" }],
  ["où en est le communiqué FT ?", "chercher"],
  ["qui s'occupe de la newsletter alumni ?", "chercher"],
  ["qu'est-ce que les RS ont cette semaine ?", "chercher"],
  ["qu'est-ce qui est prévu demain ?", "chercher", { date: "2026-11-22" }],
  ["qu'est-ce qu'on a côté presse le mois prochain", "chercher"],
  ["montre-moi tout ce qui est prévu pour la JPO", "chercher"],
  ["la semaine du 7 décembre on fait quoi ?", "chercher", { du: "2026-12-07" }],
  ["quoi de prévu cette semaine", "chercher"],
  ["qu'est-ce qui n'est pas encore diffusé cette semaine ?", "chercher"],
  ["y a quoi pour l'international en janvier ?", "chercher"],
  ["et pour les RS la semaine prochaine ?", "chercher"],
  // défaire
  ["annule ça", "defaire"],
  ["oups", "defaire"],
  // rien : une recherche simple
  ["teaser de la journée", null],
];
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
  if (err.length) { ko++; console.log("✗", s, "→", err.join(", "), "| jetons :", r.tok); }
}
console.log(`${P.length - ko} / ${P.length} phrases comprises`);
process.exit(ko ? 1 : 0);
