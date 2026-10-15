# Mettre le logiciel d'état civil en ligne — guide pas à pas

Ce guide installe le logiciel sur internet, avec des **données de démonstration**,
pour le présenter (assemblée plénière). Comptez **environ 45 minutes**. Aucune
commande à taper : tout se fait dans le navigateur.

Trois services gratuits travaillent ensemble :

| Service | Rôle |
|---|---|
| **GitHub** | garde le code du logiciel, et installe la base (bouton « Run workflow ») |
| **Supabase** | la base de données, les comptes de connexion, les scans |
| **Vercel** | publie le site (l'adresse que l'on ouvre dans le navigateur) |

> ⚠️ **Les clés et mots de passe ne s'envoient à personne**, ni par message ni par
> WhatsApp. Vous les copiez vous-même d'un site à l'autre, aux endroits indiqués.

---

## Étape 1 — Le projet Supabase (10 min)

1. Sur **supabase.com**, ouvrez votre projet (ou « New project ») :
   - nom : `etat-civil-uvira` ;
   - **Database Password** : choisissez un mot de passe solide et **notez-le** ;
   - région : **Central EU (Frankfurt)**.
2. Attendez que le projet soit prêt (2 minutes environ).
3. Notez quatre informations (vous les collerez à l'étape 3) :
   - **Project Settings › Data API** : l'adresse **Project URL**
     (`https://xxxx.supabase.co`) ;
   - **Project Settings › API Keys** : la clé **anon / public** et la clé
     **service_role** (secrète : bouton « Reveal ») ;
   - bouton **Connect** (en haut) › onglet **Connection string** › choisissez
     **« Session pooler »** : copiez l'adresse qui commence par
     `postgresql://postgres.xxxx:[YOUR-PASSWORD]@…pooler.supabase.com:5432/postgres`
     et **remplacez `[YOUR-PASSWORD]`** par le mot de passe de la base.
     (Ne prenez pas « Direct connection » : elle ne fonctionne pas depuis GitHub.)
4. **Authentication › Sign In / Providers › Email** : vérifiez que
   « Allow new users to sign up » est **désactivé** (les comptes sont créés par
   l'administrateur dans le logiciel, personne ne s'inscrit seul).

## Étape 2 — Le dépôt GitHub (déjà fait)

Le code est déposé dans votre dépôt privé `logiciel-etat-civil`.

## Étape 3 — Les secrets dans GitHub (10 min)

Dans le dépôt GitHub : **Settings › Secrets and variables › Actions ›
New repository secret**. Créez ces 6 secrets (nom exact à gauche) :

| Nom du secret | Valeur |
|---|---|
| `SUPABASE_URL` | la « Project URL » (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | la clé **anon / public** |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé **service_role** (secrète) |
| `SUPABASE_DB_URL` | l'adresse « Session pooler » **avec le mot de passe** |
| `MOT_DE_PASSE_PROVISOIRE_ADMIN` | un mot de passe provisoire pour votre compte administrateur (10 caractères au moins) |
| `MOT_DE_PASSE_DEMO` | le mot de passe commun des 8 comptes de démonstration (10 caractères au moins) |

## Étape 4 — Installer la base (5 min)

Dans le dépôt GitHub : onglet **Actions** › **Installation** (à gauche) ›
bouton **Run workflow**. Lancez, **l'une après l'autre** (attendre la coche
verte ✓ avant la suivante) :

1. **« 1 - Installer ou mettre à jour la base »** ;
2. **« 2 - Créer le premier administrateur »** (votre nom d'utilisateur
   `cdjp.admin` et votre nom complet sont déjà proposés) ;
3. **« 3 - Charger les données de démonstration »** — de préférence **la veille
   ou le matin de l'assemblée** : la démonstration contient les deux semaines
   précédentes et une journée « aujourd'hui » en cours.

Si une croix rouge ✗ apparaît : cliquez dessus, puis sur l'étape en rouge, et
envoyez une **capture d'écran** du message (il ne contient aucun secret).

## Étape 5 — Le site sur Vercel (10 min)

1. Sur **vercel.com** : **Add New… › Project** › importez le dépôt
   `logiciel-etat-civil`.
2. **Root Directory** : cliquez « Edit » et choisissez **`application`**.
3. **Environment Variables** : ajoutez ces 4 variables :

   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la « Project URL » |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé **anon / public** |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clé **service_role** |
   | `NEXT_PUBLIC_DOMAINE_COMPTES` | `agents.etatcivil-uvira.local` |

4. Cliquez **Deploy** et attendez (3 à 5 minutes). Vercel donne l'adresse du
   site, par exemple `https://logiciel-etat-civil.vercel.app`.
5. Ajoutez une 5ᵉ variable **`ADRESSE_PUBLIQUE`** = cette adresse (sans « / »
   à la fin), puis **Deployments › … › Redeploy** : le QR code des reçus
   mènera à la bonne adresse.

## Étape 6 — Premiers pas (5 min)

1. Ouvrez l'adresse du site, connectez-vous avec **`cdjp.admin`** et le mot de
   passe provisoire de l'étape 3.
2. Choisissez votre mot de passe personnel.
3. Reliez votre téléphone : installez **Google Authenticator** (ou Microsoft
   Authenticator), scannez le QR code affiché, tapez le code à 6 chiffres.
4. Vous arrivez sur le **tableau de bord des 4 entités**.

**Comptes de démonstration** (mot de passe : celui de `MOT_DE_PASSE_DEMO`) :

| Entité | Officier | Caissier |
|---|---|---|
| Commune de Mulongwe | `mulongwe.officier` | `mulongwe.caissier` |
| Commune de Kavimvira | `kavimvira.officier` | `kavimvira.caissier` |
| Commune de Kalundu | `kalundu.officier` | `kalundu.caissier` |
| Chefferie des Bavira | `bavira.officier` | `bavira.caissier` |

## Après l'assemblée

Les données de démonstration sont **fictives**. Pour le vrai démarrage, on crée un
**nouveau projet Supabase** vide (étapes 1, 3 et 4 sans l'action 3), et l'on
change les clés dans Vercel. Le compte gratuit de Vercel (« Hobby ») est prévu
pour un usage non commercial ; pour l'exploitation réelle, la formule « Pro » ou
un autre hébergement pourra être étudié.
