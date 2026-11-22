#!/bin/sh
# Installe toute la base (supabase/installation.sql) sur une base Postgres locale neuve, puis vérifie 0032 (2.6.1).
# Usage : PSQL="psql -h /tmp/kplan-pg -p 54329 -U postgres" sh test/db/une-phrase.sh
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_261" -c "create database kplan_261"
D="$P -d kplan_261"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
$D -f test/db/v2-corrections.sql 2>&1 | grep -v "^psql.*NOTICE" | tail -1
out=$($D -f test/db/correctifs-261.sql 2>&1 || true)
echo "$out" | grep -E "ÉCHEC|ATTENDU|ERROR|corrections 2.6.1 : bon"
! echo "$out" | grep -qE "ÉCHEC|ATTENDU|ERROR"
