#!/usr/bin/env bash
# =====================================================================
# Installe (ou met à jour) la base de données sur Supabase.
# ---------------------------------------------------------------------
# Applique, dans l'ordre, chaque fichier de supabase/migrations qui ne
# l'a pas encore été. Chaque fichier est appliqué en une seule fois
# (tout ou rien) et noté dans installation.migrations : relancer le
# script ne refait jamais une migration déjà faite.
#
# Variable obligatoire : SUPABASE_DB_URL (Supabase › Connect › « Session
# pooler »). Le mot de passe de la base peut y figurer, ou être donné à
# part dans PGPASSWORD (c'est ce que fait le workflow GitHub).
# =====================================================================
set -euo pipefail
: "${SUPABASE_DB_URL:?Indiquez SUPABASE_DB_URL (adresse « Session pooler » de la base Supabase).}"

ICI="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$(dirname "$ICI")/supabase/migrations"
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A)

# Registre des migrations, dans un schéma que l'API ne publie pas
"${PSQL[@]}" -c "
  create schema if not exists installation;
  create table if not exists installation.migrations (
    nom text primary key,
    appliquee_le timestamptz not null default now()
  );
  revoke all on schema installation from public;" >/dev/null

nouvelles=0
for fichier in "$MIGRATIONS"/*.sql; do
  nom="$(basename "$fichier")"
  deja="$("${PSQL[@]}" -c "select count(*) from installation.migrations where nom = '$nom'")"
  if [[ "$deja" == "1" ]]; then
    echo "déjà installée : $nom"
    continue
  fi
  echo "installation   : $nom"
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -1 -f "$fichier" -c "insert into installation.migrations (nom) values ('$nom')" >/dev/null
  nouvelles=$((nouvelles + 1))
done

echo
echo "Base à jour : $nouvelles migration(s) appliquée(s)."
