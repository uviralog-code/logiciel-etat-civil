-- =====================================================================
-- TESTS du fichier 07 : JOURNAL D'AUDIT ET JOURNAL DES CONNEXIONS
-- Transaction annulée à la fin.
-- Pour simuler « qui est connecté » sans changer de droits, on renseigne
-- seulement l'identifiant de l'utilisateur (comme le jeton de Supabase).
-- =====================================================================
begin;

create function pg_temp.agir_en_tant_que(p uuid) returns void
language sql as $$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), true) $$;

-- ---------------------------------------------------------------------
-- Données d'essai (créées par l'administrateur technique : « système »)
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values ('MUL', 'Commune de Mulongwe', 'commune');
select id as mul from public.entites where code = 'MUL' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id) values
  ('00000000-0000-0000-0000-000000000001', 'mulongwe.officier', 'Bahati Mugisho', 'officier', :'mul'),
  ('00000000-0000-0000-0000-000000000002', 'mulongwe.caissier', 'Neema Furaha',   'caissier', :'mul');

insert into public.types_actes (numero, code, libelle, famille, modele_fiche)
  values (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait', 'naissance');
select id as nais from public.types_actes where code = 'EXNAIS' \gset
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis)
  values (:'nais', 30, 'USD', current_date - 100);

select test.verifier(
  (select count(*) from public.journal_audit where table_nom = 'entites' and operation = 'INSERT'
     and utilisateur_id is null and reference = 'MUL' and entite_id = :'mul') = 1,
  'Création de l''entité MUL notée, comme opération technique (« système »)'
);

-- ---------------------------------------------------------------------
-- 1. L'Officier enregistre un acte et le transmet
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que('00000000-0000-0000-0000-000000000001');
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'nais', 'Mugisho Jean');
select id as acte, identifiant as ident from public.actes where titulaire_nom = 'Mugisho Jean' \gset
update public.actes set statut = 'en_attente_paiement' where id = :'acte';

select test.verifier(
  (select utilisateur_id = '00000000-0000-0000-0000-000000000001' and role = 'officier'
          and entite_id = :'mul' and reference = :'ident'
          and nouvelles_valeurs ->> 'titulaire_nom' = 'Mugisho Jean'
   from public.journal_audit where table_nom = 'actes' and operation = 'INSERT'),
  'Création de l''acte notée : par l''Officier, avec l''ID de l''acte et son contenu'
);
select test.verifier(
  (select champs_modifies = array['statut']
          and anciennes_valeurs ->> 'statut' = 'enregistre'
          and nouvelles_valeurs ->> 'statut' = 'en_attente_paiement'
   from public.journal_audit where table_nom = 'actes' and operation = 'UPDATE'),
  'Transmission au Caissier notée : seul le statut a changé (enregistré -> en attente)'
);

-- ---------------------------------------------------------------------
-- 2. Le Caissier encaisse
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que('00000000-0000-0000-0000-000000000002');
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2850, now() - interval '1 hour');
select from public.encaisser(:'acte');

select test.verifier(
  (select role = 'caissier' and reference like 'MUL-REC-%' and nouvelles_valeurs ->> 'montant_recu' = '30.00'
   from public.journal_audit where table_nom = 'recus' and operation = 'INSERT'),
  'Émission du reçu notée : par le Caissier, avec le numéro du reçu et le montant'
);
select test.verifier(
  (select count(*) = 1 from public.journal_audit
   where table_nom = 'actes' and operation = 'UPDATE' and role = 'caissier'
     and nouvelles_valeurs ->> 'statut' = 'paye'),
  'Passage de l''acte à « payé » noté, au nom du Caissier'
);
select test.verifier(
  (select role = 'caissier' and nouvelles_valeurs ->> 'taux' = '2850.0000'
   from public.journal_audit where table_nom = 'taux_change'),
  'Saisie du taux du jour notée, au nom du Caissier'
);

-- ---------------------------------------------------------------------
-- 3. Fiche de détails : rattachée à l'entité et à l'ID de l'acte
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que('00000000-0000-0000-0000-000000000001');
insert into public.details_naissance (acte_id, sexe, date_naissance) values (:'acte', 'M', '2015-03-21');
select test.verifier(
  (select entite_id = :'mul' and reference = :'ident' and enregistrement_id = :'acte'
   from public.journal_audit where table_nom = 'details_naissance'),
  'Ajout de la fiche naissance noté, avec l''entité et l''ID de l''acte retrouvés'
);

-- ---------------------------------------------------------------------
-- 4. Annulation d'un reçu : tout est tracé
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que('00000000-0000-0000-0000-000000000002');
select from public.annuler_recu((select id from public.recus where acte_id = :'acte'), 'Erreur de personne');
select test.verifier(
  (select champs_modifies @> array['statut', 'motif_annulation']
          and nouvelles_valeurs ->> 'motif_annulation' = 'Erreur de personne'
   from public.journal_audit where table_nom = 'recus' and operation = 'UPDATE'),
  'Annulation du reçu notée avec son motif'
);
select test.verifier(
  (select count(*) = 1 from public.journal_audit
   where table_nom = 'actes' and nouvelles_valeurs ->> 'statut' = 'annule'),
  'Annulation automatique de l''acte également notée'
);

-- ---------------------------------------------------------------------
-- 5. Ce qui n'est PAS noté (pour ne pas encombrer le journal)
-- ---------------------------------------------------------------------
select count(*) as avant from public.journal_audit \gset
update public.utilisateurs set derniere_connexion_en_ligne = now()
  where nom_utilisateur = 'mulongwe.officier';
select test.verifier(
  (select count(*) from public.journal_audit) = :avant,
  'La simple mise à jour de la date de connexion n''encombre pas le journal'
);
update public.utilisateurs set nom_complet = 'Bahati Mugisho' where nom_utilisateur = 'mulongwe.officier';
select test.verifier(
  (select count(*) from public.journal_audit) = :avant,
  'Une modification qui ne change rien n''est pas notée'
);
update public.utilisateurs set actif = false where nom_utilisateur = 'mulongwe.officier';
select test.verifier(
  (select count(*) from public.journal_audit) = :avant + 1,
  'La désactivation d''un compte, elle, est bien notée'
);

-- ---------------------------------------------------------------------
-- 6. Vue lisible
-- ---------------------------------------------------------------------
select test.verifier(
  (select utilisateur = 'mulongwe.caissier' and nom_complet = 'Neema Furaha'
          and entite_code = 'MUL'
   from public.vue_journal_audit where table_nom = 'recus' and operation = 'Ajout'),
  'Vue lisible : nom de l''agent, entité et opération en français'
);

-- ---------------------------------------------------------------------
-- 7. Journal des connexions
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que(null);

select from public.journaliser_connexion('pirate.inconnu', false, 'Nom d''utilisateur inconnu', 'PC-INCONNU');
select test.verifier(
  (select utilisateur_id is null and not succes and motif_echec = 'Nom d''utilisateur inconnu'
   from public.journal_connexions where nom_utilisateur_saisi = 'pirate.inconnu'),
  'Échec avec un nom inconnu : noté, sans compte associé'
);

select from public.journaliser_connexion('Mulongwe.Caissier', false, 'Mot de passe incorrect', 'PC-MUL-01');
select test.verifier(
  (select utilisateur_id = '00000000-0000-0000-0000-000000000002' and entite_id = :'mul' and poste = 'PC-MUL-01'
   from public.journal_connexions where nom_utilisateur_saisi = 'Mulongwe.Caissier'),
  'Échec sur un compte existant : le compte et le poste sont reconnus'
);

select test.doit_echouer(
  $q$ select public.journaliser_connexion('mulongwe.caissier', true) $q$,
  'Une connexion réussie ne peut pas être notée par quelqu''un de non connecté',
  'personne connectée'
);

update public.utilisateurs set derniere_connexion_en_ligne = null where nom_utilisateur = 'mulongwe.caissier';
select pg_temp.agir_en_tant_que('00000000-0000-0000-0000-000000000002');
select from public.journaliser_connexion('quelqu.un.dautre', true, null, 'PC-MUL-01', 'Chrome');
select test.verifier(
  (select utilisateur_id = '00000000-0000-0000-0000-000000000002' and succes
   from public.journal_connexions where nom_utilisateur_saisi = 'quelqu.un.dautre'),
  'Connexion réussie : c''est le compte réellement connecté qui est noté, pas le nom tapé'
);
select test.verifier(
  (select derniere_connexion_en_ligne = now() from public.utilisateurs where nom_utilisateur = 'mulongwe.caissier')
  and public.hors_ligne_autorise('00000000-0000-0000-0000-000000000002'),
  'Connexion réussie en ligne : le compteur des 7 jours hors-ligne repart'
);

update public.utilisateurs set derniere_connexion_en_ligne = now() - interval '3 days'
  where nom_utilisateur = 'mulongwe.caissier';
select from public.journaliser_connexion('mulongwe.caissier', true, null, 'PC-MUL-01', null, true, now() - interval '1 day');
select test.verifier(
  (select hors_ligne and horodatage = now() - interval '1 day' and enregistre_le = now()
   from public.journal_connexions where hors_ligne)
  and (select derniere_connexion_en_ligne = now() - interval '3 days'
       from public.utilisateurs where nom_utilisateur = 'mulongwe.caissier'),
  'Connexion hors-ligne transmise plus tard : notée à son heure réelle, sans relancer le compteur des 7 jours'
);

select test.doit_echouer(
  $q$ select public.journaliser_connexion('mulongwe.caissier', true, null, null, null, true, now() - interval '8 days') $q$,
  'Une connexion de plus de 7 jours est refusée',
  'trop ancienne'
);
select test.doit_echouer(
  $q$ select public.journaliser_connexion('mulongwe.caissier', true, null, null, null, false, now() + interval '1 hour') $q$,
  'Une connexion datée dans le futur est refusée',
  'futur'
);

-- ---------------------------------------------------------------------
-- 8. Journaux inaltérables, même pour l'administrateur technique
-- ---------------------------------------------------------------------
select pg_temp.agir_en_tant_que(null);
select test.doit_echouer(
  $q$ update public.journal_audit set reference = 'falsifié' $q$,
  'Le journal d''audit ne peut pas être modifié',
  'Modification interdite'
);
select test.doit_echouer(
  $q$ delete from public.journal_audit $q$,
  'Le journal d''audit ne peut pas être effacé',
  'Suppression interdite'
);
select test.doit_echouer(
  $q$ truncate public.journal_audit $q$,
  'Le journal d''audit ne peut pas être vidé d''un coup',
  'Vidage interdit'
);
select test.doit_echouer(
  $q$ delete from public.journal_connexions $q$,
  'Le journal des connexions ne peut pas être effacé',
  'Suppression interdite'
);
select test.doit_echouer(
  $q$ truncate public.journal_connexions $q$,
  'Le journal des connexions ne peut pas être vidé d''un coup',
  'Vidage interdit'
);

-- ---------------------------------------------------------------------
-- 9. Verrouillage par défaut
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000002');
select test.verifier(
  (select count(*) from public.journal_audit) = 0 and (select count(*) from public.journal_connexions) = 0,
  'Sans règle d''accès, un agent connecté ne voit aucun journal'
);
select test.se_deconnecter();

rollback;
