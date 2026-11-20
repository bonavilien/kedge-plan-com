#!/bin/sh
# Installe toute la base (supabase/installation.sql) sur une base Postgres locale neuve, puis vérifie 0031.
# Usage : PSQL="psql -h /tmp/kplan-pg -p 54329 -U postgres" sh test/db/resultats.sh
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_resultats" -c "create database kplan_resultats"
D="$P -d kplan_resultats"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
$D -f test/db/v2-corrections.sql 2>&1 | grep -v "^psql.*NOTICE" | tail -1
$D -f test/db/resultats.sql 2>&1 | grep -E "ÉCHEC|ATTENDU|ERROR|résultats et budget : bon"
