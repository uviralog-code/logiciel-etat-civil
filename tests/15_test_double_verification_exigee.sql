-- =====================================================================
-- TESTS du fichier 15 : LA DOUBLE VÉRIFICATION EST EXIGÉE PAR LA BASE
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into auth.users (id, encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a', '$2a$10$admin'),
  ('00000000-0000-0000-0000-000000000061', '$2a$10$off'),
  ('00000000-0000-0000-0000-000000000062', '$2a$10$caisse');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',        'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000061', 'mulongwe.officier', 'Amani B.',       'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000062', 'kavimvira.caissier','Furaha M.',      'caissier', :'kav', true,  false);

-- ---------------------------------------------------------------------
-- 1. Administrateur avec le mot de passe SEUL (aal1) : aucun pouvoir
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a', 'aal1');
select test.verifier(public.niveau_verification() = 'aal1', 'La base lit le niveau « aal1 » dans le jeton');
select test.verifier(public.role_courant() is null and not public.est_admin(),
  'Admin sans code : son rôle n''est pas reconnu');
select test.verifier((select count(*) = 0 from public.entites), 'Admin sans code : ne voit aucune entité');
select test.verifier((select count(*) = 0 from public.actes), 'Admin sans code : ne voit aucun acte');
select test.verifier((select count(*) = 0 from public.journal_audit), 'Admin sans code : ne voit pas le journal d''audit');
select test.verifier(
  (select array_agg(nom_utilisateur) = array['admin.cdjp'] from public.utilisateurs),
  'Admin sans code : ne voit que son propre profil (pas les autres comptes)'
);
select test.doit_echouer(
  $$insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
    values ('00000000-0000-0000-0000-000000000061', 'pirate.compte', 'Pirate', 'officier', '$$ || :'kav' || $$')$$,
  'Admin sans code : ne peut pas créer de compte',
  'row-level security'
);
update public.utilisateurs set actif = false where id = '00000000-0000-0000-0000-000000000061';
select test.se_deconnecter();
select test.verifier(
  (select actif from public.utilisateurs where id = '00000000-0000-0000-0000-000000000061'),
  'Admin sans code : sa tentative de désactiver un agent n''a eu aucun effet'
);

-- Ce qui reste permis avant le code : noter sa connexion
select test.se_connecter('00000000-0000-0000-0000-00000000000a', 'aal1');
select from public.journaliser_connexion('admin.cdjp', true);
select test.verifier(
  (select count(*) = 1 from public.journal_connexions where nom_utilisateur_saisi = 'admin.cdjp'),
  'Admin sans code : peut noter sa connexion et lire ses propres connexions'
);
select test.se_deconnecter();

-- Un jeton sans indication de niveau est traité comme « mot de passe seul »
select from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
select test.verifier(public.niveau_verification() = 'aal1' and not public.est_admin(),
  'Jeton sans niveau indiqué : considéré comme « mot de passe seul »');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Administrateur après le code (aal2) : tous ses pouvoirs
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a', 'aal2');
select test.verifier(public.est_admin(), 'Admin avec code : rôle reconnu');
select test.verifier((select count(*) = 4 from public.entites), 'Admin avec code : voit les 4 entités');
select test.verifier((select count(*) = 3 from public.utilisateurs), 'Admin avec code : voit tous les comptes');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Agents sans double vérification : rien ne change pour eux
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000061', 'aal1');
select test.verifier(public.role_courant() = 'officier' and public.entite_courante() = :'mul',
  'Officier (sans double vérification) : reconnu avec son mot de passe seul');
select test.verifier((select count(*) = 1 from public.entites), 'Officier : voit son entité');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 4. Si la double vérification est activée pour un agent, elle s'applique à lui aussi
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000062', 'aal1');
select test.verifier(public.role_courant() is null and public.entite_courante() is null,
  'Caissier avec double vérification, sans code : aucun droit');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000062', 'aal2');
select test.verifier(public.role_courant() = 'caissier' and public.entite_courante() = :'kav',
  'Caissier avec double vérification, après le code : ses droits habituels');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 5. Un compte désactivé n'a aucun droit, même avec le code
-- ---------------------------------------------------------------------
update public.utilisateurs set actif = false where id = '00000000-0000-0000-0000-000000000062';
select test.se_connecter('00000000-0000-0000-0000-000000000062', 'aal2');
select test.verifier(public.role_courant() is null, 'Compte désactivé : aucun droit, même avec le code');
select test.se_deconnecter();

rollback;
