#!/bin/sh
# Répète la copie vers une nouvelle base : une « ancienne » base locale à la façon de la V1 avec ses données,
# une « nouvelle » vide, puis scripts/copie.mjs entre les deux. Usage : sh test/v2/copie.sh
set -e
cd "$(dirname "$0")/../.."
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
for b in kplan_anc kplan_nouv; do $P -c "drop database if exists $b" -c "create database $b"; $P -d $b -f test/db/supabase-stub.sql 2>/dev/null; $P -d $b -f test/db/planif-stub.sql; done
D="$P -d kplan_anc"
$D -f supabase/migrations/0001_schema.sql
grep -v "^create extension" supabase/migrations/0002_planification.sql | $D -f - > /dev/null
# la V1 n'a reçu aucune migration de la V2 (0019 et suivantes)
for f in supabase/migrations/*.sql; do case $f in *0001_*|*0002_*|*0019_*|*002[0-9]_*|*003[0-9]_*) ;; *) $D -f $f 2>/dev/null ;; esac; done
$D -f test/v2/donnees-v1.sql
avant=$($D -Atc "select md5(string_agg(x::text, '' order by id)) from public.items x")
SUPABASE_ACCESS_TOKEN=test node --import ./test/v2/copie-shim.mjs scripts/copie.mjs kplan_anc kplan_nouv
SUPABASE_ACCESS_TOKEN=test node --import ./test/v2/copie-shim.mjs scripts/copie.mjs kplan_anc kplan_nouv | head -2
[ "$avant" = "$($D -Atc "select md5(string_agg(x::text, '' order by id)) from public.items x")" ] || { echo "L'ancienne base a changé"; exit 1; }
N="$P -d kplan_nouv -At"
$N -c "select 'nouvelle : ' || (select count(*) from public.items) || ' fiches, ' || (select count(*) from auth.users) || ' comptes, INC restant ' || (select count(*) from public.items where 'INC' = any (m)) || ', statuts ' || (select string_agg(distinct st, ',') from public.items) || ', journal ' || (select count(*) from public.journal)"
$D -Atc "select 'ancienne : ' || (select count(*) from public.items) || ' fiches, journal ' || (select count(*) from public.journal)"
$N -c "insert into public.outbox (user_id, title) select id, 'essai compteur' from public.profiles limit 1" -c "delete from public.outbox where title = 'essai compteur'"
echo "Copie répétée : tout est bon"
