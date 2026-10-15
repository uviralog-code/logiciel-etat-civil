-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 01 : FONDATIONS
-- ---------------------------------------------------------------------
-- Ce fichier prépare le terrain pour toutes les tables qui suivront :
--   1. les extensions PostgreSQL nécessaires ;
--   2. les listes de valeurs fixes (types énumérés) ;
--   3. les fonctions utilitaires communes.
-- Il ne crée encore aucune table de données.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------
-- pgcrypto : génère des identifiants techniques uniques (UUID).
-- unaccent : enlève les accents ("Hélène" -> "Helene") pour la recherche.
-- pg_trgm  : recherche tolérante aux fautes de frappe ("Mugisho" ~ "Mugiso").
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;


-- ---------------------------------------------------------------------
-- 2. LISTES DE VALEURS FIXES
-- ---------------------------------------------------------------------
-- Une liste fixe empêche de saisir une valeur inventée ou mal orthographiée :
-- la base refuse tout ce qui n'est pas dans la liste.

-- Nature de l'entité administrative
create type public.type_entite as enum (
  'commune',
  'chefferie'
);

-- Rôle d'un utilisateur dans le logiciel
create type public.role_utilisateur as enum (
  'admin',      -- administrateur principal (CDJP), voit les 4 entités
  'officier',   -- officier d'état civil : enregistre et archive les actes
  'caissier'    -- caissier : encaisse, émet les reçus, clôture la caisse
);

-- Famille d'un type d'acte (sert à regrouper dans les rapports)
create type public.famille_acte as enum (
  'acte_etat_civil',  -- acte de naissance, de mariage, de décès, notoriété…
  'attestation',      -- attestations diverses
  'certificat',       -- certificat de vie, de bonne conduite…
  'autorisation',     -- autorisations, permis
  'extrait'           -- extraits d'actes
);

-- Catégorie tarifaire du demandeur
create type public.categorie_tarif as enum (
  'national',
  'etranger'
);

-- Monnaies acceptées
create type public.devise as enum (
  'USD',   -- dollar américain
  'CDF'    -- franc congolais (FC)
);

-- Cycle de vie d'un acte
create type public.statut_acte as enum (
  'enregistre',            -- fiche en cours de saisie par l'Officier
  'en_attente_paiement',   -- transmis au Caissier
  'paye',                  -- reçu émis
  'exonere',               -- gratuit, exonération accordée avec motif
  'delivre',               -- remis au citoyen
  'annule'                 -- annulé avec motif (jamais effacé)
);

-- Modes de paiement (espèces seulement pour l'instant ;
-- la liste pourra être complétée plus tard sans casser l'existant)
create type public.mode_paiement as enum (
  'especes'
);

-- Manière dont un document est entré dans les archives
create type public.mode_import as enum (
  'scanner',   -- scanner connecté à l'ordinateur
  'fichier',   -- fichier importé depuis l'ordinateur
  'photo',     -- photo prise avec un téléphone
  'lot'        -- import en lot des anciens registres
);


-- ---------------------------------------------------------------------
-- 3. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------

-- 3.1 Normaliser un texte pour la recherche :
--     minuscules, sans accents, espaces multiples réduits.
--     Exemple : "  MUGISHO  Bahati Hélène " -> "mugisho bahati helene"
create or replace function public.normaliser_texte(texte text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texte, ''))),
        '\s+', ' ', 'g'
      )
    ),
    ''
  )
$$;

comment on function public.normaliser_texte(text) is
  'Met un texte en minuscules, sans accents ni espaces superflus, pour la recherche par nom.';


-- 3.2 Mettre à jour automatiquement la date de modification d'une ligne.
--     Sera branchée sur chaque table qui possède une colonne "modifie_le".
create or replace function public.maj_date_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

comment on function public.maj_date_modification() is
  'Déclencheur : renseigne la colonne modifie_le à chaque modification.';
