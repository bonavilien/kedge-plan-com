#!/bin/sh
# Rejoue l'installation d'une nouvelle copie sur une base Postgres locale toute neuve :
# supabase/installation.sql d'un coup, puis 0027 (premier compte = pilote), puis un second collage refusé.
# Usage : sh test/maj/installation.sh   (Postgres local : voir PSQL)
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_neuve" -c "create database kplan_neuve"
D="$P -d kplan_neuve"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
# pg_cron et pg_net n'existent pas en local : remplacés par planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
n=$($D -Atc "select count(*) from kplan_private.migrations")
m=$(ls supabase/migrations/*.sql | wc -l)
[ "$n" = "$m" ] || { echo "migrations notées : $n sur $m"; exit 1; }
$D -Atc "select 'périodes ' || (select count(*) from public.periods) || ', messages ' || (select count(*) from public.messages) || ', services ' || (select count(*) from public.services) || ', comptes ' || (select count(*) from public.profiles)"
$D -f test/db/premier-pilote.sql 2>&1 | grep -q "premier pilote : bon"
$D -f test/db/messages-libres.sql 2>&1 | grep -q "messages libres : bon" || { $D -f test/db/messages-libres.sql; exit 1; }
if grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null 2>/tmp/kplan-second.log; then echo "un second collage aurait dû être refusé"; exit 1; fi
grep -q "déjà installée" /tmp/kplan-second.log
echo "Installation d'une copie : tout est bon ($n scripts, premier compte pilote, second collage refusé)"
