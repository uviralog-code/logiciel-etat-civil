-- =====================================================================
-- TESTS du fichier 14 : L'OBLIGATION NE SE LÈVE QUE SI LE MOT DE PASSE
--                       A RÉELLEMENT CHANGÉ
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as kal from public.entites where code = 'KAL' \gset

-- Comptes de connexion avec leur mot de passe chiffré (valeurs d'essai)
insert into auth.users (id, encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a', '$2a$10$hash-admin'),
  ('00000000-0000-0000-0000-000000000051', '$2a$10$hash-provisoire-1'),
  ('00000000-0000-0000-0000-000000000052', '$2a$10$hash-personnel');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',       'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000051', 'kalundu.officier', 'Neema B.',       'officier', :'kal', false, true),
  ('00000000-0000-0000-0000-000000000052', 'kalundu.caissier', 'Furaha M.',      'caissier', :'kal', false, false);

-- ---------------------------------------------------------------------
-- 1. L'empreinte est notée à la création d'un compte avec obligation
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 1 from public.mots_de_passe_provisoires
   where utilisateur_id = '00000000-0000-0000-0000-000000000051'),
  'Compte créé avec mot de passe provisoire : son empreinte est notée'
);
select test.verifier(
  (select count(*) = 0 from public.mots_de_passe_provisoires
   where utilisateur_id = '00000000-0000-0000-0000-000000000052'),
  'Compte sans obligation : aucune empreinte'
);
select test.verifier(
  (select empreinte !~ 'hash-provisoire' and length(empreinte) = 64 from public.mots_de_passe_provisoires
   where utilisateur_id = '00000000-0000-0000-0000-000000000051'),
  'L''empreinte est un condensé de 64 caractères, sans rien du mot de passe chiffré'
);

-- ---------------------------------------------------------------------
-- 2. Contournement : lever l'obligation SANS changer de mot de passe
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000051');
select test.doit_echouer(
  'select public.mot_de_passe_change()',
  'L''agent ne peut pas lever l''obligation en gardant le mot de passe provisoire',
  'n''a pas été remplacé'
);
select test.se_deconnecter();
select test.verifier(
  (select doit_changer_mot_de_passe from public.utilisateurs where id = '00000000-0000-0000-0000-000000000051'),
  '… l''obligation est toujours là'
);

-- ---------------------------------------------------------------------
-- 3. Après un vrai changement (fait par Supabase), l'obligation se lève
-- ---------------------------------------------------------------------
update auth.users set encrypted_password = '$2a$10$hash-choisi-par-agent'
 where id = '00000000-0000-0000-0000-000000000051';
select test.se_connecter('00000000-0000-0000-0000-000000000051');
select from public.mot_de_passe_change();
select test.se_deconnecter();
select test.verifier(
  (select not doit_changer_mot_de_passe from public.utilisateurs where id = '00000000-0000-0000-0000-000000000051'),
  'Mot de passe réellement changé : l''obligation est levée'
);
select test.verifier(
  (select count(*) = 0 from public.mots_de_passe_provisoires where utilisateur_id = '00000000-0000-0000-0000-000000000051'),
  '… et l''empreinte du provisoire est effacée'
);

-- ---------------------------------------------------------------------
-- 4. Réinitialisation par l'admin : nouvelle empreinte, même si
--    l'obligation était déjà posée
-- ---------------------------------------------------------------------
update auth.users set encrypted_password = '$2a$10$hash-provisoire-2'
 where id = '00000000-0000-0000-0000-000000000051';
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.utilisateurs set doit_changer_mot_de_passe = true where id = '00000000-0000-0000-0000-000000000051';
select test.se_deconnecter();
select empreinte as empreinte_1 from public.mots_de_passe_provisoires
 where utilisateur_id = '00000000-0000-0000-0000-000000000051' \gset

update auth.users set encrypted_password = '$2a$10$hash-provisoire-3'
 where id = '00000000-0000-0000-0000-000000000051';
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.utilisateurs set doit_changer_mot_de_passe = true where id = '00000000-0000-0000-0000-000000000051';
select test.se_deconnecter();
select test.verifier(
  (select empreinte <> :'empreinte_1' from public.mots_de_passe_provisoires
   where utilisateur_id = '00000000-0000-0000-0000-000000000051'),
  'Deuxième réinitialisation : l''empreinte suit le NOUVEAU mot de passe provisoire'
);
select test.se_connecter('00000000-0000-0000-0000-000000000051');
select test.doit_echouer(
  'select public.mot_de_passe_change()',
  '… et l''agent doit bien remplacer ce nouveau provisoire',
  'n''a pas été remplacé'
);
select test.se_deconnecter();

-- Une modification sans rapport (nom complet) ne touche pas à l'empreinte
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.utilisateurs set nom_complet = 'Neema Byamungu' where id = '00000000-0000-0000-0000-000000000051';
select test.se_deconnecter();
select test.verifier(
  (select count(*) = 1 from public.mots_de_passe_provisoires where utilisateur_id = '00000000-0000-0000-0000-000000000051'),
  'Changer le nom complet ne modifie pas le suivi du mot de passe provisoire'
);

-- ---------------------------------------------------------------------
-- 5. Personne ne lit les empreintes par l'API
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.doit_echouer(
  'select * from public.mots_de_passe_provisoires',
  'Même l''administrateur ne peut pas lire les empreintes',
  'permission denied'
);
select test.doit_echouer(
  'select public.empreinte_mot_de_passe(''00000000-0000-0000-0000-000000000051'')',
  'Ni calculer l''empreinte d''un compte',
  'permission denied'
);
select test.se_deconnecter();

set role anon;
select test.doit_echouer('select public.mot_de_passe_change()', 'Un visiteur non connecté ne peut pas appeler la fonction', 'permission denied');
reset role;

-- ---------------------------------------------------------------------
-- 6. Un agent sans obligation peut appeler la fonction sans effet
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000052');
select from public.mot_de_passe_change();
select test.se_deconnecter();
select test.verifier(
  (select not doit_changer_mot_de_passe from public.utilisateurs where id = '00000000-0000-0000-0000-000000000052'),
  'Agent sans obligation : appel sans effet ni erreur'
);

rollback;
