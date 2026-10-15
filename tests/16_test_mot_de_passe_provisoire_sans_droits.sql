-- =====================================================================
-- TESTS du fichier 16 : AUCUN DROIT TANT QUE LE MOT DE PASSE PROVISOIRE
--                       N'EST PAS REMPLACÉ
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as kal from public.entites where code = 'KAL' \gset

insert into auth.users (id, encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a', '$2a$10$admin'),
  ('00000000-0000-0000-0000-000000000071', '$2a$10$provisoire'),
  ('00000000-0000-0000-0000-000000000072', '$2a$10$caisse');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',       'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000071', 'kalundu.officier', 'Neema B.',       'officier', :'kal', false, true),
  ('00000000-0000-0000-0000-000000000072', 'kalundu.caissier', 'Furaha M.',      'caissier', :'kal', false, false);

-- ---------------------------------------------------------------------
-- 1. Mot de passe provisoire : aucun droit sur les données
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000071');
select test.verifier(public.role_courant() is null and public.entite_courante() is null,
  'Mot de passe provisoire : le rôle et l''entité ne sont pas reconnus');
select test.verifier((select count(*) = 0 from public.entites), 'Mot de passe provisoire : ne voit pas son entité');
select test.verifier((select count(*) = 0 from public.actes), 'Mot de passe provisoire : ne voit aucun acte');
select test.verifier((select count(*) = 0 from public.types_actes), 'Mot de passe provisoire : ne voit pas le catalogue');
select test.verifier(
  (select array_agg(nom_utilisateur) = array['kalundu.officier'] from public.utilisateurs),
  '… mais lit toujours son propre profil (l''écran sait ainsi qu''il doit changer son mot de passe)'
);
select from public.journaliser_connexion('kalundu.officier', true);
select test.verifier((select count(*) = 1 from public.journal_connexions), '… et peut noter sa connexion au journal');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Mot de passe remplacé : droits habituels, tout de suite
-- ---------------------------------------------------------------------
update auth.users set encrypted_password = '$2a$10$choisi' where id = '00000000-0000-0000-0000-000000000071';
select test.se_connecter('00000000-0000-0000-0000-000000000071');
select from public.mot_de_passe_change();
select test.verifier(public.role_courant() = 'officier' and public.entite_courante() = :'kal',
  'Mot de passe remplacé : l''officier retrouve son rôle et son entité');
select test.verifier((select count(*) = 1 from public.entites), '… et voit son entité');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Réinitialisation par l'admin : les droits tombent immédiatement
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000072');
select test.verifier(public.role_courant() = 'caissier', 'Avant réinitialisation : le caissier a ses droits');
select test.se_deconnecter();

update auth.users set encrypted_password = '$2a$10$nouveau-provisoire' where id = '00000000-0000-0000-0000-000000000072';
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.utilisateurs set doit_changer_mot_de_passe = true where id = '00000000-0000-0000-0000-000000000072';
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000072');
select test.verifier(public.role_courant() is null,
  'Après réinitialisation : même avec un jeton encore valable, plus aucun droit sur les données');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 4. L'administrateur vérifié garde ses droits (son mot de passe n'est pas provisoire)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier(public.est_admin(), 'Administrateur vérifié : rôle reconnu');
select test.se_deconnecter();

rollback;
