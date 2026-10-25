#!/bin/sh
# Base neuve kplan_besoins : migrations 0001 à 0004, puis test/db/besoins.sql (rappels avec date simulée, demandes d'éléments, deadlines).
# Usage : PSQL="psql -h /tmp/kp2-besoins -p 54343 -U postgres" sh test/db/besoins.sh
set -e
cd "$(dirname "$0")/../.."
P="${PSQL:-psql} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_besoins" -c "create database kplan_besoins"
D="$P -d kplan_besoins"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f supabase/migrations/0001_schema.sql
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/migrations/0002_planification.sql | $D -f - > /dev/null
$D -f supabase/migrations/0003_historique.sql
$D -f supabase/migrations/0004_corrections.sql
$D -f test/db/besoins.sql 2>&1 | grep -E "^(NOTICE|psql|ERROR)" | sed 's/^NOTICE:  //; s/^psql:[^ ]* NOTICE:  //'
echo "Besoins : script terminé"
