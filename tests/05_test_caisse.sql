-- =====================================================================
-- TESTS du fichier 05 : LA CAISSE
-- Transaction annulée à la fin.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Heure locale
-- ---------------------------------------------------------------------
select test.verifier(
  current_setting('TimeZone') = 'Africa/Lubumbashi',
  'La base fonctionne à l''heure d''Uvira (Africa/Lubumbashi, UTC+2)'
);
select test.verifier(
  public.journee_de('2026-10-13 23:30:00+00') = '2026-10-14',
  '23 h 30 en heure universelle = 1 h 30 à Uvira : le paiement compte pour le lendemain'
);
select test.verifier(
  public.journee_de('2026-10-13 21:59:00+00') = '2026-10-13',
  '21 h 59 en heure universelle = 23 h 59 à Uvira : le paiement compte pour le jour même'
);

-- ---------------------------------------------------------------------
-- Données d'essai
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune');
select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into public.types_actes (numero, code, libelle, famille, tarif_distinct_etranger, modele_fiche) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',         false, 'naissance'),
  ( 2, 'DEC',    'Acte de décès',                'acte_etat_civil', false, 'deces');
select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as dec  from public.types_actes where code = 'DEC'    \gset

insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis) values
  (:'nais', 30,    'USD', current_date - 100),
  (:'dec',  15000, 'CDF', current_date - 100);

insert into auth.users (id) values ('00000000-0000-0000-0000-000000000002');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000002', 'mulongwe.caissier', 'Neema Furaha', 'caissier', :'mul');

-- Une petite fonction pour créer un acte prêt à être encaissé
create function pg_temp.acte_pret(p_entite uuid, p_type uuid, p_nom text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (p_entite, p_type, p_nom, 'en_attente_paiement') returning id into v;
  return v;
end $$;

select pg_temp.acte_pret(:'mul', :'nais', 'Acte A') as a_usd \gset
select pg_temp.acte_pret(:'mul', :'nais', 'Acte B') as a_usd_en_fc \gset
select pg_temp.acte_pret(:'mul', :'dec',  'Acte C') as a_cdf \gset
select pg_temp.acte_pret(:'mul', :'dec',  'Acte D') as a_cdf_en_usd \gset
select pg_temp.acte_pret(:'mul', :'dec',  'Acte E') as a_exo \gset
select pg_temp.acte_pret(:'mul', :'nais', 'Acte F') as a_annule \gset

-- ---------------------------------------------------------------------
-- 1. Encaissement impossible sans taux du jour
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format('select public.encaisser(%L)', :'a_usd'),
  'Sans taux du jour, un acte en dollars ne peut pas être encaissé',
  'Aucun taux de change'
);

insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2850, now() - interval '1 hour');

-- ---------------------------------------------------------------------
-- 2. Encaissements : montants calculés par la base
-- ---------------------------------------------------------------------
select from public.encaisser(:'a_usd');
select test.verifier(
  (select montant_recu = 30 and devise_recue = 'USD' and taux_applique = 2850
          and montant_equivalent_cdf = 85500 and journee = public.aujourdhui()
   from public.recus where acte_id = :'a_usd'),
  'Acte de 30 $ payé en dollars : 30 $ reçus, équivalent 85 500 FC, journée du jour'
);
select test.verifier(
  (select numero_recu = format('MUL-REC-%s-000001', extract(year from public.aujourdhui())) from public.recus where acte_id = :'a_usd'),
  'Premier reçu numéroté automatiquement : MUL-REC-' || extract(year from public.aujourdhui()) || '-000001'
);
select test.verifier(
  (select statut = 'paye' from public.actes where id = :'a_usd'),
  'Après encaissement, l''acte passe automatiquement à « payé »'
);

select from public.encaisser(:'a_usd_en_fc', 'CDF');
select test.verifier(
  (select montant_recu = 85500 and devise_recue = 'CDF' and montant_du = 30 and devise_du = 'USD'
   from public.recus where acte_id = :'a_usd_en_fc'),
  'Acte de 30 $ payé en francs : la base calcule 85 500 FC à percevoir'
);

select from public.encaisser(:'a_cdf');
select test.verifier(
  (select montant_recu = 15000 and devise_recue = 'CDF' and taux_applique is null and montant_equivalent_cdf = 15000
   from public.recus where acte_id = :'a_cdf'),
  'Acte de 15 000 FC payé en francs : 15 000 FC, aucun taux nécessaire'
);

select from public.encaisser(:'a_cdf_en_usd', 'USD');
select test.verifier(
  (select montant_recu = 5.26 and devise_recue = 'USD' and montant_equivalent_cdf = 15000
   from public.recus where acte_id = :'a_cdf_en_usd'),
  'Acte de 15 000 FC payé en dollars : 5,26 $ à percevoir (15 000 / 2 850)'
);

select test.verifier(
  (select string_agg(right(numero_recu, 6), ',' order by numero_ordre) = '000001,000002,000003,000004'
   from public.recus where entite_id = :'mul'),
  'Les reçus se suivent sans trou : 000001 à 000004'
);

-- Montant bricolé : ignoré
insert into public.recus (acte_id, montant_recu, montant_du, devise_du, montant_equivalent_cdf)
  values (pg_temp.acte_pret(:'mul', :'dec', 'Acte G'), 1, 1, 'CDF', 1);
select test.verifier(
  (select r.montant_recu = 15000 from public.recus r join public.actes a on a.id = r.acte_id where a.titulaire_nom = 'Acte G'),
  'Un montant saisi à la main (1 FC) est ignoré : la base encaisse 15 000 FC'
);

-- ---------------------------------------------------------------------
-- 3. Refus d'encaissement
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format('select public.encaisser(%L)', :'a_usd'),
  'Un acte déjà payé ne peut pas être encaissé une seconde fois',
  'en attente de paiement'
);
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'dec', 'Encore enregistré');
select test.doit_echouer(
  format('select public.encaisser(%L)', (select id from public.actes where titulaire_nom = 'Encore enregistré')),
  'Un acte encore « enregistré » (pas transmis au Caissier) ne peut pas être encaissé',
  'en attente de paiement'
);
select test.doit_echouer(
  format($q$ update public.recus set montant_recu = 10 where acte_id = %L $q$, :'a_cdf'),
  'Un reçu ne peut pas être modifié',
  'Seule l''annulation'
);
select test.doit_echouer(
  format($q$ delete from public.recus where acte_id = %L $q$, :'a_cdf'),
  'Un reçu ne peut pas être supprimé',
  'Suppression interdite'
);

-- ---------------------------------------------------------------------
-- 4. Exonération
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format($q$ select public.exonerer(%L, '   ') $q$, :'a_exo'),
  'Une exonération sans motif est refusée'
);
select from public.exonerer(:'a_exo', 'Indigent, attestation du chef de quartier');
select test.verifier(
  (select a.statut = 'exonere' and x.montant_du = 15000 and x.journee = public.aujourdhui()
   from public.actes a join public.exonerations x on x.acte_id = a.id where a.id = :'a_exo'),
  'Exonération accordée : l''acte passe à « exonéré », 15 000 FC non perçus enregistrés'
);
select test.doit_echouer(
  format('select public.encaisser(%L)', :'a_exo'),
  'Un acte exonéré ne peut pas être encaissé',
  'en attente de paiement'
);

-- ---------------------------------------------------------------------
-- 5. Annulation d'un reçu
-- ---------------------------------------------------------------------
select from public.encaisser(:'a_annule');
select id as r_annule from public.recus where acte_id = :'a_annule' \gset

select test.doit_echouer(
  format($q$ select public.annuler_recu(%L, '  ') $q$, :'r_annule'),
  'Une annulation de reçu sans motif est refusée'
);
select from public.annuler_recu(:'r_annule', 'Erreur de type d''acte');
select test.verifier(
  (select r.statut = 'annule' and r.annule_le is not null and r.montant_recu = 30
          and a.statut = 'annule' and a.motif_annulation like 'Reçu MUL-REC-%annulé : Erreur de type d''acte'
   from public.recus r join public.actes a on a.id = r.acte_id where r.id = :'r_annule'),
  'Reçu annulé : il reste visible avec son montant, et l''acte est annulé avec le même motif'
);
select test.doit_echouer(
  format($q$ select public.annuler_recu(%L, 'Encore') $q$, :'r_annule'),
  'Un reçu déjà annulé ne peut pas l''être une seconde fois',
  'déjà annulé'
);

-- ---------------------------------------------------------------------
-- 6. Clôture de la journée
-- ---------------------------------------------------------------------
-- Attendu : dollars = 30 (A) + 5,26 (D) = 35,26 $ ; francs = 85 500 (B) + 15 000 (C) + 15 000 (G) = 115 500 FC
select test.doit_echouer(
  format($q$ select public.cloturer_journee(%L, 35.26, 110500) $q$, :'mul'),
  'Un manque de 5 000 FC sans explication bloque la clôture',
  'explication est obligatoire'
);

select from public.cloturer_journee(:'mul', 35.26, 110500, 'Billet de 5 000 FC rendu par erreur à un usager');
select test.verifier(
  (select nb_recus = 5 and nb_recus_annules = 1 and nb_exonerations = 1
          and attendu_usd = 35.26 and attendu_cdf = 115500
          and ecart_usd = 0 and ecart_cdf = -5000
          and total_equivalent_cdf = 85500 + 85500 + 15000 + 15000 + 15000
   from public.clotures_caisse where entite_id = :'mul'),
  'Clôture : 5 reçus valides, 1 annulé, 1 exonération ; attendu 35,26 $ et 115 500 FC ; manque de 5 000 FC enregistré'
);

-- Journée verrouillée
select test.doit_echouer(
  format('select public.encaisser(%L)', pg_temp.acte_pret(:'mul', :'dec', 'Après clôture')),
  'Après la clôture, plus aucun encaissement pour cette journée',
  'déjà clôturée'
);
select test.doit_echouer(
  format($q$ select public.exonerer(%L, 'Tardive') $q$, (select id from public.actes where titulaire_nom = 'Après clôture')),
  'Après la clôture, plus aucune exonération pour cette journée',
  'déjà clôturée'
);
select test.doit_echouer(
  format($q$ select public.annuler_recu(%L, 'Tardive') $q$, (select id from public.recus where acte_id = :'a_cdf')),
  'Après la clôture, plus aucun reçu de la journée ne peut être annulé',
  'est clôturée'
);
select test.doit_echouer(
  format($q$ select public.cloturer_journee(%L, 35.26, 115500) $q$, :'mul'),
  'Une journée ne peut être clôturée qu''une seule fois'
);
select test.doit_echouer(
  format($q$ update public.clotures_caisse set compte_cdf = 115500 where entite_id = %L $q$, :'mul'),
  'Une clôture ne peut pas être modifiée après coup',
  'Modification interdite'
);
select test.doit_echouer(
  format($q$ delete from public.clotures_caisse where entite_id = %L $q$, :'mul'),
  'Une clôture ne peut pas être supprimée',
  'Suppression interdite'
);
select test.doit_echouer(
  format($q$ update public.exonerations set motif = 'Autre' where acte_id = %L $q$, :'a_exo'),
  'Une exonération ne peut pas être modifiée après coup',
  'Modification interdite'
);
select test.doit_echouer(
  format($q$ select public.cloturer_journee(%L, 0, 0, null, public.aujourdhui() + 1) $q$, :'mul'),
  'On ne peut pas clôturer une journée future',
  'journée future'
);

-- Les autres entités ne sont pas touchées
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'kav', 2900, now() - interval '1 hour');
select from public.encaisser(pg_temp.acte_pret(:'kav', :'nais', 'Acte Kavimvira'));
select test.verifier(
  (select numero_recu = format('KAV-REC-%s-000001', extract(year from public.aujourdhui())) and montant_equivalent_cdf = 87000
   from public.recus where entite_id = :'kav'),
  'La clôture de Mulongwe ne bloque pas Kavimvira, qui a sa propre numérotation et son propre taux'
);

-- Une journée sans aucune opération peut être clôturée à zéro
select from public.cloturer_journee(:'mul', 0, 0, null, public.aujourdhui() - 1);
select test.verifier(
  (select nb_recus = 0 and attendu_usd = 0 and attendu_cdf = 0
   from public.clotures_caisse where entite_id = :'mul' and journee = public.aujourdhui() - 1),
  'Une journée oubliée (hier, sans opération) peut être clôturée après coup, à zéro'
);

-- ---------------------------------------------------------------------
-- 7. Verrouillage par défaut
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000002');
select test.verifier(
  (select count(*) from public.recus) = 0
  and (select count(*) from public.exonerations) = 0
  and (select count(*) from public.clotures_caisse) = 0,
  'Sans règle d''accès, un utilisateur connecté ne voit ni reçus, ni exonérations, ni clôtures'
);
select test.se_deconnecter();

rollback;
