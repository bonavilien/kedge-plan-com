#!/bin/sh
# Installe toute la base (supabase/installation.sql) sur une base Postgres locale neuve, puis vérifie 0035 (2.8).
# Usage : PSQL="psql -h /tmp/kplan-pg -p 54329 -U postgres" sh test/db/suivi.sh
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_suivi" -c "create database kplan_suivi"
D="$P -d kplan_suivi"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
out=$($D -f test/db/suivi.sql 2>&1 || true)
echo "$out" | grep -E "ÉCHEC|ATTENDU|ERROR|suivi de l.outil : bon"
! echo "$out" | grep -qE "ÉCHEC|ATTENDU|ERROR"
