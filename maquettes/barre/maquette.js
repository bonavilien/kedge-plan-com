/* maquette seulement : quelques lignes de démonstration pour les exemples de la barre */
(() => {
  const KP = window.KP, db = KP.store._db(), T = KP.TODAY, A = KP.addDays;
  const vend = A(T, ((5 - KP.parse(T).getDay() + 7) % 7) || 7), lun = KP.addDays(KP.monday(T), 7);
  if (db.items.some((i) => i.t === "Tournage Major Prépa : témoignages d'admis")) return;
  let n = 900; const ac = (t, date, svc, m, o = {}) => db.items.push({ id: "m" + (++n), contacts: [], kind: "action", variant: "", t, date, flou: false, fin: "", svc, m, st: "prevu", tf: "", lieu: "", note: "", docs: [], reunion: false, by: "julien", ...o });
  ac("Tournage Major Prépa : témoignages d'admis", vend, "video", ["continuum"], { lieu: "Campus de Bordeaux" });
  ac("Tournage Major Prépa : le campus de Marseille", A(vend, 12), "video", ["continuum"], { st: "confirmer" });
  ac("Carrousel JPO Paris", A(lun, 3), "rs", ["recrutement"]);
  ac("Carrousel JPO Bordeaux", A(lun, 4), "rs", ["recrutement"], { st: "confirmer" });
  ac("Relance PGE : admissibles", A(lun, 1), "content", ["recrutement"]);
  ac("Post LinkedIn PGE : résultats des concours", A(lun, 3), "rs", ["continuum"], { st: "confirmer" });
  ac("Newsletter PGE de décembre", A(lun, 4), "content", ["alumni"]);
})();
/* les quatre exemples de Julien, puis deux autres */
window.KP.cmdExemples = () => [
  { i: "plus", t: "Ajoute une relance PGE demain à 9 h" },
  { i: "shift", t: "Décale le tournage Major Prépa de vendredi à mardi prochain" },
  { i: "close", t: "On laisse tomber le carrousel JPO Paris" },
  { i: "search", t: "Qu'est-ce qui est prévu pour le PGE la semaine prochaine ?" },
  { i: "chart", t: "Le carrousel JPO Bordeaux a fait 8 400 vues" },
  { i: "chat", t: "Demande à Estelle les visuels pour le carrousel JPO Paris avant vendredi" },
];
