-- =====================================================================
-- TESTS du fichier 10 : LES RAPPORTS
-- Transaction annulée à la fin.
--
-- Pour tester des rapports sur plusieurs mois, on installe un historique
-- fictif. Comme la base date normalement tout « aujourd'hui », les
-- automatismes sont suspendus le temps de cette installation (test
-- uniquement), puis rétablis avant de vérifier les rapports.
-- =====================================================================
begin;

insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune');
select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000021');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Administrateur', 'admin',    null,   true),
  ('00000000-0000-0000-0000-000000000021', 'kavimvira.officier', 'Officier KAV',   'officier', :'kav', false);

insert into public.types_actes (numero, code, libelle, famille, tarif_distinct_etranger) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',     false),
  ( 5, 'ATRES',  'Attestation de résidence',     'attestation', true);
select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as res  from public.types_actes where code = 'ATRES'  \gset

-- ---------------------------------------------------------------------
-- Installation de l'historique (automatismes suspendus)
-- ---------------------------------------------------------------------
set local session_replication_role = replica;
create temporary sequence numeros;

create function pg_temp.vente(
  p_entite uuid, p_type uuid, p_cat public.categorie_tarif, p_jour date,
  p_du numeric, p_devise_du public.devise, p_devise_recue public.devise, p_recu numeric, p_equiv numeric,
  p_annule boolean default false, p_delivre boolean default false
) returns uuid language plpgsql as $$
declare v_acte uuid; n bigint := nextval('numeros');
begin
  insert into public.actes (identifiant, entite_id, type_acte_id, annee, numero_ordre, titulaire_nom,
                            categorie, montant_du, devise_du, statut, motif_annulation, date_acte, delivre_le)
  values ('TEST-' || n, p_entite, p_type, extract(year from p_jour), n, 'Personne ' || n,
          p_cat, p_du, p_devise_du,
          case when p_annule then 'annule' when p_delivre then 'delivre' else 'paye' end::public.statut_acte,
          case when p_annule then 'Test' end, p_jour,
          case when p_delivre then (p_jour + time '10:00') at time zone 'Africa/Lubumbashi' end)
  returning id into v_acte;

  insert into public.recus (numero_recu, entite_id, acte_id, annee, numero_ordre, montant_du, devise_du,
                            devise_recue, montant_recu, montant_equivalent_cdf, journee, encaisse_le,
                            statut, motif_annulation)
  values ('REC-' || n, p_entite, v_acte, extract(year from p_jour), n, p_du, p_devise_du,
          p_devise_recue, p_recu, p_equiv, p_jour, (p_jour + time '09:00') at time zone 'Africa/Lubumbashi',
          case when p_annule then 'annule' else 'valide' end::public.statut_recu,
          case when p_annule then 'Test' end);
  return v_acte;
end $$;

create function pg_temp.exoneration(p_entite uuid, p_type uuid, p_jour date, p_du numeric, p_devise public.devise)
returns void language plpgsql as $$
declare v_acte uuid; n bigint := nextval('numeros');
begin
  insert into public.actes (identifiant, entite_id, type_acte_id, annee, numero_ordre, titulaire_nom,
                            montant_du, devise_du, statut, date_acte)
  values ('TEST-' || n, p_entite, p_type, extract(year from p_jour), n, 'Exonéré ' || n,
          p_du, p_devise, 'exonere', p_jour)
  returning id into v_acte;
  insert into public.exonerations (acte_id, entite_id, motif, montant_du, devise_du, journee)
  values (v_acte, p_entite, 'Indigent', p_du, p_devise, p_jour);
end $$;

-- MULONGWE
select from pg_temp.vente(:'mul', :'nais', 'national', '2025-10-20', 30,    'USD', 'USD', 30,    84000);   -- année précédente
select from pg_temp.vente(:'mul', :'res',  'national', '2026-03-10', 18000, 'CDF', 'CDF', 18000, 18000);   -- 1er semestre
select from pg_temp.vente(:'mul', :'nais', 'national', '2026-09-15', 30,    'USD', 'USD', 30,    85500);   -- septembre
select from pg_temp.vente(:'mul', :'nais', 'national', '2026-10-05', 30,    'USD', 'USD', 30,    85500);   -- 5 octobre
select from pg_temp.vente(:'mul', :'res',  'etranger', '2026-10-05', 39000, 'CDF', 'CDF', 39000, 39000);
select from pg_temp.vente(:'mul', :'res',  'national', '2026-10-05', 18000, 'CDF', 'CDF', 18000, 18000);
select from pg_temp.vente(:'mul', :'nais', 'national', '2026-10-05', 30,    'USD', 'USD', 30,    85500, true);  -- reçu annulé
select from pg_temp.exoneration(:'mul', :'res', '2026-10-06', 18000, 'CDF');                               -- 6 octobre
select from pg_temp.vente(:'mul', :'nais', 'national', '2026-10-13', 30,    'USD', 'CDF', 85500, 85500, false, true); -- payé en FC, délivré
insert into public.clotures_caisse (entite_id, journee, nb_recus, attendu_usd, attendu_cdf, compte_usd, compte_cdf, explication_ecart)
  values (:'mul', '2026-10-05', 3, 30, 57000, 30, 52000, 'Billet rendu par erreur');

-- KAVIMVIRA
select from pg_temp.vente(:'kav', :'nais', 'national', '2026-10-05', 30, 'USD', 'USD', 30, 87000);

set local session_replication_role = origin;   -- automatismes rétablis

-- ---------------------------------------------------------------------
-- 1. Les périodes
-- ---------------------------------------------------------------------
select test.verifier(
  (select debut = '2026-10-01' and fin = '2026-10-31' and libelle = 'Octobre 2026'
   from public.periode('mois', '2026-10-13')),
  'Mois : du 01/10 au 31/10, libellé « Octobre 2026 »'
);
select test.verifier(
  (select debut = '2026-07-01' and fin = '2026-12-31' and libelle = '2e semestre 2026'
   from public.periode('semestre', '2026-10-13')),
  'Semestre : du 01/07 au 31/12, libellé « 2e semestre 2026 »'
);
select test.verifier(
  (select debut = '2026-01-01' and fin = '2026-06-30' and libelle = '1er semestre 2026'
   from public.periode('semestre', '2026-03-10')),
  '1er semestre : du 01/01 au 30/06'
);
select test.verifier(
  (select debut = '2026-01-01' and fin = '2026-12-31' and libelle = 'Année 2026'
   from public.periode('annee', '2026-10-13')),
  'Année : du 01/01 au 31/12, libellé « Année 2026 »'
);
select test.verifier(
  (select fin = '2028-02-29' from public.periode('mois', '2028-02-10')),
  'Février d''une année bissextile : se termine bien le 29'
);
select test.verifier(
  (select libelle = '05/10/2026' from public.periode('jour', '2026-10-05')),
  'Jour : libellé « 05/10/2026 »'
);

-- ---------------------------------------------------------------------
-- 2. Synthèse mensuelle (octobre 2026), vue par l'admin
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');

select test.verifier(
  (select array_agg(entite_code order by entite_code) = array['KAV', 'MUL', 'TOTAL']
   from public.rapport_synthese('mois', '2026-10-10')),
  'Admin : une ligne par entité, plus une ligne TOTAL'
);
select test.verifier(
  (select recus_valides = 4 and recus_annules = 1
          and recettes_usd = 30 and recettes_cdf = 142500 and recettes_equivalent_cdf = 228000
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'MUL'),
  'Mulongwe, octobre : 4 reçus valides (1 annulé à part) ; 30 $ et 142 500 FC ; équivalent 228 000 FC'
);
select test.verifier(
  (select exonerations = 1 and exonere_cdf = 18000 and exonere_usd = 0
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'MUL'),
  'Mulongwe, octobre : 1 exonération, 18 000 FC non perçus'
);
select test.verifier(
  (select jours_clotures = 1 and ecart_caisse_cdf = -5000 and ecart_caisse_usd = 0
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'MUL'),
  'Mulongwe, octobre : 1 journée clôturée, manque de caisse de 5 000 FC signalé'
);
select test.verifier(
  (select actes_enregistres = 6 and actes_delivres = 1 and actes_payes_sans_scan = 5
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'MUL'),
  'Mulongwe, octobre : 6 actes enregistrés, 1 délivré, 5 payés ou exonérés encore sans scan'
);
select test.verifier(
  (select precedent_equivalent_cdf = 85500 and variation_pct = 166.7
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'MUL'),
  'Mulongwe : comparaison avec septembre (85 500 FC) -> +166,7 %'
);
select test.verifier(
  (select recus_valides = 1 and recettes_equivalent_cdf = 87000 and variation_pct is null
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'KAV'),
  'Kavimvira, octobre : 1 reçu, 87 000 FC ; pas de variation calculée (septembre à zéro)'
);
select test.verifier(
  (select recus_valides = 5 and recettes_usd = 60 and recettes_cdf = 142500
          and recettes_equivalent_cdf = 315000 and variation_pct = 268.4
   from public.rapport_synthese('mois', '2026-10-10') where entite_code = 'TOTAL'),
  'TOTAL octobre : 5 reçus, 60 $ et 142 500 FC, équivalent 315 000 FC, +268,4 %'
);

-- Autres périodes
select test.verifier(
  (select recus_valides = 3 and recus_annules = 1 and recettes_cdf = 57000 and recettes_equivalent_cdf = 142500
          and jours_clotures = 1
   from public.rapport_synthese('jour', '2026-10-05', :'mul')),
  'Rapport journalier du 05/10 (Mulongwe) : 3 reçus valides, 1 annulé, 142 500 FC, journée clôturée'
);
select test.verifier(
  (select count(*) = 1 from public.rapport_synthese('jour', '2026-10-05', :'mul')),
  'Rapport d''une seule entité : pas de ligne TOTAL'
);
select test.verifier(
  (select recus_valides = 5 and recettes_equivalent_cdf = 313500 and precedent_equivalent_cdf = 18000
   from public.rapport_synthese('semestre', '2026-10-10', :'mul')),
  'Semestriel (2e semestre 2026, Mulongwe) : 5 reçus, 313 500 FC ; 1er semestre : 18 000 FC'
);
select test.verifier(
  (select recus_valides = 6 and recettes_equivalent_cdf = 331500
          and precedent_equivalent_cdf = 84000 and variation_pct = 294.6
   from public.rapport_synthese('annee', '2026-10-10', :'mul')),
  'Annuel (2026, Mulongwe) : 6 reçus, 331 500 FC ; 2025 : 84 000 FC -> +294,6 %'
);

-- ---------------------------------------------------------------------
-- 3. Détail par type d'acte
-- ---------------------------------------------------------------------
select test.verifier(
  (select actes_payes = 2 and dont_nationaux = 2 and recettes_usd = 30 and recettes_cdf = 85500
          and recettes_equivalent_cdf = 171000 and part_recettes_pct = 75.0
   from public.rapport_par_acte('mois', '2026-10-10', :'mul') where type_code = 'EXNAIS'),
  'Extraits de naissance (octobre, Mulongwe) : 2 payés, 171 000 FC, 75 % des recettes'
);
select test.verifier(
  (select actes_payes = 2 and dont_nationaux = 1 and dont_etrangers = 1 and exonerations = 1
          and recettes_equivalent_cdf = 57000 and part_recettes_pct = 25.0
   from public.rapport_par_acte('mois', '2026-10-10', :'mul') where type_code = 'ATRES'),
  'Attestations de résidence : 2 payées (1 national, 1 étranger), 1 exonérée, 25 % des recettes'
);
select test.verifier(
  (select type_code = 'EXNAIS' from public.rapport_par_acte('mois', '2026-10-10', :'mul') limit 1),
  'Le type d''acte qui rapporte le plus est classé en premier'
);

-- ---------------------------------------------------------------------
-- 4. Évolution dans la période
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 31 and sum(recettes_equivalent_cdf) = 228000
   from public.rapport_evolution('mois', '2026-10-10', :'mul')),
  'Évolution d''octobre : 31 jours (sans trou), total 228 000 FC'
);
select test.verifier(
  (select recettes_equivalent_cdf = 142500 and recus_valides = 3
   from public.rapport_evolution('mois', '2026-10-10', :'mul') where debut = '2026-10-05')
  and (select exonerations = 1 from public.rapport_evolution('mois', '2026-10-10', :'mul') where debut = '2026-10-06')
  and (select recettes_equivalent_cdf = 0 from public.rapport_evolution('mois', '2026-10-10', :'mul') where debut = '2026-10-01'),
  'Évolution d''octobre : 142 500 FC le 5, une exonération le 6, zéro les jours sans activité'
);
select test.verifier(
  (select count(*) = 12
          and sum(recettes_equivalent_cdf) = 331500
          and max(libelle) filter (where debut = '2026-03-01') = 'Mars 2026'
   from public.rapport_evolution('annee', '2026-10-10', :'mul')),
  'Évolution annuelle : 12 mois (de Janvier à Décembre 2026), total 331 500 FC'
);
select test.verifier(
  (select count(*) = 6 and min(debut) = '2026-07-01'
   from public.rapport_evolution('semestre', '2026-10-10', :'mul')),
  'Évolution semestrielle : 6 mois, de juillet à décembre'
);
select test.verifier(
  (select sum(recettes_equivalent_cdf) = 315000 from public.rapport_evolution('mois', '2026-10-10')),
  'Évolution consolidée (toutes entités) : 315 000 FC en octobre'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 5. Les rapports respectent les droits
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000021');  -- Officier de Kavimvira
select test.verifier(
  (select count(*) = 1 and min(entite_code) = 'KAV' and min(recettes_equivalent_cdf) = 87000
   from public.rapport_synthese('mois', '2026-10-10')),
  'Agent de Kavimvira : le rapport ne contient que sa propre entité, sans ligne TOTAL'
);
select test.verifier(
  not exists (select 1 from public.rapport_synthese('mois', '2026-10-10', :'mul'))
  and not exists (select 1 from public.rapport_par_acte('mois', '2026-10-10', :'mul'))
  and (select sum(recettes_equivalent_cdf) = 0 from public.rapport_evolution('mois', '2026-10-10', :'mul')),
  'Agent de Kavimvira : demander explicitement Mulongwe ne donne aucun chiffre'
);
select test.verifier(
  (select sum(recettes_equivalent_cdf) = 87000 from public.rapport_evolution('mois', '2026-10-10')),
  'Agent de Kavimvira : l''évolution « toutes entités » ne compte que sa propre entité'
);
select test.se_deconnecter();

set role anon;
select test.doit_echouer(
  $q$ select * from public.rapport_synthese('mois') $q$,
  'Visiteur non connecté : aucun rapport', 'permission denied'
);
reset role;

rollback;
