/* Road to 7th — lire une phrase, sans IA : des règles, testées sur des centaines de phrases (test/phrase/).
   « @Estelle tu peux m'envoyer des visuels pour vendredi dans 2 semaines ? » → à qui, pour quand, quoi, et ce qu'on peut en faire.
   Tout ce qui est reconnu est une proposition : rien ne change sans un clic. */
(() => {
  const KP = (typeof window !== "undefined" ? (window.KP = window.KP || {}) : {});
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  /* minuscules, sans accents, apostrophes droites : même longueur que le texte d'origine (NFC) */
  /* caractère par caractère : un caractère qui changerait de longueur (coréen, kana, accent seul) reste tel quel */
  const plat1 = (c) => { const x = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (x.length === c.length) return x; const y = c.toLowerCase(); return y.length === c.length ? y : c; };
  const plat = (s) => Array.from(s.normalize("NFC"), plat1).join("").replace(/[’']/g, "'");

  /* ---------- les dates ---------- */
  // Reconnaissance des dates en français, sans IA. Renvoie { iso, txt } : la date et le morceau reconnu, ou null.
  // today, action : objets Date (minuit local). Les morceaux qui se chevauchent : le plus long gagne.
  // Plusieurs dates dans la phrase : celle annoncée par « pour », « avant », « d'ici », « au plus tard »… gagne, sinon la première.
  function trouveDate(texte, today, action) {
    const src = texte.normalize('NFC');
    const t = plat(src);   // même longueur que src
    const NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30 };
    const N = '(\\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente)';
    const num = (x) => (/^\d+$/.test(x) ? Number(x) : NUM[x]);
    // jours du mois en lettres : premier, deux… trente et un
    const U = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    const JL = { premier: 1, '1er': 1 };
    ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'].forEach((w, i) => { if (i > 1) JL[w] = i; });
    for (let i = 1; i <= 9; i++) JL['vingt-' + (i === 1 ? 'et-un' : U[i])] = 20 + i;
    JL.vingt = 20; JL.trente = 30; JL['trente-et-un'] = 31;
    const JLRE = Object.keys(JL).sort((a, b) => b.length - a.length).map((k) => k.replace(/-/g, '[-\\s]')).join('|');
    const DAY = '(\\d{1,2}(?:er)?|' + JLRE + ')';
    const jour = (x) => (/^\d/.test(x) ? parseInt(x, 10) : JL[x.replace(/\s+/g, '-')]);
    const WD = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
    const WDN = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
    const M = '(janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)';
    const MN = { janvier: 0, janv: 0, fevrier: 1, fevr: 1, fev: 1, mars: 2, avril: 3, avr: 3, mai: 4, juin: 5, juillet: 6, juil: 6, aout: 7, septembre: 8, sept: 8, octobre: 9, oct: 9, novembre: 10, nov: 10, decembre: 11, dec: 11 };
    // « 2 semaines », « quinze jours », « huit jours », « une quinzaine »
    const SEM = '((?:\\d{1,2}|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\\s+semaines?|(?:quinze|15)\\s+jours|(?:huit|8)\\s+jours|une\\s+quinzaine)';
    const semJ = (s) => (/quinz|^15/.test(s) ? 14 : /^(huit|8)\s+jours/.test(s) ? 7 : 7 * num(s.split(/\s+/)[0]));
    const D = (y, m, d) => new Date(y, m, d);
    const now = new Date(), heure = today.getFullYear() === now.getFullYear() && today.getMonth() === now.getMonth() && today.getDate() === now.getDate() ? now.getHours() : 9;
    const avantM = (m, n = 24) => m.input.slice(Math.max(0, m.index - n), m.index);   /* ce qui précède le morceau */
    const add = (d, n) => D(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const addM = (d, n) => { const x = D(d.getFullYear(), d.getMonth() + n, 1); const last = D(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return D(x.getFullYear(), x.getMonth(), Math.min(d.getDate(), last)); };
    const lundi = (d) => add(d, -((d.getDay() + 6) % 7));
    const dansSemaine = (base, wd) => add(lundi(base), (WDN[wd] + 6) % 7);         // ce jour-là, dans la semaine de base
    const cetteSemaine = (wd) => { const x = dansSemaine(today, wd); return x < today ? add(x, 7) : x; };
    const prochain = (wd) => add(today, (WDN[wd] - today.getDay() + 7) % 7 || 7);   // le prochain, jamais aujourd'hui
    const finMois = (y, m) => D(y, m + 1, 0);
    const valide = (y, m, d) => { const x = D(y, m, d); return x.getMonth() === ((m % 12) + 12) % 12 ? x : null; };
    const futur = (m, d) => { const y = today.getFullYear(); const x = valide(y, m, d); if (!x) return valide(y + 1, m, d); return x < today && today - x > 60 * 864e5 ? valide(y + 1, m, d) : x; };
    const jourDuMois = (d) => { if (!(d >= 1 && d <= 31)) return null; for (let k = 0; k < 13; k++) { const x = valide(today.getFullYear(), today.getMonth() + k, d); if (x && x >= today) return x; } return null; };
    const semaineIso = (w) => { let y = today.getFullYear(); for (let k = 0; k < 2; k++, y++) { const x = add(lundi(D(y, 0, 4)), 7 * (w - 1)); if (add(x, 6) >= today) return x; } return null; };
    const paques = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return D(y, mo - 1, da); };
    /* ce qu'on compte : « mardi 2 visuels » n'est pas le mardi 2 */
    const COMPTE = 'visuels?|posts?|textes?|photos?|videos?|articles?|stor(?:y|ies)|reels?|images?|slides?|pages?|versions?|exemplaires?|fois|personnes?|bannieres?|publications?|formats?|creas?|creations?';
    const R = [
      // par rapport au jour de l'action
      [/\bj\s*-\s*(\d{1,3})\b/, (m) => add(action, -m[1])],
      [/\bj\s*moins\s*(\d{1,3})\b/, (m) => add(action, -m[1])],
      [/\bj\s*\+\s*(\d{1,3})\b/, (m) => add(action, +m[1])],
      [/\b(?:le\s+)?jour\s+j\b/, () => action],
      [/\b(?:l')?avant-veille\b/, () => add(action, -2)],
      [/\b(?:la\s+)?veille\b(?!\s+(?:presse|media|medias|concurrentielle|sociale|digitale|strategique|reseaux|de\s+(?:la\s+)?(?:concurrence|presse)))/, () => add(action, -1)],
      [/\b(?:le\s+)?lendemain\b/, () => add(action, 1)],
      [/\b(?:le\s+)?surlendemain\b/, () => add(action, 2)],
      [new RegExp('\\b' + SEM + '\\s+avant\\b'), (m) => add(action, -semJ(m[1]))],
      [new RegExp('\\b' + SEM + '\\s+apres\\b'), (m) => add(action, semJ(m[1]))],
      [new RegExp('\\b' + N + '\\s+jours?\\s+avant\\b'), (m) => add(action, -num(m[1]))],
      [new RegExp('\\b' + N + '\\s+jours?\\s+apres\\b'), (m) => add(action, num(m[1]))],
      // un jour de la semaine, combiné
      [new RegExp('\\b' + WD + '\\s+(?:dans|d\'ici)\\s+' + SEM), (m) => add(dansSemaine(today, m[1]), semJ(m[2]))],
      [new RegExp('\\b(?:dans|d\'ici)\\s+' + SEM + '\\s*,?\\s*(?:le\\s+|un\\s+)?' + WD + '\\b'), (m) => add(dansSemaine(today, m[2]), semJ(m[1]))],
      [new RegExp('\\b' + WD + '\\s+(?:de\\s+)?(?:la\\s+)?semaine\\s+prochaine\\b'), (m) => add(dansSemaine(today, m[1]), 7)],
      [new RegExp('\\b(?:la\\s+)?semaine\\s+prochaine\\s*,?\\s*(?:le\\s+)?' + WD + '\\b'), (m) => add(dansSemaine(today, m[1]), 7)],
      [new RegExp('\\b' + WD + '\\s+(?:de\\s+)?la\\s+semaine\\s+d\'apres\\b'), (m) => add(dansSemaine(today, m[1]), 14)],
      [new RegExp('\\b(?:le\\s+)?' + WD + '\\s+(?:d\'apres|suivant)\\b'), (m) => add(prochain(m[1]), 7)],
      [new RegExp('\\b' + WD + '\\s+en\\s+huit\\b'), (m) => add(prochain(m[1]), 7)],
      [new RegExp('\\b' + WD + '\\s+en\\s+quinze\\b'), (m) => add(prochain(m[1]), 14)],
      [new RegExp('\\b' + WD + '\\s+' + DAY + '\\s+' + M + '\\b'), (m) => futur(MN[m[3]], jour(m[2]))],
      [new RegExp('\\b' + WD + '\\s+(\\d{1,2}(?:er)?)\\b(?!\\s*(?:jours?|semaines?|mois|h\\b|h\\d|heures?|[/.:,]\\d))(?!\\s+(?:' + COMPTE + '))'), (m) => { const x = jourDuMois(jour(m[2])); return x && x.getDay() === WDN[m[1]] ? x : prochain(m[1]); }],
      [new RegExp('\\b(lun|mar|mer|jeu|ven|sam|dim)\\.?\\s+(\\d{1,2}(?:er)?)(?:\\s+' + M + ')?\\b(?!\\s*(?:h\\b|h\\d|[/.:,]\\d))'), (m) => { const x = m[3] ? futur(MN[m[3]], jour(m[2])) : jourDuMois(jour(m[2])); return x && (m[3] || x.getDay() === WDN[m[1]]) ? x : prochain(m[1]); }],
      [new RegExp('\\b' + WD + '\\s+(?:dernier|passe|d\'avant)\\b'), () => null],
      [new RegExp('\\bdepuis\\s+(?:le\\s+|ce\\s+)?' + WD + '\\b'), () => null],
      [new RegExp('\\bce\\s+' + WD + '\\b'), (m) => cetteSemaine(m[1])],
      [new RegExp('\\b' + WD + '\\s+prochain\\b'), (m) => prochain(m[1])],
      [new RegExp('\\b' + WD + '\\b'), (m) => prochain(m[1])],
      // dates écrites
      [new RegExp('\\b' + DAY + '\\s+' + M + '\\b\\.?(?:\\s+(\\d{4})\\b)?'), (m) => (m[3] ? valide(+m[3], MN[m[2]], jour(m[1])) : futur(MN[m[2]], jour(m[1])))],
      [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => valide(+m[1], m[2] - 1, +m[3])],
      /* 18/11, 18.11.2026 : pas dans une série de chiffres (téléphone, 2/3, 24/7, version 2.6) ; sans année, il faut « le », « pour », « avant »… devant */
      [/(?<![\d.,/])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?(?![.,/:]?\d)/, (m) => { const d = +m[1], mo = m[2] - 1; if (mo < 0 || mo > 11 || d < 1) return null;
        if (m[3]) return valide(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d);
        const av = avantM(m, 30); if (!/(?:^|[\s(:,;-])(?:le|pour|avant|apres|au|du|des|depuis|d'ici|jusqu'(?:au|a)|deadline|limite|max|entre|et|ou|a partir du|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\.?\s*$|^[\s(:-]*$/.test(av)) return null;
        return futur(mo, d); }],
      [/\ble\s+(\d{1,2}(?:er)?)\b(?!\s*(?:[/.]|jours?|semaines?|mois|h\b|heures?|%|€|euros?))/, (m) => (/\b(?:prefere|prends|garde|choisis|retiens)\s+$/.test(avantM(m)) ? null : jourDuMois(jour(m[1])))],
      [new RegExp('\\bdebut\\s+(?:du\\s+mois\\s+de\\s+|de\\s+|d\')?' + M + '\\b'), (m) => futur(MN[m[1]], 1)],
      [new RegExp('\\b(?:mi|milieu\\s+(?:du\\s+mois\\s+)?(?:de\\s+|d\'))[-\\s]?' + M + '\\b'), (m) => futur(MN[m[1]], 15)],
      [new RegExp('\\bfin\\s+(?:du\\s+mois\\s+de\\s+|de\\s+|d\')?' + M + '\\b'), (m) => { const y = today.getFullYear(), x = finMois(y, MN[m[1]]); return x < today ? finMois(y + 1, MN[m[1]]) : x; }],
      [/\b(?:semaine|sem\.?)\s*(\d{1,2})\b|\bs(\d{2})\b|\bs\d\b/, (m) => { if (!m[1] && !m[2]) return null; if (m[1] && /\bpar\s+$/.test(avantM(m))) return null; const w = +(m[1] || m[2]); return w >= 1 && w <= 53 ? semaineIso(w) : null; }],
      // fêtes
      [/\b(?:avant|pour\s+la\s+veille\s+de)\s+noel\b/, () => futur(11, 24)],
      [/\bnoel\b/, (m) => (/\b(?:de|du)\s+$|d'$/.test(avantM(m)) ? null : futur(11, 25))],
      [/\b(?:nouvel\s+an|jour\s+de\s+l'an)\b/, () => futur(0, 1)],
      [/\btoussaint\b/, () => futur(10, 1)],
      [/\bpaques\b/, () => { const x = paques(today.getFullYear()); return x < today ? paques(today.getFullYear() + 1) : x; }],
      // semaines, mois, année
      [/\bfin\s+de\s+(?:la\s+)?semaine\s+prochaine\b/, () => add(dansSemaine(today, 'vendredi'), 7)],
      [/\bdebut\s+de\s+(?:la\s+)?semaine\s+prochaine\b/, () => add(lundi(today), 7)],
      [/\bmilieu\s+de\s+(?:la\s+)?semaine\s+prochaine\b/, () => add(dansSemaine(today, 'mercredi'), 7)],
      [/\bfin\s+de\s+(?:la\s+)?semaine\b/, () => cetteSemaine('vendredi')],
      [/\b(?:avant|d'ici)\s+le\s+(?:week-end|weekend|we)\b/, () => cetteSemaine('vendredi')],
      [/\b(?:ce|le)\s+(?:week-end|weekend|we)\b/, () => cetteSemaine('samedi')],
      [/\b(?:la\s+)?semaine\s+prochaine\b/, () => add(lundi(today), 7)],
      [/\b(?:la\s+)?semaine\s+d'apres\b/, () => add(lundi(today), 14)],
      [/\bfin\s+du\s+mois\s+prochain\b/, () => finMois(today.getFullYear(), today.getMonth() + 1)],
      [/\bfin\s+du\s+mois\b/, () => finMois(today.getFullYear(), today.getMonth())],
      [/\b(?:debut\s+du\s+mois\s+prochain|le\s+mois\s+prochain|mois\s+prochain)\b/, () => D(today.getFullYear(), today.getMonth() + 1, 1)],
      [/\bfin\s+(?:d'|de\s+l')annee\b/, () => D(today.getFullYear(), 11, 31)],
      [/\bdebut\s+(?:d'annee|de\s+l'annee\s+prochaine)\b/, () => D(today.getFullYear() + 1, 0, 1)],
      [/\bdebut\s+(\d{4})\b/, (m) => D(+m[1], 0, 1)],
      [/\bfin\s+(\d{4})\b/, (m) => D(+m[1], 11, 31)],
      // par rapport à aujourd'hui
      [/\baujourd'?hui\b|\bce\s+soir\b|\bcet\s+apres-midi\b|\bce\s+matin\b|\bdans\s+la\s+journee\b|\ben\s+fin\s+de\s+journee\b/, () => today],
      [/\basap\b|\bau\s+plus\s+vite\b|\bdes\s+que\s+possible\b|\ben\s+urgence\b/, () => add(today, 1)],
      [/\bapres[-\s]demain\b/, () => add(today, 2)],
      [/\bdemain\b/, () => add(today, 1)],
      [new RegExp('\\b(?:dans|sous|d\'ici)\\s+' + SEM), (m) => add(today, semJ(m[1]))],
      [/\b(?:dans|sous)\s+(?:une\s+)?quinzaine\b/, () => add(today, 14)],
      [new RegExp('\\b(?:dans|sous|d\'ici)\\s+' + N + '\\s+jours?\\b'), (m) => add(today, num(m[1]))],
      [/\b(?:dans|sous|d'ici)\s+(\d{1,3})\s*h(?:eures?)?\b/, (m) => add(today, Math.floor((heure + +m[1]) / 24))],
      [new RegExp('\\b(?:dans|sous|d\'ici)\\s+' + N + '\\s+mois\\b'), (m) => addM(today, num(m[1]))],
    ];
    // toutes les trouvailles
    const found = [];
    for (const [re, f] of R) {
      for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
        const d = f(m);
        found.push({ at: m.index, end: m.index + m[0].length, d: d && !isNaN(d) ? d : null });   // date impossible (31 novembre) : bloque aussi « le 31 »
      }
    }
    // morceaux qui se chevauchent : le plus long
    found.sort((a, b) => (b.end - b.at) - (a.end - a.at) || a.at - b.at);
    let keep = [];
    for (const x of found) if (!keep.some((k) => x.at < k.end && k.at < x.end)) keep.push(x);
    keep = keep.filter((k) => k.d);
    if (!keep.length) return null;
    // plusieurs dates : l'échéance annoncée gagne, la date d'un sujet (« le teaser de vendredi ») perd
    const AVANT = /(?:pour|avant|d'ici|plus\s+tard|deadline|limite|delai|jusqu'(?:a|au)|max(?:imum)?|sous|rendu|livre[rs]?)\s*(?:le\s+|la\s+|l'|ce\s+|cette\s+|a\s+)?$/;
    const APRES = /^\s*,?\s*(?:au\s+plus\s+tard|dernier\s+delai|grand\s+max|max(?:imum)?|deadline)\b/;
    const DE = /\b(?:de|du|d')\s*$/;
    const score = (k) => { const before = t.slice(Math.max(0, k.at - 24), k.at), after = t.slice(k.end, k.end + 24), self = t.slice(k.at, k.end);
      if (/\b(?:c'?)?etait\s+(?:prevu\s+)?(?:pour\s+)?(?:le\s+)?$/.test(before)) return -2;
      return (AVANT.test(before) || APRES.test(after) || /^(?:dans|sous|d'ici|avant)\b/.test(self) ? 2 : 0) - (DE.test(before) ? 1 : 0) - (k.d < today ? 2 : 0); };
    keep.sort((a, b) => score(b) - score(a) || a.at - b.at);
    const best = keep[0];
    const iso = best.d.getFullYear() + '-' + String(best.d.getMonth() + 1).padStart(2, '0') + '-' + String(best.d.getDate()).padStart(2, '0');
    return { iso, txt: src.slice(best.at, best.end).trim(), at: best.at, end: best.end };
  }

  /* ---------- le reste de la phrase ---------- */
  /* ce qu'on demande : la liste des éléments de l'appli */
  const QUOI = [
    ["Éléments de langage", /\b(?:elements? de langage|edl|messages? cles?|argumentaires?|wording)\b/],
    ["Rushs", /\b(?:rush(?:e?s)?|images? (?:video|tournees)|extraits? video|captations?)\b/],
    ["Visuels", /\b(?:visuels?|images?|photos?|bannieres?|affiches?|key visuals?|kv|carrousels?|infographies?|logos?|kakemonos?|flyers?)\b/],
    ["Programme", /\b(?:programmes?|deroules?|deroulements?|ordre du jour)\b/],
    ["Contact", /\b(?:contacts?|coordonnees|numeros? de (?:tel|telephone|portable)|adresses? mail|interlocuteurs?|intervenants?)\b/],
    ["Contexte", /\b(?:contexte|brief|briefing|note de cadrage)\b/],
  ];
  /* un chiffre de résultat : « 12 000 vues », « 3 retombées », « 1,2k clics » */
  const UNITE = { vues: /^(?:vues?|impressions?|lectures?|visionnages?|affichages?)$/, clics: /^(?:clics?|clicks?)$/, inscrits: /^(?:inscrits?|inscriptions?|participants?|candidatures?|candidats?)$/, retombees: /^(?:retombees?|articles?|reprises?|parutions?)$/ };
  const NOMBRE = "(\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3}){1,4}(?:,\\d{1,2})?|\\d{1,12}(?:[.,]\\d{1,3})?)\\s*(k|m|mille|millions?)?";
  const nombre = (n, mult, cents) => { let x = Number(n.replace(/[ \u00a0\u202f.](?=\d{3}(?!\d))/g, "").replace(",", ".")); if (/^k|^mille/.test(mult || "")) x *= 1e3; if (/^m/.test(mult || "")) x *= 1e6; return cents ? Math.round(x * 100) / 100 : Math.round(x); };
  /* qui veut décaler, qui se note un rappel, qui répond que c'est fait */
  /* décaler : un verbe (pas « reporting », « reportage », « déplacement », « ça avance ? »), suivi de près par la date */
  const DECALER = /\b(?:on\s+)?(?:decal|report|repouss|deplac|avanc|bascul|decroch)(?:e|es|er|ons|ez|ee|ees|ant)?\b(?!\s*\?)/;
  const RAPPEL = /(?:^|\s)(?:rappelle[-\s]?moi|me rappeler|pense[-\s]bete|note pour moi|a ne pas oublier|rappel\s+pour\s+moi|^\s*rappel\s*:|^\s*rappel\b)\s*:?/;
  /* une vraie demande dans la phrase : alors ce n'est pas « c'est fait » */
  const DEMANDE = /\b(?:tu peux|peux[-\s]tu|pourrais|pourriez|vous pouvez|il me faut|il nous faut|j'ai besoin|on a besoin|besoin d|envoie[sz]?[-\s]moi|merci de|stp|svp|fai[ts][-\s]moi|faites[-\s]moi)\b/;
  const POURINFO = /^\s*(?:@\S+\s+)*(?:pour info|pour information|pi\b|fyi|info\s*:)/;
  const FAIT = /^\s*(?:c'est\s+)?(?:(?:c'est|ca\s+y\s+est|voila|voici|ok|top|bon)\b[\s,!.:-]*)?(?:(?:c'est\s+)?(?:envoyee?s?|faite?s?|deposee?s?|livree?s?|postee?s?|validee?s?|en ligne|dans le (?:sharepoint|dossier))\b|je (?:te |vous )?(?:l'|les |l)?ai (?:envoye|mis|depose|partage|poste)\w*|ci-joint|c'est bon|c'est ok)/;

  /* texte : la phrase ; o : { today, action (ISO), people [{k, nom}], services [{k, nom, court}], items [{id, t}], moi } */
  const lire = (texte, o = {}) => {
    const src = (texte || "").normalize("NFC"), t = plat(src);
    const today = parse(o.today || iso(new Date())), action = parse(o.action || o.today || iso(today));
    const r = { qui: [], tape: undefined, date: null, quoi: null, liens: [], chiffres: [], montant: null, refs: [], cherche: undefined, intention: "", zones: [] };
    /* liens : ce qui suit http, jusqu'à l'espace */
    for (const m of src.matchAll(/https?:\/\/[^\s<>"«»]+/gi)) {
      const url = m[0].replace(/[).,;:!?]+$/, "");
      r.liens.push({ url, sp: /sharepoint\.com|onedrive|1drv\.ms|office\.com/i.test(url), at: m.index, end: m.index + url.length });
      r.zones.push({ k: "lien", at: m.index, end: m.index + url.length });
    }
    const dansLien = (i) => r.liens.some((l) => i >= l.at && i < l.end);
    /* @personne ou @service : le nom le plus long qui colle (pas un @ dans un lien : tiktok.com/@louise) */
    const cands = [...(o.people || []).map((p) => ({ k: p.k, nom: p.nom })), ...(o.services || []).flatMap((s) => [{ k: s.k, nom: s.court || s.nom }, { k: s.k, nom: s.nom }])]
      .map((c) => ({ ...c, n: plat(c.nom) })).filter((c) => c.n).sort((a, b) => b.n.length - a.n.length);
    for (const m of t.matchAll(/@/g)) {
      if (dansLien(m.index)) continue;
      const rest = t.slice(m.index + 1), c = cands.find((x) => rest.startsWith(x.n) && !/[a-z0-9]/.test(rest.charAt(x.n.length)));
      if (c) { if (!r.qui.some((q) => q.k === c.k)) r.qui.push({ k: c.k, nom: c.nom, at: m.index, end: m.index + 1 + c.n.length }); r.zones.push({ k: "qui", at: m.index, end: m.index + 1 + c.n.length }); }
    }
    const fin = t.match(/@([^\s@#]*)$/); if (fin && !dansLien(fin.index) && !r.zones.some((z) => z.k === "qui" && z.end === t.length)) r.tape = fin[1];
    /* #une autre action : son titre en entier */
    const items = (o.items || []).map((i) => ({ id: i.id, t: i.t, n: plat(i.t || "") })).filter((i) => i.n.length > 2).sort((a, b) => b.n.length - a.n.length);
    for (const m of t.matchAll(/#/g)) {
      if (dansLien(m.index)) continue;
      const rest = t.slice(m.index + 1), it = items.find((x) => rest.startsWith(x.n) && !/[a-z0-9]/.test(rest.charAt(x.n.length)));
      if (it) { r.refs.push({ id: it.id, t: it.t, at: m.index, end: m.index + 1 + it.n.length }); r.zones.push({ k: "ref", at: m.index, end: m.index + 1 + it.n.length }); }
    }
    const fin2 = t.match(/#([^#@]{0,40})$/); if (fin2 && !dansLien(fin2.index) && !r.refs.some((x) => x.at === t.lastIndexOf("#"))) r.cherche = fin2[1];
    const hors = (a, b) => !r.zones.some((z) => a < z.end && z.at < b);   /* pas dans un lien, un @ ou un # */
    /* la date : pas dans un lien ni un titre d'action */
    const masque = r.zones.reduce((s, z) => s.slice(0, z.at) + " ".repeat(z.end - z.at) + s.slice(z.end), src);
    const d = trouveDate(masque, today, action);
    /* le montant, avant les chiffres : « 1 500 € » */
    for (const m of t.matchAll(new RegExp(NOMBRE + "\\s*(?:€|euros?\\b|eur\\b)", "g"))) if (hors(m.index, m.index + m[0].length) && !r.montant) { r.montant = { n: nombre(m[1], m[2], true), at: m.index, end: m.index + m[0].length }; }
    for (const m of t.matchAll(new RegExp("(?:€\\s*)" + NOMBRE, "g"))) if (hors(m.index, m.index + m[0].length) && !r.montant) r.montant = { n: nombre(m[1], m[2], true), at: m.index, end: m.index + m[0].length };
    if (r.montant) r.zones.push({ k: "montant", at: r.montant.at, end: r.montant.end });
    for (const m of t.matchAll(new RegExp("\\b" + NOMBRE + "\\s+(?:de\\s+|d')?([a-z]+)", "g"))) {
      const u = Object.keys(UNITE).find((k) => UNITE[k].test(m[3])); if (!u || !hors(m.index, m.index + m[0].length)) continue;
      r.chiffres.push({ n: nombre(m[1], m[2]), unite: u, at: m.index, end: m.index + m[0].length }); r.zones.push({ k: "chiffre", at: m.index, end: m.index + m[0].length });
    }
    if (d && hors(d.at, d.end)) { r.date = d; r.zones.push({ k: "date", at: d.at, end: d.end }); }
    /* l'élément demandé : le premier cité */
    let q = null; for (const [nom, re] of QUOI) { const m = t.match(re); if (m && hors(m.index, m.index + m[0].length) && (!q || m.index < q.at)) q = { nom, at: m.index, end: m.index + m[0].length }; }
    if (q) { r.quoi = q; r.zones.push({ k: "quoi", at: q.at, end: q.end }); }
    /* l'intention */
    const tm = plat(masque), dec = tm.match(DECALER), rap = !r.qui.length && t.match(RAPPEL), info = r.qui.length && POURINFO.test(t);
    if (rap) { r.intention = "rappel"; r.zones.push({ k: "rappel", at: rap.index + (rap[0].length - rap[0].trimStart().length), end: rap.index + rap[0].length }); }
    else if (info) { r.intention = "info"; if (r.date) { r.zones = r.zones.filter((z) => z.k !== "date"); r.date = null; } }
    else if (dec && r.date && dec.index + dec[0].length <= r.date.at && r.date.at - (dec.index + dec[0].length) <= 25) { r.intention = "decaler"; r.decaler = { at: dec.index, end: dec.index + dec[0].length }; }
    else if (!DEMANDE.test(t) && (FAIT.test(t.replace(/@\S+\s*/g, "")) || (r.liens.length && !r.date && /\b(?:voila|voici|ci-joint|le lien|les liens|tout est)\b/.test(t)))) r.intention = "fait";
    else if (r.qui.length) r.intention = r.date ? "demande" : "info";
    r.zones.sort((a, b) => a.at - b.at || b.end - a.end);
    return r;
  };

  /* la phrase sans les @, sans le « rappelle-moi », pour l'afficher ou la garder */
  const propre = (texte, r, { sansDate = false } = {}) => {
    const src = (texte || "").normalize("NFC");
    const cuts = r.zones.filter((z) => z.k === "qui" || z.k === "rappel" || (sansDate && z.k === "date"));
    let s = ""; let pos = 0;
    for (const z of [...cuts].sort((a, b) => a.at - b.at)) { if (z.at < pos) continue; s += src.slice(pos, z.at); pos = z.end; }
    s += src.slice(pos);
    s = s.replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").replace(/^[\s,;:-]+/, "").replace(/^(?:de |d')(?=\S)/i, "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  };

  /* en morceaux, pour surligner la phrase pendant qu'on l'écrit */
  const morceaux = (texte, r) => {
    const src = (texte || "").normalize("NFC"), out = []; let pos = 0;
    for (const z of r.zones) { if (z.at < pos) continue; if (z.at > pos) out.push({ t: src.slice(pos, z.at) }); out.push({ t: src.slice(z.at, z.end), k: z.k }); pos = z.end; }
    if (pos < src.length) out.push({ t: src.slice(pos) });
    return out;
  };

  KP.phrase = { lire, propre, morceaux, date: (texte, today, action) => trouveDate(texte, parse(today), parse(action || today)), plat };
  if (typeof module !== "undefined") module.exports = KP.phrase;
})();
