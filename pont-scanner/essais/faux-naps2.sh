#!/bin/sh
# Faux NAPS2.Console pour les essais (Linux) : mêmes options que le vrai.
#   FAUX_NAPS2_SCANNERS : noms des scanners, séparés par « ; » (défaut : un scanner HP)
#   FAUX_NAPS2_PDF      : PDF à « scanner »
#   FAUX_NAPS2_ECHEC    : message d'erreur à afficher (sans créer de fichier)
#   FAUX_NAPS2_ARGS     : fichier où noter les options reçues
[ -n "$FAUX_NAPS2_ARGS" ] && echo "$*" >> "$FAUX_NAPS2_ARGS"
sortie=""
while [ $# -gt 0 ]; do
  case "$1" in
    --listdevices) echo "${FAUX_NAPS2_SCANNERS-HP LaserJet MFP M28w (WIA)}" | tr ';' '\n'; exit 0 ;;
    --output) sortie="$2"; shift ;;
  esac
  shift
done
if [ -n "$FAUX_NAPS2_ECHEC" ]; then echo "Starting scan..."; echo "$FAUX_NAPS2_ECHEC"; exit 0; fi
sleep "${FAUX_NAPS2_DUREE:-0}"
cp "$FAUX_NAPS2_PDF" "$sortie"
