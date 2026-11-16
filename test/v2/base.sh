#!/bin/sh
# Répète la bascule sur une base locale : la V1 (0001 à 0018), des données saisies à la façon de la V1,
# puis les migrations de la V2 par-dessus, et enfin test/db/v2.sql. Usage : sh test/v2/base.sh  (Postgres local : voir PSQL)
set -e
cd "$(dirname "$0")/../.."
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_ui" -c "create database kplan_ui"
D="$P -d kplan_ui"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f supabase/migrations/0001_schema.sql
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/migrations/0002_planification.sql | $D -f - > /dev/null
for f in supabase/migrations/*.sql; do case $f in *0001_*|*0002_*|*0019_*|*002[0-9]_*) ;; *) $D -f $f 2>/dev/null ;; esac; done
$D -f test/v2/donnees-v1.sql
for f in supabase/migrations/0019_*.sql supabase/migrations/002[0-9]_*.sql; do $D -f $f; done
$D -f test/db/v2.sql > /dev/null
$D -Atc "select 'fiches : ' || count(*) || ', dont Recrutement : ' || count(*) filter (where 'REC' = any (m)) || ', Incontournable restant : ' || count(*) filter (where 'INC' = any (m)) from public.items"
echo "Bascule répétée sur la base locale : tout est bon"
