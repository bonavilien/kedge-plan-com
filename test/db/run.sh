#!/bin/sh
# Rejoue les migrations sur une base Postgres locale toute neuve, puis vérifie droits, notifications et envoi.
# Usage : PSQL="psql -h localhost -U postgres" sh test/db/run.sh
set -e
cd "$(dirname "$0")/../.."
P="${PSQL:-psql} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_test" -c "create database kplan_test"
D="$P -d kplan_test"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f supabase/migrations/0001_schema.sql
$D -f test/db/rules.sql
$D -f test/db/planif-stub.sql
# pg_cron et pg_net n'existent pas en local : remplacés par planif-stub.sql
grep -v "^create extension" supabase/migrations/0002_planification.sql | $D -f - > /dev/null
$D -f test/db/planif.sql
$D -f supabase/migrations/0003_historique.sql
$D -f test/db/historique.sql
$D -f supabase/migrations/0004_corrections.sql
$D -f test/db/corrections.sql
$D -f supabase/migrations/0005_visiteur.sql
$D -f test/db/visiteur.sql
$D -f supabase/migrations/0006_reponses.sql
$D -f test/db/reponses.sql
$D -f supabase/migrations/0007_services.sql
$D -f test/db/services.sql
$D -f supabase/migrations/0008_suppression.sql
$D -f test/db/suppression.sql
echo "Base : tout est bon"
