#!/bin/sh
# Installe toute la base (supabase/installation.sql) sur une base Postgres locale neuve, puis vérifie 0034 (2.7, la photo de profil).
# Usage : PSQL="psql -h /tmp/kplan-pg -p 54329 -U postgres" sh test/db/photo.sh
set -e
cd "$(dirname "$0")/../.."
node scripts/installation.mjs --verifier
P="${PSQL:-psql -h /tmp/kplan-pg -p 54329 -U postgres} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists kplan_photo" -c "create database kplan_photo"
D="$P -d kplan_photo"
$D -f test/db/supabase-stub.sql 2>/dev/null
$D -f test/db/planif-stub.sql
grep -v "^create extension" supabase/installation.sql | $D -f - > /dev/null
$D -f test/db/photo.sql 2>&1 | grep -E "ÉCHEC|ATTENDU|ERROR|photo de profil : bon"
# le fichier à coller par Julien passe aussi, deux fois de suite, sur une base qui a déjà la colonne
$D -f /mnt/project-files/sql/2.7_0034_photo.sql > /dev/null 2>&1 || [ ! -f /mnt/project-files/sql/2.7_0034_photo.sql ]
