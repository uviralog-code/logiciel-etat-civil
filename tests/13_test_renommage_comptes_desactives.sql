-- =====================================================================
-- TESTS du fichier 13 : RENOMMAGE DES COMPTES DÉSACTIVÉS
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as bav from public.entites where code = 'BAV' \gset
select to_char(public.aujourdhui(), 'YYYYMMDD') as jour \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000043');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',      'Administrateur', 'admin',    null,   true),
  ('00000000-0000-0000-0000-000000000041', 'bavira.caissier', 'Jean Kabila',    'caissier', :'bav', false);

-- ---------------------------------------------------------------------
-- 1. L'admin désactive le caissier de Bavira
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.utilisateurs set actif = false where id = '00000000-0000-0000-0000-000000000041';
select test.verifier(
  (select nom_utilisateur = 'bavira.caissier.ancien' || :'jour'
          and ancien_nom_utilisateur = 'bavira.caissier'
          and desactive_le is not null and not actif
   from public.utilisateurs where id = '00000000-0000-0000-0000-000000000041'),
  'Désactivation : « bavira.caissier » devient « bavira.caissier.ancien' || :'jour' || ' », l''ancien nom est conservé'
);

-- ---------------------------------------------------------------------
-- 2. Le remplaçant reprend le nom habituel
-- ---------------------------------------------------------------------
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000042', 'bavira.caissier', 'Esther Mukeba', 'caissier', :'bav');
select test.verifier(
  (select count(*) = 1 from public.utilisateurs where nom_utilisateur = 'bavira.caissier' and actif),
  'Le remplaçant reçoit le nom habituel « bavira.caissier »'
);

-- ---------------------------------------------------------------------
-- 3. Deuxième départ le même jour : un suffixe évite le doublon
-- ---------------------------------------------------------------------
update public.utilisateurs set actif = false where id = '00000000-0000-0000-0000-000000000042';
select test.verifier(
  (select nom_utilisateur = 'bavira.caissier.ancien' || :'jour' || '.2'
   from public.utilisateurs where id = '00000000-0000-0000-0000-000000000042'),
  'Deuxième désactivation le même jour : « …ancien' || :'jour' || '.2 », sans doublon'
);
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000043', 'bavira.caissier', 'Troisième caissier', 'caissier', :'bav');

-- ---------------------------------------------------------------------
-- 4. Réactivation et autres modifications
-- ---------------------------------------------------------------------
update public.utilisateurs set actif = false where id = '00000000-0000-0000-0000-000000000043';
update public.utilisateurs set actif = true  where id = '00000000-0000-0000-0000-000000000043';
select test.verifier(
  (select actif and desactive_le is null and nom_utilisateur = 'bavira.caissier.ancien' || :'jour' || '.3'
   from public.utilisateurs where id = '00000000-0000-0000-0000-000000000043'),
  'Réactivation : le compte redevient actif et garde son nom d''archive (l''admin peut le renommer)'
);
update public.utilisateurs set nom_utilisateur = 'bavira.caissier' where id = '00000000-0000-0000-0000-000000000043';
select test.verifier(
  (select nom_utilisateur = 'bavira.caissier' from public.utilisateurs where id = '00000000-0000-0000-0000-000000000043'),
  'L''admin peut redonner au compte réactivé son nom habituel'
);
update public.utilisateurs set nom_complet = 'Nom corrigé' where id = '00000000-0000-0000-0000-000000000043';
select test.verifier(
  (select nom_utilisateur = 'bavira.caissier' from public.utilisateurs where id = '00000000-0000-0000-0000-000000000043'),
  'Une modification ordinaire d''un compte actif ne le renomme pas'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 5. Traçabilité
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 1 from public.journal_audit
   where table_nom = 'utilisateurs' and champs_modifies @> array['actif', 'nom_utilisateur']
     and anciennes_valeurs ->> 'nom_utilisateur' = 'bavira.caissier'
     and nouvelles_valeurs ->> 'nom_utilisateur' = 'bavira.caissier.ancien' || :'jour'),
  'Le renommage figure au journal d''audit, avec l''ancien et le nouveau nom'
);
select test.verifier(
  public.nom_utilisateur_archive('bavira.officier', '2026-10-05') = 'bavira.officier.ancien20261005',
  'Le nom d''archive suit le format nom.ancienAAAAMMJJ'
);

rollback;
