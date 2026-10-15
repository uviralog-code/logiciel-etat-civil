-- =====================================================================
-- TESTS du fichier 01 : FONDATIONS
-- =====================================================================

-- 1. Les trois extensions sont installées
select test.verifier(
  (select count(*) from pg_extension where extname in ('pgcrypto','unaccent','pg_trgm')) = 3,
  'Extensions pgcrypto, unaccent et pg_trgm installées'
);

-- 2. Les huit listes de valeurs existent avec le bon contenu
select test.verifier(
  enum_range(null::public.type_entite)::text = '{commune,chefferie}',
  'Liste type_entite : commune, chefferie'
);
select test.verifier(
  enum_range(null::public.role_utilisateur)::text = '{admin,officier,caissier}',
  'Liste role_utilisateur : admin, officier, caissier'
);
select test.verifier(
  array_length(enum_range(null::public.famille_acte), 1) = 5,
  'Liste famille_acte : 5 familles d''actes'
);
select test.verifier(
  enum_range(null::public.categorie_tarif)::text = '{national,etranger}',
  'Liste categorie_tarif : national, etranger'
);
select test.verifier(
  enum_range(null::public.devise)::text = '{USD,CDF}',
  'Liste devise : USD, CDF'
);
select test.verifier(
  enum_range(null::public.statut_acte)::text
    = '{enregistre,en_attente_paiement,paye,exonere,delivre,annule}',
  'Liste statut_acte : cycle de vie complet dans le bon ordre'
);
select test.verifier(
  enum_range(null::public.mode_paiement)::text = '{especes}',
  'Liste mode_paiement : espèces uniquement'
);
select test.verifier(
  enum_range(null::public.mode_import)::text = '{scanner,fichier,photo,lot}',
  'Liste mode_import : scanner, fichier, photo, lot'
);

-- 3. Une valeur hors liste est refusée
select test.doit_echouer(
  $q$ select 'EUR'::public.devise $q$,
  'Une monnaie inconnue (EUR) est refusée'
);
select test.doit_echouer(
  $q$ select 'stagiaire'::public.role_utilisateur $q$,
  'Un rôle inconnu (stagiaire) est refusé'
);

-- 4. La normalisation des textes fonctionne
select test.verifier(
  public.normaliser_texte('  MUGISHO  Bahati Hélène ') = 'mugisho bahati helene',
  'normaliser_texte : majuscules, accents et espaces corrigés'
);
select test.verifier(
  public.normaliser_texte('Kavimvira') = public.normaliser_texte('KAVIMVIRA'),
  'normaliser_texte : la casse n''a pas d''importance'
);
select test.verifier(
  public.normaliser_texte('Ngoma Élisée') = 'ngoma elisee',
  'normaliser_texte : accents français retirés (É, é)'
);
select test.verifier(
  public.normaliser_texte(null) is null and public.normaliser_texte('   ') is null,
  'normaliser_texte : texte vide ou absent -> aucune valeur'
);

-- 5. La recherche tolérante aux fautes de frappe est disponible
select test.verifier(
  extensions.similarity('mugisho', 'mugiso') > 0.4,
  'pg_trgm : "Mugiso" est reconnu comme proche de "Mugisho"'
);

-- 6. La fonction de date de modification fonctionne sur une table d'essai
create temporary table essai (
  id int primary key,
  valeur text,
  modifie_le timestamptz not null default '2000-01-01'
);
create trigger essai_maj before update on essai
  for each row execute function public.maj_date_modification();
insert into essai values (1, 'avant');
update essai set valeur = 'après' where id = 1;
select test.verifier(
  (select modifie_le > '2000-01-01' from essai where id = 1),
  'maj_date_modification : la date est mise à jour automatiquement'
);
drop table essai;
