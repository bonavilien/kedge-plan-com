#!/bin/sh
# Installe toute la base (supabase/installation.sql) sur une base Postgres locale neuve, puis vérifie 0040 (2.11, la fiche ouverte sans compte).
# Usage : PSQL="psql -h /tmp/kplan-pg -p 54329 -U postgres" sh test/db/fiche-publique.sh
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_publique" -c "create database kplan_publique"
D="$P -d kplan_publique"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
out=$($D -f test/db/fiche-publique.sql 2>&1 || true)
echo "$out" | grep -E "ÉCHEC|ATTENDU|ERROR|fiche sans compte : bon"
! echo "$out" | grep -qE "ÉCHEC|ATTENDU|ERROR"
# le fichier à coller par Julien passe aussi, deux fois de suite, sur une base qui l'a déjà
F=/mnt/project-files/sql/2.11_0040_fiche_publique.sql
if [ -f "$F" ]; then $D -f "$F" > /dev/null 2>&1; $D -f "$F" > /dev/null 2>&1; fi
