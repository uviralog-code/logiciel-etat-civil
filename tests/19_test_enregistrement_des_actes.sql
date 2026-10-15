-- =====================================================================
-- TESTS du fichier 19 : ENREGISTRER UN ACTE AVEC SA FICHE
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset
select id as mar from public.types_actes where code = 'MAR' \gset
select id as dec from public.types_actes where code = 'DEC' \gset
select id as atres from public.types_actes where code = 'ATRES' \gset
select id as cvie from public.types_actes where code = 'CVIE' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000091');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati M.',      'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema F.',       'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000091', 'kavimvira.officier', 'Amani B.',       'officier', :'kav', false, false);

-- ---------------------------------------------------------------------
-- 1. Enregistrer : acte + fiche, ensemble
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');

select (a).id as naissance, (a).identifiant as id_naissance from (
  select public.enregistrer_acte(:'exnais', 'national', '  MUGISHO   Bahati Jean ', null, 'Mugisho Pierre', '+243 990 000 000', null,
    '{"sexe": "M", "date_naissance": "2015-03-21", "lieu_naissance": " Uvira ", "nom_pere": "Mugisho Pierre", "nom_mere": "Bahati Claire"}'::jsonb,
    true) as a) x \gset
select test.verifier(
  (select statut = 'en_attente_paiement' and titulaire_nom = 'MUGISHO Bahati Jean' and montant_du = 30 and devise_du = 'USD'
     and entite_id = :'mul' and identifiant ~ '^MUL-EXNAIS-\d{4}-\d{6}$'
   from public.actes where id = :'naissance'),
  'Naissance : acte enregistré et transmis, ID et prix calculés par la base, nom nettoyé');
select test.verifier(
  (select sexe = 'M' and date_naissance = '2015-03-21' and lieu_naissance = 'Uvira' and nom_mere = 'Bahati Claire'
   from public.details_naissance where acte_id = :'naissance'),
  'Naissance : la fiche est enregistrée avec l''acte');
select test.verifier(
  (select date_acte = public.aujourdhui() and annee = extract(year from public.aujourdhui()) from public.actes where id = :'naissance'),
  'Date de l''acte et année de l''ID : celles du jour à Uvira (pas l''heure universelle)');
select test.verifier(
  (select bool_and(pg_get_constraintdef(oid) like '%aujourdhui()%') from pg_constraint
    where conname in ('actes_date_pas_future', 'details_naissance_date_naissance_check',
                      'details_mariage_date_celebration_check', 'details_deces_date_deces_check')
   having count(*) = 4),
  'Les contrôles « pas dans le futur » comptent en heure d''Uvira');
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', '   ', null, null, null, null, '{"sexe": "F", "date_naissance": "2020-01-01"}'::jsonb, false)$$, :'exnais'),
  'Titulaire sans nom : refusé avec un message clair', 'nom complet du titulaire');
select test.doit_echouer(
  format($$select public.corriger_acte(%L, 'national', 'Autre Nom', null, null, null, null, '{"sexe": "M", "date_naissance": "2015-03-21"}'::jsonb, false)$$, :'naissance'),
  'Acte transmis au Caissier : il ne se corrige pas tant qu''il n''est pas renvoyé', 'demandez au Caissier');

select count(*) as avant from public.actes \gset
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Enfant sans date', null, null, null, null, '{"sexe": "F"}'::jsonb, false)$$, :'exnais'),
  'Naissance : sans date de naissance, refusé', 'date de naissance sont obligatoires');
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Enfant du futur', null, null, null, null, '{"sexe": "F", "date_naissance": "2999-01-01"}'::jsonb, false)$$, :'exnais'),
  'Naissance : date de naissance dans le futur, refusé', 'details_naissance_date_naissance_check');
select test.verifier((select count(*) = :avant from public.actes),
  '… et aucun acte à moitié enregistré n''est resté (tout ou rien)');

select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Kasongo Jean', null, null, null, null, '{"date_celebration": "2026-10-10"}'::jsonb, false)$$, :'mar'),
  'Mariage : sans le second époux, refusé', 'deux époux');
select (public.enregistrer_acte(:'mar', 'national', 'Kasongo Jean', 'Mapendo Grace', null, null, 'Régime : communauté',
          '{"date_celebration": "2026-10-10", "lieu_celebration": "Bureau de Mulongwe", "temoins": "Amani, Furaha"}'::jsonb, false)).id as mariage \gset
select test.verifier(
  (select a.statut = 'enregistre' and a.titulaire_2_nom = 'Mapendo Grace' and a.montant_du = 75 and m.temoins = 'Amani, Furaha'
   from public.actes a join public.details_mariage m on m.acte_id = a.id where a.id = :'mariage'),
  'Mariage : deux époux et fiche ; non transmis, il reste « enregistré »');

select (public.enregistrer_acte(:'dec', 'national', 'Bisimwa Paul', null, 'Bisimwa Marie', null, null,
          '{"sexe": "M", "date_deces": "2026-10-12", "age_au_deces": "67", "declarant_nom": "Bisimwa Marie"}'::jsonb, true)).id as deces \gset
select test.verifier(
  (select age_au_deces = 67 and declarant_nom = 'Bisimwa Marie' from public.details_deces where acte_id = :'deces'),
  'Décès : fiche avec l''âge et le déclarant');

select (public.enregistrer_acte(:'atres', 'etranger', 'John Smith', null, null, null, null,
          '{"sexe": "M", "date_naissance": "1990-01-01"}'::jsonb, true)).id as residence \gset
select test.verifier(
  (select montant_du = 39000 and categorie = 'etranger' from public.actes where id = :'residence')
  and not exists (select 1 from public.details_naissance where acte_id = :'residence'),
  'Attestation (fiche simple) : tarif Étranger ; les informations d''une autre fiche sont ignorées');

select test.se_deconnecter();
update public.types_actes set actif = false where id = :'cvie';
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Personne', null, null, null, null, null, false)$$, :'cvie'),
  'Type retiré du catalogue : refusé', 'désactivé');

-- ---------------------------------------------------------------------
-- 2. Corriger : acte + fiche, et retransmettre
-- ---------------------------------------------------------------------
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select (public.renvoyer_a_l_officier(:'naissance', 'Le père s''appelle Mugisho Pierre-Claver')).id as renvoye \gset
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000081');

select (public.corriger_acte(:'naissance', 'national', 'MUGISHO Bahati Jean', null, 'Mugisho Pierre-Claver', '+243 990 000 000', null,
  '{"sexe": "M", "date_naissance": "2015-03-21", "lieu_naissance": "Uvira", "nom_pere": "Mugisho Pierre-Claver", "nom_mere": "Bahati Claire"}'::jsonb,
  true)).id as corrige \gset
select test.verifier(
  (select a.statut = 'en_attente_paiement' and a.motif_renvoi is null and a.demandeur_nom = 'Mugisho Pierre-Claver'
          and d.nom_pere = 'Mugisho Pierre-Claver' and a.identifiant = :'id_naissance'
   from public.actes a join public.details_naissance d on d.acte_id = a.id where a.id = :'naissance'),
  'Correction après renvoi : acte et fiche corrigés, retransmis ; l''ID ne change pas');

select test.doit_echouer(
  format($$select public.corriger_acte(%L, 'national', 'Kasongo Jean', null, null, null, null, '{"date_celebration": "2026-10-10"}'::jsonb, false)$$, :'mariage'),
  'Correction d''un mariage : le second époux reste obligatoire', 'deux époux');

update public.actes set statut = 'annule', motif_annulation = 'Doublon' where id = :'mariage';
select test.doit_echouer(
  format($$select public.corriger_acte(%L, 'national', 'Kasongo Jean', 'Mapendo Grace', null, null, null, '{"date_celebration": "2026-10-10"}'::jsonb, false)$$, :'mariage'),
  'Acte annulé : plus aucune correction', 'annulé');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Les autres rôles et les autres entités
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Personne', null, null, null, null, '{"sexe": "F", "date_naissance": "2020-01-01"}'::jsonb, false)$$, :'exnais'),
  'Caissier : ne peut pas enregistrer d''acte', 'Seul l''Officier');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.doit_echouer(
  format($$select public.enregistrer_acte(%L, 'national', 'Personne', null, null, null, null, '{"sexe": "F", "date_naissance": "2020-01-01"}'::jsonb, false)$$, :'exnais'),
  'Administrateur : ne peut pas enregistrer d''acte', 'Seul l''Officier');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000091');
select test.doit_echouer(
  format($$select public.corriger_acte(%L, 'national', 'Autre nom', null, null, null, null, '{"sexe": "M", "date_naissance": "2015-03-21"}'::jsonb, false)$$, :'naissance'),
  'Officier d''une autre entité : ne peut pas corriger un acte de Mulongwe', 'introuvable');
select (public.enregistrer_acte(:'exnais', 'national', 'Enfant de Kavimvira', null, null, null, null, '{"sexe": "F", "date_naissance": "2020-05-05"}'::jsonb, false)).identifiant as id_kav \gset
select test.verifier(:'id_kav' ~ '^KAV-EXNAIS-', 'Officier de Kavimvira : son acte est rangé dans SON entité (KAV)');
select test.se_deconnecter();

rollback;
