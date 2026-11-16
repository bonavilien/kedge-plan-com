// Sort une version : lit site/js/version.js (la source), écrit version.json, le cache de sw.js et CHANGELOG.md.
// Usage : node scripts/version.mjs          puis   git commit, git tag v<numéro>
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const win = {}; new Function("window", readFileSync(root + "site/js/version.js", "utf8"))(win);
const list = win.KP.VERSIONS, cur = list[0];
const sem = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;
for (const v of list) { if (!sem.test(v.n)) throw new Error("Numéro invalide : " + v.n); if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw new Error("Date invalide : " + v.n); if (!v.notes.length) throw new Error("Aucune note : " + v.n); }
if (new Set(list.map((v) => v.n)).size !== list.length) throw new Error("Un numéro est en double");
writeFileSync(root + "site/version.json", JSON.stringify({ version: cur.n, date: cur.date }) + "\n");
const sw = readFileSync(root + "site/sw.js", "utf8").replace(/const VERSION = "[^"]*";/, `const VERSION = "${cur.n}";`);
writeFileSync(root + "site/sw.js", sw);
writeFileSync(root + "CHANGELOG.md", "# Nouveautés\n\nGénéré depuis `site/js/version.js` par `node scripts/version.mjs`. Ne pas modifier à la main.\n\n" +
  list.map((v) => `## ${win.KP.versionLabel(v.n)} · ${v.date}\n\n` + v.notes.map((x) => `- ${x}`).join("\n")).join("\n\n") + "\n");
console.log("Version " + cur.n + " : version.json, sw.js et CHANGELOG.md à jour. Étiquette git : v" + cur.n);
