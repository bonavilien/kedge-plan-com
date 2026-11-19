#!/bin/sh
# Vérifie scripts/config-copie.mjs (réglages d'une copie écrits à la publication), sans réseau.
# Usage : sh test/maj/config-copie.sh
set -e
cd "$(dirname "$0")/../.."
T=$(mktemp -d); cp -r site "$T/site"; S="$T/site"; cp site/config.js "$T/orig.js"
# 1. dépôt d'origine, sans variables : config.js intact
GITHUB_REPOSITORY=bonavilien/kedge-plan-com KPLAN_ORIGINE=bonavilien/kedge-plan-com node scripts/config-copie.mjs "$S" > /dev/null
cmp -s "$S/config.js" "$T/orig.js" || { echo "l'origine ne doit pas être touchée"; exit 1; }
# 2. une copie sans variables : la publication s'arrête et dit quoi faire
if GITHUB_REPOSITORY=ville/plan KPLAN_ORIGINE=bonavilien/kedge-plan-com node scripts/config-copie.mjs "$S" > "$T/out" 2>&1; then echo "une copie non réglée doit échouer"; exit 1; fi
grep -q "KPLAN_SUPABASE_URL" "$T/out"
# 3. la clé secrète est refusée
if KPLAN_SUPABASE_URL=https://abcd.supabase.co KPLAN_SUPABASE_KEY=sb_secret_xyz node scripts/config-copie.mjs "$S" > "$T/out" 2>&1; then echo "la clé secrète doit être refusée"; exit 1; fi
grep -q "SECRÈTE" "$T/out"
# 4. une copie réglée
KPLAN_SUPABASE_URL=https://abcd.supabase.co/ KPLAN_SUPABASE_KEY=sb_publishable_abc KPLAN_NOM="Ville de Test" GITHUB_REPOSITORY=ville/plan KPLAN_ORIGINE=bonavilien/kedge-plan-com node scripts/config-copie.mjs "$S" > /dev/null
node -e '
const fs = require("fs"), d = process.argv[1], w = {}; new Function("window", fs.readFileSync(d + "/config.js", "utf8"))(w);
const c = w.KPLAN_CONFIG, m = JSON.parse(fs.readFileSync(d + "/manifest.webmanifest", "utf8")), ix = fs.readFileSync(d + "/index.html", "utf8");
const ok = c.brancher && c.copie && c.supabaseUrl === "https://abcd.supabase.co" && c.supabaseKey === "sb_publishable_abc" && c.marque.nom === "Ville de Test" && c.marque.logo === "assets/road-to-7th.png" && c.marque.carre && c.marque.symbole === "assets/road-to-7th-symbole.png" && m.name === "Plan de com Ville de Test" && ix.includes("<title>Plan de com Ville de Test</title>");
if (!ok) { console.error(c, m.name); process.exit(1); }' "$S"
rm -rf "$T"
echo "Réglages d'une copie à la publication : tout est bon"
