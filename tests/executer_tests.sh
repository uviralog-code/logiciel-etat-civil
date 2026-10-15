#!/usr/bin/env bash
# =====================================================================
# Exécute TOUS les tests dans une base de données neuve.
# ---------------------------------------------------------------------
# 1. supprime puis recrée une base vide "etat_civil_test" ;
# 2. installe la simulation Supabase (tests/00_simulation_supabase.sql) ;
# 3. applique chaque migration dans l'ordre, suivie de son test ;
# 4. s'arrête à la première erreur.
#
# Variables modifiables : PGHOST, PGPORT, PGUSER (par défaut : socket /tmp, 5433, postgres)
# =====================================================================
set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(dirname "$ICI")"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
BASE="etat_civil_test"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -t -A -d "$BASE")

echo "== Base de test neuve =="
dropdb --if-exists "$BASE"
createdb "$BASE"

echo "== Simulation Supabase =="
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$ICI/00_simulation_supabase.sql" >/dev/null

for migration in "$RACINE"/supabase/migrations/*.sql; do
  nom="$(basename "$migration")"
  numero="$(echo "$nom" | sed -E 's/^[0-9]{10}([0-9]{2})00_.*/\1/')"
  echo
  echo "== Migration $nom =="
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$migration"
  echo "   appliquée sans erreur."

  test_fichier="$(ls "$ICI"/"${numero}"_test_*.sql 2>/dev/null | head -n1 || true)"
  if [[ -n "$test_fichier" ]]; then
    echo "== Tests $(basename "$test_fichier") =="
    "${PSQL[@]}" -f "$test_fichier" 2>&1 | sed -E 's/^psql:[^:]+:[0-9]+: (NOTICE|INFO): +//' | grep -v '^$' || exit 1
  else
    echo "   (aucun test associé)"
  fi
done

echo
echo "== TOUS LES TESTS SONT PASSÉS =="
