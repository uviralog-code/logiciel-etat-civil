-- =====================================================================
-- TESTS du fichier 02 : ENTITÉS ET UTILISATEURS
-- Tout se déroule dans une transaction annulée à la fin :
-- les données d'essai ne restent pas dans la base.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Données d'essai : 4 entités et des comptes de connexion
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',     'commune'),
  ('KAV', 'Commune de Kavimvira',    'commune'),
  ('KAL', 'Commune de Kalundu',      'commune'),
  ('BAV', 'Chefferie des Bavira',    'chefferie');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-000000000001', 'mul.off@test'),
  ('00000000-0000-0000-0000-000000000002', 'mul.cai@test'),
  ('00000000-0000-0000-0000-000000000003', 'kav.off@test'),
  ('00000000-0000-0000-0000-000000000004', 'divers1@test'),
  ('00000000-0000-0000-0000-000000000005', 'divers2@test'),
  ('00000000-0000-0000-0000-000000000006', 'divers3@test');

-- ---------------------------------------------------------------------
-- 1. Entités
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) from public.entites) = 4,
  'Les 4 entités sont enregistrées'
);
select test.verifier(
  (select ville = 'Uvira' and province = 'Sud-Kivu' and active from public.entites where code = 'BAV'),
  'Ville, province et statut actif remplis par défaut'
);
select test.doit_echouer(
  $q$ insert into public.entites (code, nom, type) values ('MUL', 'Doublon', 'commune') $q$,
  'Deux entités ne peuvent pas avoir le même code'
);
select test.doit_echouer(
  $q$ insert into public.entites (code, nom, type) values ('mu1', 'Code invalide', 'commune') $q$,
  'Un code qui n''est pas 3 lettres majuscules est refusé'
);
select test.doit_echouer(
  $q$ insert into public.entites (code, nom, type) values ('XYZ', 'Ville X', 'quartier') $q$,
  'Un type d''entité inconnu est refusé'
);

-- ---------------------------------------------------------------------
-- 2. Création des comptes valides
-- ---------------------------------------------------------------------
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp', 'Administrateur CDJP', 'admin', null, true);

insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id) values
  ('00000000-0000-0000-0000-000000000001', '  Mulongwe.Officier ', '  Bahati   Mugisho ', 'officier',
     (select id from public.entites where code = 'MUL')),
  ('00000000-0000-0000-0000-000000000002', 'mulongwe.caissier', 'Neema Furaha', 'caissier',
     (select id from public.entites where code = 'MUL')),
  ('00000000-0000-0000-0000-000000000003', 'kavimvira.officier', 'Amani Byamungu', 'officier',
     (select id from public.entites where code = 'KAV'));

select test.verifier(
  (select count(*) from public.utilisateurs) = 4,
  'Admin, officier et caissier de Mulongwe, officier de Kavimvira créés'
);
select test.verifier(
  (select nom_utilisateur = 'mulongwe.officier' and nom_complet = 'Bahati Mugisho'
   from public.utilisateurs where id = '00000000-0000-0000-0000-000000000001'),
  'Nom d''utilisateur mis en minuscules, espaces superflus retirés'
);
select test.verifier(
  (select doit_changer_mot_de_passe from public.utilisateurs where nom_utilisateur = 'mulongwe.caissier'),
  'Un nouveau compte doit changer son mot de passe à la première connexion'
);

-- ---------------------------------------------------------------------
-- 3. Règles sur les rôles
-- ---------------------------------------------------------------------
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification)
      values ('00000000-0000-0000-0000-000000000004', 'admin.deux', 'Second admin', 'admin', null, true) $q$,
  'Un deuxième administrateur actif est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification)
      values ('00000000-0000-0000-0000-000000000004', 'admin.entite', 'Admin rattaché', 'admin',
              (select id from public.entites where code = 'KAL'), true) $q$,
  'Un administrateur rattaché à une entité est refusé'
);
select test.doit_echouer(
  $q$ update public.utilisateurs set double_verification = false
      where nom_utilisateur = 'admin.cdjp' $q$,
  'L''administrateur ne peut pas désactiver la double vérification'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000004', 'sans.entite', 'Officier sans entité', 'officier', null) $q$,
  'Un officier sans entité est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000004', 'mulongwe.officier2', 'Second officier', 'officier',
              (select id from public.entites where code = 'MUL')) $q$,
  'Un deuxième officier actif dans la même entité est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000004', 'mulongwe.caissier2', 'Second caissier', 'caissier',
              (select id from public.entites where code = 'MUL')) $q$,
  'Un deuxième caissier actif dans la même entité est refusé'
);

-- Remplacement d'un agent : on désactive l'ancien, puis on crée le nouveau
update public.utilisateurs set actif = false where nom_utilisateur = 'mulongwe.officier';
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000004', 'mulongwe.officier2', 'Nouvel officier', 'officier',
          (select id from public.entites where code = 'MUL'));
select test.verifier(
  (select count(*) from public.utilisateurs
   where entite_id = (select id from public.entites where code = 'MUL') and role = 'officier') = 2,
  'Remplacement d''agent : l''ancien compte désactivé est conservé, le nouveau est créé'
);
select test.doit_echouer(
  $q$ update public.utilisateurs set actif = true where nom_utilisateur = 'mulongwe.officier' $q$,
  'L''ancien officier ne peut pas être réactivé tant que le nouveau est actif'
);

-- ---------------------------------------------------------------------
-- 4. Format et unicité des noms d'utilisateur
-- ---------------------------------------------------------------------
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000005', 'kalundu officier', 'Espace', 'officier',
              (select id from public.entites where code = 'KAL')) $q$,
  'Un nom d''utilisateur avec un espace est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000005', 'kalundu.officier@', 'Caractère', 'officier',
              (select id from public.entites where code = 'KAL')) $q$,
  'Un nom d''utilisateur avec un caractère spécial est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000005', 'MULONGWE.CAISSIER', 'Doublon', 'caissier',
              (select id from public.entites where code = 'KAL')) $q$,
  'Un nom d''utilisateur déjà pris est refusé, même écrit en majuscules'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-000000000005', 'kalundu.officier', '   ', 'officier',
              (select id from public.entites where code = 'KAL')) $q$,
  'Un nom complet vide est refusé'
);
select test.doit_echouer(
  $q$ insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
      values ('00000000-0000-0000-0000-0000000000ff', 'fantome.officier', 'Sans compte', 'officier',
              (select id from public.entites where code = 'KAL')) $q$,
  'Un profil sans compte de connexion Supabase est refusé'
);

-- ---------------------------------------------------------------------
-- 5. Fonctions "qui est connecté ?"
-- ---------------------------------------------------------------------
-- L'identifiant de Mulongwe est lu AVANT la connexion : une fois connecté,
-- le caissier n'a pas (encore) le droit de lire la table des entités.
select id as id_mulongwe from public.entites where code = 'MUL' \gset

select test.se_connecter('00000000-0000-0000-0000-000000000002');  -- caissier de Mulongwe
select test.verifier(public.role_courant() = 'caissier', 'Caissier connecté : rôle reconnu');
select test.verifier(
  public.entite_courante() = :'id_mulongwe'::uuid,
  'Caissier connecté : entité Mulongwe reconnue'
);
select test.verifier(not public.est_admin(), 'Caissier connecté : n''est pas administrateur');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-00000000000a');  -- admin
select test.verifier(public.est_admin(), 'Admin connecté : reconnu comme administrateur');
select test.verifier(public.entite_courante() is null, 'Admin connecté : rattaché à aucune entité');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000001');  -- ancien officier désactivé
select test.verifier(
  public.role_courant() is null and public.entite_courante() is null,
  'Compte désactivé : aucun rôle ni entité, comme s''il n''existait pas'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 6. Verrouillage par défaut (sécurité par ligne activée)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000002');
select test.verifier(
  (select count(*) from public.entites) = 0 and (select count(*) from public.utilisateurs) = 0,
  'Sans règle d''accès, un utilisateur connecté ne voit aucune donnée'
);
select test.doit_echouer(
  $q$ insert into public.entites (code, nom, type) values ('PIR', 'Entité pirate', 'commune') $q$,
  'Sans règle d''accès, un utilisateur ne peut rien ajouter'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 7. Règle des 7 jours hors-ligne
-- ---------------------------------------------------------------------
update public.utilisateurs set derniere_connexion_en_ligne = now() - interval '2 days'
  where nom_utilisateur = 'mulongwe.caissier';
update public.utilisateurs set derniere_connexion_en_ligne = now() - interval '8 days'
  where nom_utilisateur = 'kavimvira.officier';

select test.verifier(
  public.hors_ligne_autorise('00000000-0000-0000-0000-000000000002'),
  'Connexion en ligne il y a 2 jours : travail hors-ligne autorisé'
);
select test.verifier(
  not public.hors_ligne_autorise('00000000-0000-0000-0000-000000000003'),
  'Connexion en ligne il y a 8 jours : travail hors-ligne bloqué'
);
select test.verifier(
  not public.hors_ligne_autorise('00000000-0000-0000-0000-000000000004'),
  'Jamais connecté en ligne : travail hors-ligne bloqué'
);
update public.utilisateurs set actif = false where nom_utilisateur = 'mulongwe.caissier';
select test.verifier(
  not public.hors_ligne_autorise('00000000-0000-0000-0000-000000000002'),
  'Compte désactivé : travail hors-ligne bloqué même avec une connexion récente'
);

-- ---------------------------------------------------------------------
-- 8. Intégrité des liens
-- ---------------------------------------------------------------------
select test.doit_echouer(
  $q$ delete from public.entites where code = 'MUL' $q$,
  'Une entité qui a des utilisateurs ne peut pas être supprimée'
);
delete from auth.users where id = '00000000-0000-0000-0000-000000000003';
select test.verifier(
  not exists (select 1 from public.utilisateurs where nom_utilisateur = 'kavimvira.officier'),
  'Supprimer un compte de connexion supprime aussi son profil'
);

-- Date de modification automatique
-- (on force d'abord une vieille date, déclencheur suspendu, puis on modifie normalement)
alter table public.entites disable trigger entites_maj_date;
update public.entites set modifie_le = '2000-01-01' where code = 'KAL';
alter table public.entites enable trigger entites_maj_date;
update public.entites set nom = 'Commune de Kalundu (Uvira)' where code = 'KAL';
select test.verifier(
  (select modifie_le > '2000-01-02' from public.entites where code = 'KAL'),
  'La date de modification se met à jour automatiquement'
);

rollback;
