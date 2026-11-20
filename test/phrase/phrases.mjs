// Ce que l'appli comprend d'une phrase : à qui, pour quand, quoi, liens, chiffres, montants, #action, et l'intention.
// Aujourd'hui = jeudi 19 novembre 2026, l'action = vendredi 11 décembre. Usage : node test/phrase/phrases.mjs
import { createRequire } from "node:module";
const P = createRequire(import.meta.url)("../../site/js/phrase.js");
const o = { today: "2026-11-19", action: "2026-12-11",
  people: [{ k: "estelle", nom: "Estelle" }, { k: "stephane", nom: "Stéphane" }, { k: "julien", nom: "Julien" }, { k: "aurelie", nom: "Aurélie" }, { k: "louise", nom: "Louise" }],
  services: [{ k: "rp", nom: "Relations presse", court: "RP" }, { k: "rs", nom: "Réseaux sociaux", court: "RS" }, { k: "video", nom: "Production vidéo", court: "Vidéo" }, { k: "content", nom: "Content", court: "Content" }],
  items: [{ id: "jpo", t: "Journée portes ouvertes" }, { id: "teaser", t: "Teaser de la journée" }, { id: "ft", t: "Classement Financial Times" }] };
// [phrase, attendu] : seuls les champs donnés sont vérifiés
const C = [
  ["@Estelle tu peux m’envoyer des visuels pour vendredi dans 2 semaines ?", { qui: "estelle", date: "2026-12-04", quoi: "Visuels", int: "demande", propre: "Tu peux m’envoyer des visuels pour vendredi dans 2 semaines ?" }],
  ["@estelle les visuels pour le 5 décembre", { qui: "estelle", date: "2026-12-05", quoi: "Visuels", int: "demande" }],
  ["@Stephane les rushs mardi en huit", { qui: "stephane", date: "2026-12-01", quoi: "Rushs", int: "demande" }],
  ["@RP le communiqué 2 semaines avant", { qui: "rp", date: "2026-11-27", int: "demande" }],
  ["@Relations presse les éléments de langage J-10", { qui: "rp", date: "2026-12-01", quoi: "Éléments de langage", int: "demande" }],
  ["@video les images tournées à Marseille pour demain", { qui: "video", date: "2026-11-20", quoi: "Rushs" }],
  ["@Vidéo un extrait vidéo du live", { qui: "video", quoi: "Rushs", int: "info" }],
  ["@Content le programme de la journée sous 48h", { qui: "content", quoi: "Programme", date: "2026-11-21" }],
  ["@RS le brief avant le week-end", { qui: "rs", quoi: "Contexte", date: "2026-11-20" }],
  ["@Aurélie les coordonnées du journaliste pour lundi", { qui: "aurelie", quoi: "Contact", date: "2026-11-23" }],
  ["@Aurélie @Stéphane le teaser est validé", { qui: "aurelie,stephane", date: null, int: "info", propre: "Le teaser est validé" }],
  ["@Louise merci pour hier !", { qui: "louise", int: "info" }],
  ["@Est", { qui: "", tape: "est", int: "" }],
  ["les visuels @", { tape: "" }],
  ["@Estelle @Ju", { qui: "estelle", tape: "ju" }],
  ["@Estelleee les visuels", { qui: "", int: "" }],
  ["@Estelle, les visuels demain", { qui: "estelle", date: "2026-11-20" }],
  ["mail à estelle@kedgebs.com pour demain", { qui: "" }],
  // plusieurs dates : l'échéance gagne
  ["@Estelle les visuels du teaser de vendredi, tu peux me les envoyer demain ?", { date: "2026-11-20" }],
  ["@RP pour le live de mardi il me faut le communiqué pour le 20", { date: "2026-11-20" }],
  // décaler
  ["@RP on décale au 4 décembre", { qui: "rp", date: "2026-12-04", int: "decaler" }],
  ["On reporte à vendredi prochain", { date: "2026-11-20", int: "decaler" }],
  ["la JPO est repoussée au 15 janvier", { date: "2027-01-15", int: "decaler" }],
  ["on avance à mardi", { date: "2026-11-24", int: "decaler" }],
  ["@Estelle tu peux reporter les visuels pour demain ?", { int: "decaler" }],
  ["@Estelle les visuels pour demain", { int: "demande" }],
  // rappel pour soi
  ["rappelle-moi lundi de relancer Aurélie", { int: "rappel", date: "2026-11-23", propreSansDate: "Relancer Aurélie" }],
  ["Rappelle moi de vérifier le lien J-2", { int: "rappel", date: "2026-12-09", propreSansDate: "Vérifier le lien" }],
  ["me rappeler d'appeler le photographe demain", { int: "rappel", propreSansDate: "Appeler le photographe" }],
  ["@Estelle rappelle-moi le code", { int: "info" }],
  // c'est fait
  ["@Julien c'est envoyé, le lien https://kedgebs.sharepoint.com/sites/com/doc.pdf", { int: "fait", liens: "sp" }],
  ["c'est fait", { int: "fait" }],
  ["Voilà, c'est dans le SharePoint", { int: "fait" }],
  ["je te les ai envoyés ce matin", { int: "fait" }],
  ["ok c'est posté", { int: "fait" }],
  ["voici le lien https://kedgebs.sharepoint.com/x", { int: "fait", liens: "sp" }],
  ["c'est envoyé ?", { int: "fait" }],
  // liens
  ["@RS le storyboard : https://kedgebs.sharepoint.com/sites/com/Storyboard.pptx.", { liens: "sp", lienUrl: "https://kedgebs.sharepoint.com/sites/com/Storyboard.pptx" }],
  ["@RS l'article https://www.lesechos.fr/x pour info", { liens: "web", int: "info" }],
  ["@RS https://kedgebs.sharepoint.com/sites/com/12-05-plan.pdf", { date: null }],
  // chiffres et montants
  ["le post a fait 12 000 vues et 3,5k clics", { chiffres: "12000 vues,3500 clics" }],
  ["14200 vues sur LinkedIn", { chiffres: "14200 vues" }],
  ["6 retombées presse dont 2 articles", { chiffres: "6 retombees,2 retombees" }],
  ["140 inscrits au webinaire", { chiffres: "140 inscrits" }],
  ["1,2 million d'impressions", { chiffres: "" }],
  ["1,2 millions impressions", { chiffres: "1200000 vues" }],
  ["la facture fait 1 500 €", { montant: 1500 }],
  ["encart à 2500 euros", { montant: 2500 }],
  ["budget de 1,5k€ pour le 5/12", { montant: 1500, date: "2026-12-05" }],
  ["€ 800 pour la bannière", { montant: 800 }],
  ["3 visuels pour le 5", { montant: null, chiffres: "", date: "2026-12-05", quoi: "Visuels" }],
  // #action
  ["@Vidéo les rushs pour #Journée portes ouvertes", { refs: "jpo", quoi: "Rushs" }],
  ["voir #journee portes ouvertes", { refs: "jpo" }],
  ["comme pour #Classement Financial Times, il faut un post", { refs: "ft" }],
  ["voir #jour", { refs: "", cherche: "jour" }],
  ["#Teaser de la journée de vendredi", { refs: "teaser", date: "2026-11-20" }],
  ["#Journée portes ouvertes", { date: null }],
];
let bad = 0;
const pick = (r, s) => ({ qui: r.qui.map((q) => q.k).join(","), date: r.date ? r.date.iso : null, quoi: r.quoi ? r.quoi.nom : null, int: r.intention, tape: r.tape, cherche: r.cherche,
  liens: r.liens.map((l) => (l.sp ? "sp" : "web")).join(","), lienUrl: r.liens[0] && r.liens[0].url, chiffres: r.chiffres.map((c) => c.n + " " + c.unite).join(","), montant: r.montant ? r.montant.n : null,
  refs: r.refs.map((x) => x.id).join(","), propre: P.propre(s, r), propreSansDate: P.propre(s, r, { sansDate: true }) });
for (const [s, exp] of C) {
  const got = pick(P.lire(s, o), s), diffs = Object.keys(exp).filter((k) => got[k] !== exp[k]);
  if (diffs.length) { bad++; console.log("FAIL " + s + "\n     " + diffs.map((k) => `${k}: attendu ${JSON.stringify(exp[k])}, lu ${JSON.stringify(got[k])}`).join(" ; ")); }
  // le surlignage recompose la phrase à l'identique
  const m = P.morceaux(s, P.lire(s, o)).map((x) => x.t).join("");
  if (m !== s.normalize("NFC")) { bad++; console.log("FAIL morceaux " + s); }
}
console.log(`${C.length - bad}/${C.length} phrases comprises`);
process.exit(bad ? 1 : 0);
