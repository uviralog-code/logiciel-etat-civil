# Pont scanner — EtatCivilScanner.exe (fichier 35)

Petit programme Windows qui relie le scanner du bureau à l'écran « Scan de l'acte » du
logiciel d'état civil. **Installation : voir [GUIDE-INSTALLATION.md](GUIDE-INSTALLATION.md).**

```
navigateur (page du logiciel) ──http://127.0.0.1:47820──▶ EtatCivilScanner.exe ──▶ NAPS2.Console.exe ──▶ scanner
                                                                 └──▶ C:\EtatCivil\Scans (dossier surveillé)
```

- Écrit en Go, bibliothèque standard seulement : un seul fichier, sans dépendance.
- N'écoute que 127.0.0.1. Vérifie l'hôte (contre le « DNS rebinding ») et l'origine des pages
  (seules les adresses autorisées). Répond aux pré-vérifications des navigateurs pour l'accès
  au réseau local.
- Commande NAPS2 par sa version console (options vérifiées dans les sources de NAPS2 8) :
  `--driver wia --listdevices`, puis
  `--noprofile --driver wia --device "<scanner>" --source glass --dpi 200 --bitdepth color --output <fichier> --force`.
  NAPS2 ne signale pas toujours un échec par son code de sortie : le pont vérifie que le PDF existe.

| Adresse | Rôle |
|---|---|
| `GET /` | page de vérification (« en marche »), à ouvrir à la main |
| `GET /api/etat` | version, NAPS2 trouvé, scanners, scanner choisi, prêt, message |
| `POST /api/scanner` | un scan → le PDF (un seul scan à la fois) |
| `GET /api/dossier` | fichiers récents (7 jours) du dossier surveillé |
| `GET /api/dossier/fichier?nom=` | un fichier du dossier (nom contrôlé : jamais un chemin) |
| `POST /api/dossier/ranger` | après l'archivage : fichiers déplacés dans `Joints\AAAA-MM` |

## Fabriquer et tester

```bash
./construire.sh      # go test, puis dist/EtatCivilScanner.exe (Windows) et dist/etatcivil-scanner-linux (essais)
```

Les tests utilisent un **faux NAPS2** (`essais/faux-naps2.sh`), qui accepte les mêmes options que le vrai.
**Non testé ici** : le vrai NAPS2 avec un vrai scanner, sous Windows. Le premier essai se fera
sur un ordinateur de commune.
