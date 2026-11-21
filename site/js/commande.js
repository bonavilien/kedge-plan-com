/* Road to 7th — la barre de commandes : le LECTEUR. Il applique les règles de commandes-regles.js, sans IA ni serveur.
   1. il repère dans la phrase ce qui a une forme fixe : dates et périodes (moteur de la 2.5), heure, motif, services, personnes, chiffres, euros ;
   2. il remplace chaque morceau par un jeton (« décale le tournage de §d0 à §d1 ») ;
   3. il essaie toutes les tournures, la plus précise gagne ; le reste ({quoi}) est cherché dans le plan par mots, une faute tolérée.
   Rien ne change dans le plan ici : le lecteur dit ce qu'il a compris, la barre (barre.js) le montre et attend un clic. */
(() => {
  const KP = (typeof window !== "undefined" ? (window.KP = window.KP || {}) : {});
  const R = KP.REGLES || (typeof require !== "undefined" ? require("./commandes-regles.js") : null);
  const P = KP.phrase || (typeof require !== "undefined" ? require("./phrase.js") : null);
  const plat = P.plat;

  /* ---------- dates en texte ISO ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lundi = (s) => add(s, -((parse(s).getDay() + 6) % 7));
  const finMois = (s) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const NB = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20 };
  const nb = (x) => (/^\d+$/.test(x) ? +x : NB[x] || 0);

  /* ---------- les règles, compilées une fois ---------- */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SLOTS = {
    quoi: "(?:[^§:]|§s\\d+)+?", sujet: "(?:[^§]|§[spner]\\d+)+?", texte: ".+?", texte2: ".+?",
    date: "§d\\d+", date2: "§d\\d+", service: "§s\\d+", qui: "§p\\d+", nombre: "§n\\d+(?:\\s*(?:et|,)?\\s*§n\\d+)*", montant: "§e\\d+", decalage: "§r\\d+",
  };
  function compile(tpl, gourmand) {
    let out = "", i = 0; const s = plat(tpl), noms = [];
    const mot = (w) => esc(w).replace(/'/g, "'\\s*").replace(/-/g, "\\s*") + (/[a-z0-9]$/.test(w) ? "(?![a-z0-9])" : "");
    const liste = (k) => "(?:" + R.MOTS[k].split("|").map((x) => plat(x.trim())).sort((a, b) => b.length - a.length).map((x) => x.split(/\s+/).map(mot).join("\\s*")).join("|") + ")";
    while (i < s.length) {
      const c = s[i];
      if (c === "{") { const j = s.indexOf("}", i), k = s.slice(i + 1, j); i = j + 1;
        if (R.MOTS[k]) out += liste(k);
        else if (SLOTS[k]) { noms.push(k); out += `(?<${k}>${gourmand && /^(quoi|sujet|texte)$/.test(k) ? SLOTS[k].replace(/\+\?$/, "+") : SLOTS[k]})`; }
        else throw new Error("règle inconnue : {" + k + "} dans « " + tpl + " »");
        continue; }
      if (c === "(" || c === "[") { out += "(?:"; i++; continue; }
      if (c === ")") { out += ")"; i++; continue; }
      if (c === "]") { out += ")?"; i++; continue; }
      if (c === "|") { out += "|"; i++; continue; }
      if (/\s/.test(c)) { out += "\\s*"; while (/\s/.test(s[i])) i++; continue; }
      let j = i; while (j < s.length && !/[\s{}()[\]|]/.test(s[j])) j++;
      out += mot(s.slice(i, j)); i = j;
    }
    return new RegExp("^\\s*" + out + "\\s*$", "d");
  }
  const REGLES = [];
  R.INTENTIONS.forEach((it, n) => it.dire.forEach((tpl, m) => REGLES.push({ k: it.k, icone: it.icone, tpl, ordre: n * 100 + m, re: [compile(tpl, false), compile(tpl, true)] })));

  /* ---------- 1. les morceaux à forme fixe ---------- */
  const NOMBRE = "(\\d{1,3}(?:[\\s.\\u202f\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)";
  const valeur = (n, k) => { let x = Number(n.replace(/[\s.\u202f\u00a0](?=\d{3}\b)/g, "").replace(",", ".")); if (k) x *= 1000; return Math.round(x); };
  const UNITE = { vue: "vues", vues: "vues", clic: "clics", clics: "clics", inscrit: "inscrits", inscrits: "inscrits", inscription: "inscrits", inscriptions: "inscrits", retombee: "retombees", retombees: "retombees", article: "retombees", articles: "retombees" };
  const ALIAS = { rs: "reseaux sociaux|reseaux|social media|rs", rp: "relations presse|presse|rp", video: "production video|prod video|video|videos", content: "content|contenu|contenus|redaction" };

  function morceaux(src, low, ctx) {
    const w = low.split(""), zones = [], glob = {};
    const libre = (a, b) => w.slice(a, b).every((c) => c !== "\u0000");
    const prend = (k, a, b, val) => { if (!libre(a, b)) return false; for (let x = a; x < b; x++) w[x] = "\u0000"; zones.push({ k, at: a, end: b, ...val }); return true; };
    const cherche = (re, f) => { const t = w.join(""); re.lastIndex = 0; let m; const out = []; while ((m = re.exec(t))) { out.push(m); if (!re.global) break; } out.forEach(f); };
    const today = ctx.today;

    /* le motif : « car… », « parce que… », jusqu'au bout */
    cherche(/(?:^|\s)((?:parce que|parce qu'|car|a cause de|a cause du|pour cause de|vu que|faute de)\s.+)$/, (m) => { const a = m.index + m[0].indexOf(m[1]); glob.motif = { txt: src.slice(a).replace(/^(parce que|parce qu'|car|à cause de|à cause du|pour cause de|vu que|faute de)\s*/i, "").trim(), at: a, end: src.length }; for (let x = a; x < w.length; x++) w[x] = "\u0000"; });
    /* euros, puis chiffres de diffusion */
    cherche(new RegExp(NOMBRE + "\\s*(k)?\\s*(?:€|euros?|eur)(?![a-z])", "g"), (m) => prend("e", m.index, m.index + m[0].length, { n: valeur(m[1], m[2]) }));
    cherche(new RegExp(NOMBRE + "\\s*(k|mille)?\\s*(vues?|clics?|inscrits?|inscriptions?|retombees?|articles?)(?![a-z])", "g"), (m) => prend("n", m.index, m.index + m[0].length, { n: valeur(m[1], m[2]), unite: UNITE[m[3]] }));
    /* l'heure : « à 9 h », « vers 14h30 », « à midi » */
    cherche(/(?:^|\s)((?:a|vers|des|pour|de)\s+(\d{1,2})\s*(?:h|heures?)\s*(\d{2})?(?![a-z0-9])|(\d{1,2})h(\d{2})?(?![a-z0-9])|(?:a\s+)?midi(?![a-z]))/, (m) => {
      const a = m.index + m[0].indexOf(m[1]), h = m[2] || m[4], mn = m[3] || m[5]; glob.heure = { txt: h ? `${+h} h${mn ? " " + mn : ""}` : "12 h", at: a, end: a + m[1].length }; for (let x = a; x < a + m[1].length; x++) w[x] = "\u0000"; });
    /* un décalage : « d'une semaine », « de 3 jours » */
    cherche(/(?:^|\s)((?:de|d')\s*(une?|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|\d{1,2})\s+(jours?|semaines?|mois)|(?:d'|de )\s*une quinzaine)(?![a-z])/g, (m) => { const a = m.index + m[0].indexOf(m[1]);
      const n = /quinzaine/.test(m[1]) ? 14 : nb(m[2]) * (/^sem/.test(m[3]) ? 7 : /^mois/.test(m[3]) ? 30 : 1); prend("r", a, a + m[1].length, { n }); });
    /* les périodes : « la semaine prochaine », « courant décembre »… */
    const per = [
      [/(?:la |cette )?semaine prochaine|la semaine pro(?![a-z])/g, () => { const l = add(lundi(today), 7); return { du: l, au: add(l, 6) }; }],
      [/cette semaine/g, () => ({ du: today, au: add(lundi(today), 6) })],
      [/ce week-?end/g, () => { const s = add(lundi(today), 5); return { du: s < today ? today : s, au: add(lundi(today), 6) }; }],
      [/ce mois-?ci|ce mois(?![a-z])/g, () => ({ du: today, au: finMois(today) })],
      [/le mois prochain/g, () => { const d = add(finMois(today), 1); return { du: d, au: finMois(d), mois: true }; }],
      [/(?:dans |pendant |sur )?les (\d+|deux|trois|quatre|huit|dix|quinze) prochains jours/g, (m) => ({ du: today, au: add(today, nb(m[1])) })],
      [/(?:dans |pendant |sur )?les (\d+|deux|trois|quatre) prochaines semaines/g, (m) => ({ du: today, au: add(today, 7 * nb(m[1])) })],
      [new RegExp("(?:en|courant|pendant|dans le mois de|au mois de|du mois de|tout le mois de|sur le mois de|pour|d'ici|a|jusqu'a|jusqu'en) (" + MOIS.join("|") + ")(?:\\s+(20\\d\\d))?(?![a-z])", "g"), (m) => {
        const t = parse(today); let y = m[2] ? +m[2] : t.getFullYear(); const k = MOIS.indexOf(m[1]); if (!m[2] && new Date(y, k + 1, 0) < t) y++;
        const du = iso(new Date(y, k, 1)); return { du, au: finMois(du), mois: true }; }],
    ];
    per.forEach(([re, f]) => cherche(re, (m) => { const z = f(m); prend("d", m.index, m.index + m[0].length, { ...z, iso: z.du, periode: true }); }));
    /* les dates : le moteur de la 2.5, appelé tant qu'il en trouve (chaque date trouvée est masquée) */
    for (let k = 0; k < 4; k++) {
      const masque = src.split("").map((c, x) => (w[x] === "\u0000" ? " " : c)).join("");
      const d = P.date(masque, today); if (!d) break;
      const avant = low.slice(Math.max(0, d.at - 16), d.at);
      if (/semaine du\s*$/.test(avant)) { const l = lundi(d.iso), i0 = avant.lastIndexOf("semaine du"), a = d.at - avant.length + i0 - (avant.slice(0, i0).endsWith("la ") ? 3 : 0);
        if (!prend("d", a, d.end, { iso: l, du: l, au: add(l, 6), periode: true }) && !prend("d", d.at, d.end, { iso: d.iso })) break; continue; }
      const art = /(?:^|\s)(le|l')\s*$/.exec(low.slice(Math.max(0, d.at - 4), d.at)), a0 = art ? d.at - art[0].trimStart().length : d.at;
      if (!prend("d", a0, d.end, { iso: d.iso, txt: d.txt }) && !prend("d", d.at, d.end, { iso: d.iso, txt: d.txt })) break;
    }
    /* un service, seulement quand on le désigne : « aux RS », « pour la vidéo », « côté presse » */
    const svcs = (ctx.services || []).map((s) => ({ k: s.k, alias: [ALIAS[s.k], plat(s.nom), plat(s.court)].filter(Boolean).join("|") }));
    svcs.forEach((s) => cherche(new RegExp("(?:^|\\s)(?:(?:aux|au|a|pour|des|du|de|cote|chez|par|equipe|service|c'est)\\s+)?((?:les |la |le |l'\\s*)?(?:" + s.alias.split("|").sort((a, b) => b.length - a.length).map(esc).join("|") + "))(?![a-z0-9])", "g"), (m) => {
      const a = m.index + m[0].lastIndexOf(m[1]); const ctxOk = m[0].trim() !== m[1].trim() || a === 0 || /^(les|la|le|l')/.test(m[1]);
      if (ctxOk) prend("s", a, a + m[1].length, { svc: s.k }); }));
    /* une personne de l'équipe, avec ou sans @ */
    (ctx.people || []).forEach((p) => { const n = plat(String(p.nom).split(/\s+/)[0]); if (n.length < 3) return;
      cherche(new RegExp("(?:^|\\s)(@?" + esc(n) + ")(?![a-z0-9])", "g"), (m) => { const a = m.index + m[0].indexOf(m[1]); prend("p", a, a + m[1].length, { qui: p.k }); }); });
    zones.sort((a, b) => a.at - b.at);
    const cpt = {}; zones.forEach((z) => { cpt[z.k] = (cpt[z.k] || 0); z.jeton = "§" + z.k + cpt[z.k]++; });
    return { zones, glob };
  }

  /* ---------- 2. la phrase en jetons, avec la correspondance vers le texte d'origine ---------- */
  function jetons(low, zones, glob) {
    let tok = "", pos = [], i = 0;
    const coupe = [glob.motif, glob.heure].filter(Boolean);
    const push = (s, p) => { for (const c of s) { if (c === " " && (tok.endsWith(" ") || !tok)) continue; tok += c; pos.push(p); } };
    while (i < low.length) {
      const z = zones.find((x) => x.at === i);
      if (z) { push(" ", i); push(z.jeton, i); push(" ", z.end); i = z.end; continue; }
      const g = coupe.find((x) => x.at === i); if (g) { push(" ", i); i = g.end; continue; }
      const c = low[i];
      if (/[a-z0-9§]/.test(c)) push(c, i);
      else if (c === "'") { push("'", i); push(" ", i); }
      else if (c === ":") { push(" : ", i); }
      else push(" ", i);
      i++;
    }
    while (tok.endsWith(" ")) { tok = tok.slice(0, -1); pos.pop(); }
    /* la politesse et les tournures d'approche ne changent rien : « tu peux… », « il faut décaler… » */
    const poli = /^(?:(?:est ce que |est-ce que )?(?:tu peux|tu pourrais|peux tu|pourrais tu|vous pouvez|pouvez vous|merci de|stp|svp|s'il te plait|s'il vous plait|alors|ok|bon|du coup|hey|salut|hello|dis|dis moi|bonjour|allez|vas y|je voudrais|j'aimerais|je souhaite|on voudrait)\s+)+/;
    const modal = /^(?:il faut|faut|il faudrait|faudrait|on doit|je dois|on va|on peut|je vais|je veux|on veut)\s+(?=\S+(?:er|ir|re)(?:\s|$))/;
    for (const re of [poli, modal, poli]) { const m = tok.match(re); if (m) { tok = tok.slice(m[0].length); pos = pos.slice(m[0].length); } }
    tok = tok.replace(/\s+(stp|svp|s'il te plait|s'il vous plait|merci)$/, (x) => { pos = pos.slice(0, pos.length - x.length); return ""; });
    return { tok, pos };
  }

  /* ---------- 3. les tournures ---------- */
  function analyser(texte, ctx) {
    const src = String(texte || "").normalize("NFC"), low = plat(src);
    const { zones, glob } = morceaux(src, low, ctx);
    const { tok, pos } = jetons(low, zones, glob);
    const question = /\?\s*$/.test(src);
    const res = [];
    if (tok.trim()) for (const r of REGLES) for (const re of r.re) {
      const m = re.exec(tok); if (!m) continue;
      const slots = {}; let lib = tok.length, info = 0, vide = false;
      for (const [k, v] of Object.entries(m.groups || {})) {
        if (v == null) continue;
        const [a, b] = m.indices.groups[k]; lib -= b - a;
        const z = zones.filter((x) => tok.slice(a, b).includes(x.jeton));
        const at = pos[a], end = b > a ? pos[b - 1] + 1 : at;
        const s = { tok: v.trim(), zones: z, at: Math.min(at, ...z.map((x) => x.at)), end: Math.max(end, ...z.map((x) => x.end)) };
        s.txt = src.slice(s.at, s.end).trim();
        if (/^(quoi|sujet|texte|texte2)$/.test(k) && !/[a-z0-9]{2}/.test(v.replace(/§[a-z]\d+/g, ""))) vide = true;
        if (/^(quoi|sujet|texte)$/.test(k) && /^(le|la|les|l'|un|une|des|du|de|ca|ce|cela|tout|quoi|on|il|elle)$/.test(v.trim())) vide = true;
        if (z.length) info += 6 * z.length;
        slots[k] = s;
      }
      if (vide) continue;
      const litteral = tok.split("").filter((c, x) => /[a-z0-9]/.test(c) && !Object.values(m.indices.groups || {}).some((g) => g && x >= g[0] && x < g[1])).length;
      res.push({ k: r.k, icone: r.icone, tpl: r.tpl, slots, score: litteral + info, ordre: r.ordre, re: m });
    }
    res.sort((a, b) => b.score - a.score || a.ordre - b.ordre);
    /* une question sans tournure connue : on cherche avec ce qu'elle contient */
    if (!res.length && question && tok.trim()) {
      const sujet = tok.replace(/§d\d+/g, "").replace(/\b(qu'\s*est\s*ce\s*qu[i']?|est\s*ce\s*qu[e']?|quoi|quand|comment|pourquoi|y a t il|il y a|on a|qui|ou|quel|quelle|quels|quelles)\b/g, " ").trim();
      if (/[a-z0-9]{2}/.test(sujet)) res.push({ k: "chercher", icone: "search", tpl: "?", score: 1, slots: { sujet: { tok: sujet, txt: sujet, zones: zones.filter((z) => z.k !== "d"), at: 0, end: src.length }, ...(zones.find((z) => z.k === "d") ? { date: { tok: "", zones: [zones.find((z) => z.k === "d")], at: 0, end: 0, txt: "" } } : {}) } });
    }
    const best = res[0] || null;
    /* les morceaux à surligner dans la barre : les mots de la tournure en gras, puis chaque morceau selon sa nature */
    const surligne = [];
    if (best && best.re) {
      const g = Object.values(best.re.indices.groups || {}).filter(Boolean);
      let a = -1;
      for (let x = 0; x <= tok.length; x++) {
        const ok = x < tok.length && /[a-z0-9']/.test(tok[x]) && !g.some((r) => x >= r[0] && x < r[1]);
        if (ok && a < 0) a = x; if (!ok && a >= 0) { surligne.push({ k: "verbe", at: pos[a], end: pos[x - 1] + 1 }); a = -1; }
      }
      for (const [k, s] of Object.entries(best.slots)) if (/^(quoi|sujet)$/.test(k)) surligne.push({ k: "quoi", at: s.at, end: s.end });
    }
    zones.forEach((z) => surligne.push({ k: { d: "date", s: "service", p: "qui", n: "nombre", e: "nombre", r: "date" }[z.k], at: z.at, end: z.end }));
    if (glob.heure) surligne.push({ k: "date", at: glob.heure.at, end: glob.heure.end });
    if (glob.motif) surligne.push({ k: "motif", at: glob.motif.at, end: glob.motif.end });
    return { src, tok, zones, glob, question, best, autres: res.slice(1, 4), surligne: propre(surligne) };
  }
  /* les morceaux ne se chevauchent pas : le plus précis (date, service…) passe devant le reste */
  function propre(list) {
    const rang = { date: 0, service: 0, qui: 0, nombre: 0, motif: 1, verbe: 2, quoi: 3 };
    const out = [];
    list.filter((z) => z.end > z.at).sort((a, b) => rang[a.k] - rang[b.k]).forEach((z) => {
      let parts = [z];
      out.forEach((o) => { parts = parts.flatMap((p) => (p.end <= o.at || p.at >= o.end) ? [p] : [p.at < o.at ? { ...p, end: o.at } : null, p.end > o.end ? { ...p, at: o.end } : null].filter(Boolean)); });
      out.push(...parts.filter((p) => p.end > p.at));
    });
    return out.sort((a, b) => a.at - b.at);
  }

  /* ---------- retrouver une action par son titre approximatif ---------- */
  const VIDE = new Set("le la les l un une des du de d au aux a en et pour sur mon ma mes ton ta tes notre nos votre vos ce cet cette ces son sa ses leur leurs avec dans par qui que quoi ou tout toute tous toutes y on il elle action actions fiche fiches truc chose".split(" "));
  const mots = (s) => plat(String(s || "")).replace(/[^a-z0-9]+/g, " ").split(" ").filter((x) => x && !VIDE.has(x));
  const sing = (x) => (x.length > 3 ? x.replace(/(s|x)$/, "") : x);
  const lev1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; };
  function texteDe(it, ctx, large) {
    let t = plat([it.t, it.partner, it.lieu, it.tf && ctx.titre ? ctx.titre(it.tf) : "", large ? it.note : "", large && ctx.extra ? ctx.extra(it) : ""].filter(Boolean).join(" "));
    for (const [court, long] of Object.entries(R.SYNONYMES)) { if (new RegExp("\\b" + long + "\\b").test(t)) t += " " + court; if (new RegExp("\\b" + court + "\\b").test(t)) t += " " + long; }
    return mots(t);
  }
  function note(q, ws) {
    let s = 0;
    for (const w of q) {
      let b = 0;
      for (const x of ws) {
        if (x === w || sing(x) === sing(w)) { b = 1; break; }
        if (w.length >= 3 && x.startsWith(w)) b = Math.max(b, 0.9);
        else if (x.length >= 4 && w.startsWith(x)) b = Math.max(b, 0.8);
        else if (w.length >= 5 && lev1(w, x)) b = Math.max(b, 0.75);
      }
      s += b;
    }
    return q.length ? s / q.length : 0;
  }
  /* renvoie les actions classées : { it, score } ; score 1 = tous les mots retrouvés */
  function trouver(q, items, ctx = {}) {
    const qw = mots(q); if (!qw.length) return [];
    const today = ctx.today || iso(new Date());
    return items.map((it) => ({ it, score: note(qw, texteDe(it, ctx, ctx.large)) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score || (plat(b.it.t) === plat(q)) - (plat(a.it.t) === plat(q)) || prox(a.it, today) - prox(b.it, today));
  }
  const prox = (it, today) => { const d = (parse(it.date) - parse(today)) / 864e5; return d >= 0 ? d : 30 - d * 2; };

  KP.commande = { analyser, trouver, mots, note, compile, REGLES, outils: { add, lundi, finMois, parse, iso } };
  if (typeof module !== "undefined") module.exports = KP.commande;
})();
