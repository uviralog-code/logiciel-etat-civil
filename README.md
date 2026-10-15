# Logiciel d'état civil — CDJP/Bukavu

Application de numérisation de l'état civil pour les 4 entités d'Uvira :
communes de **Mulongwe**, **Kavimvira** et **Kalundu**, et **chefferie des Bavira**.

**Étape 2 terminée : la base de données** (Supabase / PostgreSQL), 13 fichiers, 395 vérifications réussies.
**Étape 4 terminée : connexion et gestion des comptes** (fichiers 13 à 22).
**Étape 3 terminée : les maquettes des écrans** (dossier `maquettes/`), 19 écrans : connexion, Officier, Caissier, administrateur.
**Étape 5 terminée : catalogue des actes et grilles tarifaires** (fichiers 23 à 27).
**Étape 6 terminée : enregistrement et archivage des actes** (fichiers 28 à 36) — 592 vérifications SQL,
588 tests de l'application et 132 tests sur le banc d'essai Supabase.
**Étape 7 en cours : la caisse** (fichiers 37 à 42).

## Contenu

```
supabase/migrations/      La base de données, à appliquer dans l'ordre
  20261013000100_fondations.sql               extensions, listes de valeurs, fonctions utiles
  20261013000200_entites_et_utilisateurs.sql  4 entités, comptes, rôles, règle des 7 jours hors-ligne
  20261013000300_catalogue_et_tarifs.sql      catalogue des actes, grille commune, tarifs locaux, taux de change
  20261013000400_actes.sql                    table centrale, ID unique, prix automatique, cycle de vie, fiches
  20261013000500_caisse.sql                   heure d'Uvira, reçus, exonérations, annulations, clôture
  20261013000600_archives_scannees.sql        stockage privé, scans, lots d'import, signalement « sans scan »
  20261013000700_journaux.sql                 journal d'audit et journal des connexions (inaltérables)
  20261013000800_securite.sql                 droits d'accès par rôle et cloisonnement des entités
  20261013000900_recherche.sql                recherche par ID ou par nom, tolérante aux fautes
  20261013001000_rapports.sql                 rapports jour / mois / semestre / année, par entité et consolidés
  20261013001100_donnees_initiales.sql        4 entités, 26 actes, grille tarifaire de Mulongwe (2026)
  20261013001200_ajustements_maquettes.sql    couleurs plus lisibles, motif de renvoi obligatoire
  20261013001300_renommage_comptes_desactives.sql  l'ancien compte libère son nom d'utilisateur
  20261013001400_mot_de_passe_reellement_change.sql  l'obligation de changer le mot de passe
                                              ne se lève que s'il a réellement changé
  20261013001500_double_verification_exigee.sql  sans le code à 6 chiffres, l'administrateur
                                              n'a aucun droit dans la base
  20261013001600_mot_de_passe_provisoire_sans_droits.sql  aucun droit tant que le mot de passe
                                              provisoire n'est pas remplacé
  20261014001700_dates_d_effet_des_tarifs.sql  un nouveau tarif entre en vigueur au plus tôt
                                              le lendemain ; le taux du jour, dès sa saisie
  20261014001800_catalogue_protege.sql        un type d'acte ne se supprime jamais ; code, numéro,
                                              fiche et tarif Étrangers figés ; ajout avec son prix
  20261014001900_enregistrement_des_actes.sql  un acte et sa fiche enregistrés ou corrigés
                                              ensemble ; dates à l'heure d'Uvira
  20261014002000_fiche_d_un_acte.sql          heure de transmission, noms des agents de l'entité,
                                              acte payé : noms seuls corrigeables (motif), annulation
                                              par la caisse uniquement
  20261014002100_archivage_par_fichier.sql    archives en PDF seulement ; dépôt seulement à
                                              l'emplacement prévu ; envoi raté reprenable ;
                                              taille lue dans le fichier ; doublons sans
                                              révéler les actes d'une autre entité
  20261014002200_photos_par_telephone.sql     QR code : lien secret de 10 minutes pour un acte,
                                              sans mot de passe ; le téléphone dépose les pages,
                                              l'ordinateur les reprend (puis elles sont effacées)
  20261014002300_anciens_registres.sql        anciens registres en lot : un type et une année par
                                              lot, actes « délivrés » sans montant, n° du registre
                                              unique (doublon refusé avec l'ID existant), lot fermé
                                              seulement quand tous les scans sont joints
  20261014002400_encaissement.sql             acte « en attente de paiement » figé pour l'Officier
                                              (annulation seule) ; dollars convertis en francs
                                              arrondis à la centaine ; acte en francs payé en francs ;
                                              encaisser_verifie : reçu émis seulement au montant annoncé
  20261015002500_recus_imprimes.sql           reçu : jeton secret du QR code de vérification ;
                                              impressions comptées (original, puis duplicatas),
                                              inscrites au journal ; vérification publique sans
                                              nom de personne (verifier_recu)
  20261015002600_annulation_recus.sql         annulation d'un reçu (motif libre, avant la clôture) :
                                              l'acte est remis dans la file (erreur de caisse) ou
                                              annulé ; un seul reçu VALIDE par acte

application/              L'interface web (Next.js 16, Tailwind CSS 4) — étapes 4 à 6 terminées, étape 7 en cours
  src/lib/charte.ts           couleurs, libellés des statuts, calcul du contraste (testés)
  src/components/             composants partagés (liseré, pastille de statut…)
  src/lib/identifiants.ts     nom d'utilisateur ↔ adresse interne de connexion
  src/lib/supabase/           liaison avec Supabase : client navigateur, client serveur,
                              client administrateur (clé secrète), renouvellement de session
  src/proxy.ts                renouvelle la session à chaque page demandée
  src/lib/connexion.ts        connexion d'un agent : contrôle, journal, page suivante selon le rôle
  src/app/connexion/          écran de connexion (formulaire, messages d'erreur)
  src/components/voyant-reseau.tsx  voyant « En ligne / Hors-ligne »
  src/components/champ-mot-de-passe.tsx  champ de mot de passe avec bouton « Afficher »
  src/components/bouton-deconnexion.tsx  bouton « Se déconnecter »
  src/components/saisie-code.tsx  saisie du code à 6 chiffres (une case par chiffre)
  src/lib/verification.ts     double vérification : mise en place du téléphone, vérification du code
  src/app/verification/       écran « Code de vérification » (et « Reliez votre téléphone »)
  src/lib/aiguillage.ts       règles d'aiguillage : qui va où (connexion, mot de passe, code, espace)
  src/lib/acces.ts            garde de chaque page d'un espace (exigerEspace)
  src/lib/espaces.ts          menus des trois espaces, d'après les maquettes
  src/components/cadre-espace.tsx  cadre des écrans de travail (menu, en-tête)
  src/app/page.tsx            adresse principale : envoie chacun au bon endroit
  src/app/admin/, officier/, caissier/  les trois espaces (accueil provisoire pour l'instant)
  src/app/deconnexion/        ferme la session d'un compte désactivé, avec explication
  src/app/not-found.tsx       page « introuvable », en français
  src/app/error.tsx           écran d'erreur imprévue, en français (« Réessayer »)
  src/lib/comptes.ts          liste des comptes : état, postes à pourvoir, anciens comptes
  src/app/admin/comptes/      écran « Comptes des agents » de l'administrateur
                              (liste, et formulaire « Créer un compte » : actions.ts)
  src/lib/creation-compte.ts  création d'un compte : contrôles, mot de passe provisoire,
                              annulation si la base refuse, nom repris d'un ancien compte
  src/lib/gestion-compte.ts   réinitialisation du mot de passe et désactivation d'un compte
  src/lib/grille-commune.ts   grille commune : écarts des entités, changements programmés,
                              contrôle d'un nouveau tarif, aperçu avant confirmation, annulation
  src/app/admin/grille/       écran « Grille commune » de l'administrateur (tableau, formulaire
                              « Programmer un nouveau tarif commun », changements programmés)
  src/lib/tarifs-entite.ts    tarifs d'une entité : prix appliqués, ajustement ou retour à la
                              grille commune (contrôle, aperçu, enregistrement), annulation
  src/components/tableau-tarifs-entite.tsx  tableau « Grille commune / Tarif appliqué »
  src/app/officier/tarifs/    écran « Tarifs de l'entité » de l'officier (ajuster un tarif)
  src/app/caissier/tarifs/    les mêmes tarifs, en lecture seule, pour le caissier
  src/lib/taux.ts             taux du jour : lecture du chiffre tapé, garde-fou 500 – 20 000 FC,
                              confirmation au-delà de 10 % d'écart, historique, enregistrement
  src/app/caissier/taux/      écran « Taux du jour » du caissier (saisie et historique)
  src/lib/accueil-caissier.ts accueil du caissier : chiffres du jour (même calcul que les rapports),
                              file « À encaisser » (premier transmis, premier servi), derniers reçus,
                              journée ouverte ou clôturée, renvoi à l'Officier (motif courant + précision)
  src/app/caissier/page.tsx   accueil du caissier (maquette « Caissier — Accueil »), remis à jour
                              tout seul toutes les 15 s et au retour sur l'onglet
  src/app/caissier/file-a-encaisser.tsx, bouton-renvoyer.tsx, actualisation.tsx, actions.ts
                              file d'attente, fenêtre « Renvoyer à l'Officier », remise à jour, action serveur
  src/lib/encaissement.ts     encaissement : montant à percevoir (mêmes règles que la base), rendu de
                              monnaie, exonération (motif courant + précision obligatoire), appels à la base
  src/lib/recus.ts            lecture d'un reçu avec son acte
  src/app/caissier/encaisser/ menu « Encaisser » (file d'attente) et écran « Encaissement » d'un acte
                              (maquette) : monnaie, montant, confirmation, exonérer, renvoyer
  src/lib/montant-en-lettres.ts  montant en toutes lettres (« Quatre-vingt-cinq mille cinq cents francs congolais. »)
  src/lib/recus.ts            reçu : lecture, contenu du reçu A5, original / duplicata, vérification publique
  src/lib/recu-pdf.ts         le reçu en PDF A5 (pdf-lib), avec le QR code dessiné, reproductible
  src/lib/origine.ts          adresse publique du logiciel (réglage ADRESSE_PUBLIQUE), pour le QR code
  src/components/recu-a5.tsx  le reçu A5 en page web (aperçu à l'écran et impression)
  src/app/caissier/recus/[id]/  reçu de paiement : aperçu, « Imprimer le reçu (A5) » (lancé tout seul
                              après l'encaissement), « Télécharger le PDF » (route pdf/)
  src/app/verifier/[jeton]/   page publique du QR code : reçu authentique, annulé ou introuvable
  src/lib/recus-du-jour.ts    reçus et exonérations de la journée, totaux, annulation d'un reçu
  src/app/caissier/recus/page.tsx  écran « Reçus du jour » (totaux, reçus, exonérations, « Annuler… »)
  src/app/caissier/bouton-annuler-recu.tsx  fenêtre « Annuler le reçu » (suite de l'acte, motif)
  src/lib/cloture.ts          clôture : aide au comptage (billets), écarts, explication obligatoire,
                              attendus vérifiés au moment de clôturer, actes payés sans scan
  src/app/caissier/cloture/   écran « Clôture de caisse » (maquette) : comptage, confirmation, journée verrouillée
  src/lib/tableau-admin.ts    tableau de bord de l'administrateur : les 4 entités (recettes du jour et du mois,
                              caisse d'hier, écarts, actes payés sans scan, archivage, taux $), points à vérifier
  src/app/admin/page.tsx      tableau de bord (maquette « Admin — Tableau de bord »)
  src/components/bandeau-taux.tsx  rappel du taux sur l'accueil du caissier (bleu ou rouge)
  src/lib/catalogue.ts        catalogue des actes : liste, ajout avec prix, correction,
                              retrait et remise au catalogue
  src/app/admin/catalogue/    écran « Catalogue des actes » de l'administrateur
  src/components/code-acte.tsx  pastille colorée du code d'un acte
  src/lib/actes.ts            actes : champs de chaque fiche, contrôle de la saisie,
                              enregistrement et correction (acte + fiche ensemble), lecture
  src/lib/nouvel-acte.ts      « Nouvel acte » : cartes par famille, filtre, prix et équivalent
                              en francs, ID prévu
  src/app/officier/actes/nouveau/  écrans « Nouvel acte » : choix du type, puis la fiche
  src/app/officier/actes/[id]/enregistre/  confirmation (ID donné par la base, transmission)
  src/components/etapes-saisie.tsx  les 3 étapes de la saisie d'un acte
  src/test/preparation.ts     réglage commun des tests d'écrans
  src/lib/accueil-officier.ts  accueil de l'officier : compteurs, actes à scanner, renvoyés
  src/app/officier/page.tsx   accueil de l'officier (maquette « Officier — Accueil »)
  src/app/officier/actes/[id]/corriger/  correction d'un acte renvoyé par le Caissier
  src/lib/fiche-acte.ts       fiche d'un acte : parcours, informations, gestes permis
  src/app/officier/actes/[id]/  fiche d'un acte (corriger un nom, délivré, annuler)
  src/components/fiche-acte-vue.tsx  présentation d'une fiche (commune aux 3 espaces)
  src/lib/recherche.ts        recherche d'un acte : critères dans l'adresse, ID tapé sans le
                              code de l'entité, limite de 50 résultats
  src/components/recherche-actes.tsx  barre de recherche, filtres (type, année, statut), résultats
  src/components/ecrans-recherche.tsx écran « Rechercher » et fiche en lecture seule
  src/components/lien-retour.tsx      lien « ‹ Résultats de la recherche » (jamais vers un autre site)
  src/app/{officier,caissier,admin}/recherche/  écran « Rechercher » de chaque espace
  src/app/{caissier,admin}/actes/[id]/  fiche d'un acte en lecture seule
  src/lib/archivage.ts        scan : contrôle des fichiers, UN seul PDF reproductible (pdf-lib),
                              empreinte SHA-256, relecture du PDF déposé, vérifications à cocher
  src/lib/envoi-reprenable.ts envoi du PDF par morceaux de 6 Mo, qui reprend après une coupure (tus)
  src/lib/scans.ts            emplacement prévu, doublon avant l'envoi, enregistrement relu par
                              le serveur, versions, lien de consultation de 5 minutes
  src/lib/scan-navigateur.ts  dans le navigateur : compression des photos, aperçu (pdf.js « legacy »)
  src/lib/ouvrir-document.ts  « Voir le document » (Officier, Caissier, administrateur)
  src/app/officier/scanner/   écran « Scanner » : actes payés qui attendent leur scan
  src/app/officier/actes/[id]/scanner/  écran « Scan de l'acte » (maquette « Officier — Scan »)
  src/app/*/actes/[id]/document/  ouverture du PDF d'un acte
  src/components/actes-a-scanner.tsx  liste « À scanner » (accueil et écran « Scanner »)
  src/lib/recadrage.ts        photo d'un acte : 4 coins repérés (OpenCV, méthode de jscanify),
                              redressement et « améliorer la lisibilité » en JavaScript simple,
                              avertissement si la page est floue ou trop sombre
  src/lib/photo-navigateur.ts OpenCV.js chargé à la demande (gardé ensuite par le navigateur)
  src/lib/transfert-photo.ts  transfert téléphone → ordinateur (QR code, envoi, reprise des pages)
  src/components/capture-photo.tsx  prise de vue : appareil photo, coins déplaçables au doigt
  src/app/officier/actes/[id]/scanner/photo-telephone.tsx  « Photo par téléphone » : QR code,
                              pages reçues dans l'aperçu
  src/app/photo/[jeton]/      page du téléphone ouverte par le QR code (sans mot de passe)
  src/lib/pont-scanner.ts     le pont scanner vu du navigateur : état, scan, dossier surveillé
  src/app/officier/actes/[id]/scanner/scanner-bureau.tsx  « Scanner du bureau » : scan, dossier
  src/lib/anciens-registres.ts  anciens registres : lots, ajout d'un ancien acte, n° suivant,
                              n° lu dans le nom du fichier (« 412.jpg »), découpage d'un registre
                              entier en actes, fermeture du lot
  src/app/officier/anciens-registres/  écran « Anciens registres » : liste des lots, ouvrir un lot
  src/app/officier/anciens-registres/[lot]/  import d'un lot (maquette « Officier — Import en lot ») :
                              scanner du bureau, plusieurs fichiers ou registre entier en PDF,
                              case « le document correspond », scans manquants, fermeture
  scripts/copier-opencv.mjs   copie OpenCV.js dans public/vendor/ avant « dev » et « build »
  src/test/fichiers/          photos et PDF d'essai pour les tests du scan et du recadrage
  src/app/admin/comptes/actions-compte.tsx  boutons « Mot de passe… » et « Désactiver »
  src/components/fenetre-modale.tsx  fenêtre de confirmation
  src/components/fiche-remise.tsx    fiche de remise imprimable (mot de passe provisoire)
  src/lib/tarifs.ts           tarifs : bon prix d'un acte (mêmes règles que la base), grille
                              complète avec changements programmés, montants « 18 000 FC »,
                              taux du jour, date du jour à l'heure d'Uvira
  src/lib/aiguillage.ts       règles d'accès : qui entre où, et où envoyer les autres
  src/lib/acces.ts            garde appelée par chaque page d'un espace de travail
  src/lib/espaces.ts          menus des espaces (officier, caissier, administrateur)
  src/components/cadre-espace.tsx  cadre commun des écrans de travail (menu, en-tête)
  src/app/page.tsx            adresse principale : envoie chacun au bon endroit
  src/app/officier/, caissier/, admin/  espaces de travail (accueils provisoires)
  src/app/not-found.tsx       page « introuvable » en français
  src/lib/mot-de-passe.ts     règles et changement du mot de passe provisoire
  src/lib/session.ts          agent connecté, vérifié côté serveur
  src/app/mot-de-passe/       écran « Choisissez votre mot de passe »
  src/test/faux-serveur-auth.ts  serveur d'authentification simplifié (tests rapides)
  src/test/banc.ts, banc-global.ts  raccordement des tests au banc d'essai Supabase
  *.banc.test.ts              tests exécutés contre le banc d'essai (npm run test:banc)
  .env.example                modèle des réglages à fournir (adresse et clés Supabase)

pont-scanner/             EtatCivilScanner.exe : pont entre le scanner du bureau (NAPS2) et l'écran
                          « Scan de l'acte » (Go, fichier 35) — voir pont-scanner/GUIDE-INSTALLATION.md
  dist/EtatCivilScanner.exe   le programme Windows à installer sur chaque ordinateur d'Officier

captures/                 Captures d'écran des tests dans un vrai navigateur

maquettes/                Les 19 maquettes des écrans (planche de design, fichiers .dc.html)
  Main.dc.html, Connexion-Etapes.dc.html      connexion, mot de passe, code de vérification
  Officier-*.dc.html                          accueil, nouvel acte (type, fiche), scan, fiche d'un acte,
                                              import en lot, tarifs de l'entité
  Caissier-*.dc.html                          accueil, encaissement, reçu A5, clôture, rapports
  Admin-*.dc.html                             tableau de bord, comptes, grille commune, journal, rapports

tests/                    Les vérifications (ne sont PAS déployées)
  00_simulation_supabase.sql   reproduit l'environnement Supabase pour tester en local
  01_test_… à 26_test_…        un fichier de tests par migration
  executer_tests.sh            recrée une base vide, applique tout et lance tous les tests
  banc/                        banc d'essai Supabase local (voir plus bas)
```

## Relancer les tests

Prérequis : PostgreSQL 16 avec les extensions `pgcrypto`, `unaccent` et `pg_trgm`.

```bash
# Paramètres de connexion (valeurs par défaut ci-dessous)
export PGHOST=/tmp PGPORT=5433 PGUSER=postgres
bash tests/executer_tests.sh
```

Le script s'arrête à la première erreur. Il se termine par `TOUS LES TESTS SONT PASSÉS`.

## Vérifier l'application

```bash
cd application
npm install
npm run verifier   # types, règles de code, tests, compilation de production
```

### Banc d'essai Supabase local

`tests/banc/banc.mjs` assemble les pièces officielles de Supabase : la base avec toutes
les migrations, le **vrai service de connexion** (Supabase Auth v2.185.0), le **vrai
accès aux données** (PostgREST v12.2.3) et le **vrai stockage des fichiers** (Supabase
Storage v1.70.0, avec l'envoi reprenable « tus »), derrière une passerelle qui présente
tout à la même adresse, comme Supabase. Auth et PostgREST sont téléchargés une seule
fois depuis GitHub ; Storage est construit une seule fois depuis ses sources officielles,
avec Node 24 pris dans le registre npm (dossier `~/.cache/banc-etat-civil`, quelques
minutes la première fois).

```bash
cd application
npm run test:banc   # démarre le banc, lance les tests *.banc.test.ts, puis l'arrête
```

Prérequis : PostgreSQL 16 accessible sur 127.0.0.1, port 5433, utilisateur `postgres`
en accès de confiance (base d'essai uniquement). Pour l'utiliser à la main :
`node tests/banc/banc.mjs` affiche l'adresse et les clés à mettre dans `.env.local`.

Avant de lancer l'application elle-même, copier `.env.example` en `.env.local` et y mettre
l'adresse et les clés du projet Supabase. La clé `SUPABASE_SERVICE_ROLE_KEY` est secrète :
elle ne doit jamais être partagée ni placée dans un réglage commençant par `NEXT_PUBLIC_`.

## Déployer sur Supabase

Avec l'outil en ligne de commande Supabase, depuis ce dossier :

```bash
supabase link --project-ref <identifiant-du-projet>
supabase db push
```

Les comptes utilisateurs (1 admin, 1 officier et 1 caissier par entité) ne sont pas créés par
les migrations : ils le seront par l'administrateur, à l'étape 4.

## Réglages du projet Supabase à la mise en service

Dans le tableau de bord Supabase (Authentication) :
- **Inscriptions libres désactivées** (« Allow new users to sign up » : non) — seul l'administrateur crée les comptes ;
- **Longueur minimale des mots de passe : 10** (comme l'écran de changement de mot de passe) ;
- **Confirmation par e-mail désactivée** (les adresses des agents sont internes) ;
- **Double vérification (TOTP)** activée.

Le banc d'essai applique déjà ces réglages.

Stockage des fichiers (Storage) : rien à régler à la main. L'espace privé « archives »
(PDF seulement, 15 Mo au plus) et ses règles d'accès sont créés par les migrations ;
l'envoi reprenable est actif par défaut sur Supabase.

**Téléphone de l'administrateur perdu ou changé** : dans le tableau de bord Supabase
(Authentication → Users → le compte de l'administrateur), supprimer son facteur « TOTP ».
À la connexion suivante, l'écran guidera la mise en place du nouveau téléphone.

## Décisions à confirmer avant la mise en service

- Date d'entrée en vigueur de la grille tarifaire : fixée au **1er janvier 2026**
  (date partiellement illisible sur la fiche d'origine).
- Garde-fou du taux de change : entre **500 et 20 000 FC** pour 1 $.
- Taille maximale d'un scan : **15 Mo**.
