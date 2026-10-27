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
$D -f supabase/migrations/0009_direction_programme.sql
$D -f test/db/programme.sql
$D -f supabase/migrations/0010_plusieurs_jours.sql
$D -f test/db/plusieurs.sql
$D -f supabase/migrations/0011_classements.sql
$D -f test/db/classements.sql
$D -f supabase/migrations/0012_corrections_26_oct.sql
$D -f test/db/corrections26.sql
$D -f supabase/migrations/0013_demande_a_soi.sql
$D -f test/db/moi.sql
$D -f supabase/migrations/0014_demande_a_un_chef.sql
$D -f test/db/chefs.sql
$D -f supabase/migrations/0015_sujet_a_trancher.sql
$D -f test/db/trancher.sql
$D -f supabase/migrations/0016_notifications.sql
$D -f test/db/notifications.sql
echo "Base : tout est bon"
