# Installer le scanner du bureau — guide pas à pas

Ce guide est à suivre **une fois sur chaque ordinateur d'Officier** (Mulongwe, Kavimvira,
Kalundu, chefferie des Bavira). Comptez 20 minutes par ordinateur.

Une fois installé, le logiciel d'état civil peut commander le scanner : dans l'écran
« Scan de l'acte », la carte **Scanner** affiche par exemple « HP LaserJet MFP M28w (WIA) · prêt »,
et le bouton **Scanner la page** fait le reste.

---

## Ce qu'il faut

- Un ordinateur sous **Windows 10 ou 11** (64 bits), avec **Chrome** ou **Edge**.
- Le **scanner branché et allumé**, avec son pilote installé : dans Windows, l'application
  « Télécopie et numérisation Windows » doit voir le scanner.
- Le droit d'installer un logiciel, pour NAPS2 (étape 1). Le pont, lui, n'a pas besoin de ce droit.
- Le fichier **EtatCivilScanner.exe**, qui se trouve dans le dossier `pont-scanner/dist` du zip du logiciel.
- L'**adresse du logiciel d'état civil**, par exemple `https://etatcivil-uvira.exemple.cd`.
  Elle vous est donnée par la CDJP. Dans ce guide, elle est écrite `ADRESSE-DU-LOGICIEL`.

---

## Étape 1 — Installer NAPS2 (le logiciel de scan)

NAPS2 est un logiciel de scan **gratuit et libre**, qui fonctionne avec presque tous les scanners.

1. Sur l'ordinateur, ouvrez le site officiel **https://www.naps2.com** et cliquez sur **Download**.
2. Choisissez la version **Windows** (installeur `.exe`), version 8.
3. Lancez l'installeur et acceptez les choix proposés (« Suivant », puis « Installer »).
4. **Vérification** : ouvrez NAPS2, cliquez sur **Scan**, choisissez votre scanner (pilote **WIA**)
   et scannez une page d'essai. Si la page s'affiche, NAPS2 fonctionne : fermez NAPS2.

## Étape 2 — Copier le pont sur l'ordinateur

1. Copiez **EtatCivilScanner.exe** dans le dossier **Téléchargements** de l'ordinateur
   (avec une clé USB, par exemple).
2. Ce contrôle est facultatif mais recommandé. Il vérifie que le fichier n'a pas été modifié en route.
   Ouvrez **PowerShell** et tapez :

   ```
   Get-FileHash "$env:USERPROFILE\Downloads\EtatCivilScanner.exe"
   ```

   Le résultat doit être :
   `68810EAC7DB5C055C0E93949B8E26D6BB7C5FA2C5AD4022732B2A7BC1AD6EA0A`

## Étape 3 — Installer le pont

1. Appuyez sur les touches **Windows + R**. Une petite fenêtre « Exécuter » s'ouvre.
2. Tapez la ligne suivante, en remplaçant `ADRESSE-DU-LOGICIEL` par la vraie adresse, puis appuyez sur **Entrée** :

   ```
   "%USERPROFILE%\Downloads\EtatCivilScanner.exe" --installer --origine https://ADRESSE-DU-LOGICIEL
   ```

3. Windows peut afficher **« Windows a protégé votre ordinateur »**. C'est normal pour un
   petit programme qui n'est pas vendu dans le commerce. Cliquez sur **Informations complémentaires**,
   puis sur **Exécuter quand même**.
4. Le message **« Pont scanner installé »** apparaît. Il indique le dossier surveillé et dit si NAPS2 a été trouvé.

L'installation fait ceci :
- elle crée le dossier `C:\EtatCivil`, qui contient le programme, ses réglages et son journal ;
- elle crée le dossier surveillé `C:\EtatCivil\Scans` ;
- elle **démarre le pont automatiquement avec Windows**, sans fenêtre ni icône. Il est invisible, c'est normal.

## Étape 4 — Vérifier

1. Dans Chrome ou Edge, ouvrez l'adresse **http://127.0.0.1:47820**.
   La page doit afficher « **Pont scanner de l'état civil : en marche** », le nom du scanner et « prêt ».
2. Connectez-vous au logiciel d'état civil avec le compte de l'Officier. Ouvrez **Scanner** dans le menu,
   puis un acte à scanner. La carte **Scanner** doit afficher « *nom du scanner* · prêt ».
3. **La première fois**, le navigateur peut demander d'**autoriser l'accès aux appareils du réseau local**.
   Répondez **Autoriser** : c'est ainsi que la page parle au pont, sur cet ordinateur seulement.
4. Posez un acte sur la vitre et cliquez sur **Scanner la page**. La page doit apparaître dans l'aperçu.

## Étape 5 (facultative) — Le dossier surveillé

Tout fichier PDF, JPEG ou PNG déposé dans `C:\EtatCivil\Scans` apparaît dans l'écran du scan,
sous « Fichiers du dossier ». Un clic sur **Joindre** suffit. C'est utile pour :
- un scan fait dans la fenêtre de NAPS2 (enregistrez-le dans `C:\EtatCivil\Scans`) ;
- le **bouton du scanner**, si son logiciel peut enregistrer dans ce dossier.

Après l'archivage, les fichiers joints sont **rangés** dans `C:\EtatCivil\Scans\Joints\AAAA-MM`.
Rien n'est jamais effacé.

---

## Régler le pont

Les réglages se trouvent dans `C:\EtatCivil\pont-scanner.json`. Ouvrez ce fichier avec le Bloc-notes.

| Réglage    | Valeur par défaut     | Quand le changer |
|------------|-----------------------|------------------|
| `scanner`  | vide (le premier)     | Plusieurs scanners : mettez une partie du nom, par exemple `"Canon"` |
| `pilote`   | `"wia"`               | Le scanner n'est pas trouvé : essayez `"twain"`, ou `"escl"` pour un scanner réseau |
| `source`   | `"glass"` (vitre)     | `"feeder"` pour le chargeur de feuilles |
| `dpi`      | `200`                 | Décidé pour le logiciel : couleur, 200 ppp |
| `couleur`  | `"color"`             | Décidé pour le logiciel : couleur |
| `dossier`  | `C:\EtatCivil\Scans`  | Autre dossier surveillé |
| `naps2`    | vide (recherché)      | NAPS2 installé ailleurs : chemin de `NAPS2.Console.exe` |
| `origines` | l'adresse donnée à l'étape 3 | Nouvelle adresse du logiciel : relancez l'étape 3 avec la nouvelle adresse |

Après un changement, **redémarrez l'ordinateur**. Ou bien, dans le Gestionnaire des tâches, arrêtez
« EtatCivilScanner », puis lancez `C:\EtatCivil\EtatCivilScanner.exe`.

## Problèmes fréquents

| Ce que l'écran affiche | Que faire |
|---|---|
| « Pont scanner non démarré sur cet ordinateur » | Redémarrez l'ordinateur. Si cela continue, refaites l'étape 3. Vérifiez aussi que l'antivirus n'a pas bloqué `C:\EtatCivil\EtatCivilScanner.exe` : ajoutez-le aux exceptions. |
| « Pont scanner à régler (adresse non autorisée) » | L'écran affiche la commande exacte à lancer (Windows + R). |
| « NAPS2 n'est pas installé sur cet ordinateur. » | Faites l'étape 1, puis redémarrez l'ordinateur. |
| « Aucun scanner trouvé » | Le scanner est-il branché et allumé ? Essayez `"pilote": "twain"`. |
| « Le scan a échoué : … » | Lisez le message : bourrage papier, capot ouvert… Le journal `C:\EtatCivil\pont-scanner.log` donne les détails. |
| Le navigateur bloque l'accès | Autorisez « l'accès aux appareils du réseau local » pour le site du logiciel, dans les paramètres du site (icône à gauche de l'adresse). |

**En cas de panne du scanner**, l'archivage reste possible : choisissez « Photo par téléphone »
ou « Importer un fichier ».

## Sécurité

- Le pont n'écoute **que l'ordinateur lui-même** (127.0.0.1). Il est invisible depuis le réseau.
- Il ne répond **qu'aux pages du logiciel d'état civil**, c'est-à-dire aux adresses données avec `--origine`.
  Un autre site internet ouvert sur le même ordinateur ne peut ni lancer un scan, ni lire le dossier.
- Il ne connaît **aucun mot de passe**, et n'envoie rien sur internet. C'est la page du logiciel
  qui envoie le scan, avec la session de l'Officier.
- Il ne lit que le dossier surveillé, jamais le reste de l'ordinateur.

## Désinstaller

Windows + R, puis :

```
C:\EtatCivil\EtatCivilScanner.exe --desinstaller
```

Redémarrez l'ordinateur, puis supprimez le dossier `C:\EtatCivil` si vous le souhaitez.
