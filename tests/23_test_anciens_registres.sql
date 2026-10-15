-- =====================================================================
-- TESTS du fichier 23 : ANCIENS REGISTRES — IMPORT EN LOT
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset
select id as mar from public.types_actes where code = 'MAR' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000091');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati Mugisho', 'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema Furaha',   'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000091', 'kavimvira.officier', 'Amani Byamungu', 'officier', :'kav', false, false);

-- ---------------------------------------------------------------------
-- 1. Ouvrir un lot
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.creer_lot(:'exnais', 2019::smallint, '  Registre des naissances   2019, volume 1 ')).id as lot \gset
select test.verifier(
  (select entite_id = :'mul' and annee_registre = 2019 and description = 'Registre des naissances 2019, volume 1' and statut = 'ouvert'
   from public.lots_import where id = :'lot'),
  'Lot : ouvert pour l''entité de l''Officier, description nettoyée');
select test.doit_echouer(format($q$ select public.creer_lot(%L, 2099::smallint, 'Futur') $q$, :'exnais'),
  'Lot : année future refusée', 'Année du registre invalide');
select test.doit_echouer(format($q$ select public.creer_lot(%L, 2019::smallint, '  ') $q$, :'exnais'),
  'Lot : description obligatoire', 'Décrivez le registre');
select (public.creer_lot(:'mar', 2001::smallint, 'Registre des mariages 2001')).id as lot_mar \gset
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.creer_lot(%L, 2019::smallint, 'Essai') $q$, :'exnais'),
  'Lot : le Caissier ne peut pas en ouvrir', 'Seul l''Officier');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Ajouter les anciens actes
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.ajouter_acte_ancien(:'lot', 'Furaha  Espoir', 'ignoré', '2019-05-10', ' 412 ')).id as a412 \gset
select test.verifier(
  (select identifiant = 'MUL-EXNAIS-2019-000001' and origine = 'archive_ancienne' and statut = 'delivre' and montant_du is null
          and lot_id = :'lot' and numero_registre = '412' and titulaire_nom = 'Furaha Espoir' and titulaire_2_nom is null
          and cree_par = '00000000-0000-0000-0000-000000000081'
   from public.actes where id = :'a412'),
  'Ancien acte : ID normal, « délivré », sans montant, rattaché au lot, n° du registre gardé');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Autre', null, '2019-06-01', 'N° 412') $q$, :'lot'),
  'Doublon : le même n° (écrit autrement) est refusé, avec l''ID existant', 'Le n° 412 du registre 2019 est déjà numérisé : MUL-EXNAIS-2019-000001');
select test.verifier((public.ajouter_acte_ancien(:'lot', 'Bahati Claire', null, '2019-05-11', '412 bis')).identifiant = 'MUL-EXNAIS-2019-000002',
  '« 412 bis » est un autre acte');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Hors année', null, '2020-01-02', '500') $q$, :'lot'),
  'Date hors de l''année du registre refusée', 'La date doit être en 2019');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Sans numéro', null, '2019-01-02', '  ') $q$, :'lot'),
  'N° du registre obligatoire', 'n° de l''acte dans le registre papier');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, '  ', null, '2019-01-02', '501') $q$, :'lot'),
  'Nom obligatoire', 'nom du titulaire');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Kasongo Jean', null, '2001-03-03', '7') $q$, :'lot_mar'),
  'Mariage : les deux époux sont obligatoires', 'deux époux');
select test.verifier(
  (select titulaire_2_nom = 'Mapendo Grace' from public.ajouter_acte_ancien(:'lot_mar', 'Kasongo Jean', 'Mapendo Grace', '2001-03-03', '7')),
  'Mariage : les deux époux sont gardés');
select test.doit_echouer(format($q$ update public.actes set lot_id = %L where id = %L $q$, :'lot_mar', :'a412'),
  'Le lot d''un acte ne change jamais', 'ne peut pas être changé');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000091');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Intrus', null, '2019-01-02', '900') $q$, :'lot'),
  'Lot d''une autre entité : introuvable', 'Lot introuvable');
select test.verifier((select count(*) = 0 from public.vue_lots), 'Kavimvira ne voit pas les lots de Mulongwe');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Scans du lot ; fermeture seulement quand tout est scanné
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.verifier(
  (select nb_actes = 2 and nb_scannes = 0 and type_code = 'EXNAIS' from public.vue_lots where id = :'lot'),
  'Vue des lots : 2 actes, aucun scan');
select test.doit_echouer(format($q$ update public.lots_import set statut = 'ferme' where id = %L $q$, :'lot'),
  'Fermeture refusée tant qu''un acte n''a pas son scan', '2 acte(s) de ce lot n''ont pas encore leur scan');

select public.chemin_archive(:'a412', 'application/pdf') as chemin \gset
insert into storage.objects (bucket_id, name, metadata) values ('archives', :'chemin', '{"size": 90000, "mimetype": "application/pdf"}');
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, lot_id)
  values (:'a412', 'application/pdf', 1, encode(extensions.digest('registre 412', 'sha256'), 'hex'), 'lot', :'lot');
select test.verifier(
  public.verifier_empreinte_entite(encode(extensions.digest('registre 412', 'sha256'), 'hex'))
    = 'Ce fichier est déjà enregistré pour l''acte MUL-EXNAIS-2019-000001. Vérifiez que vous avez scanné le bon document.'
  and public.verifier_empreinte_entite(encode(extensions.digest('autre fichier', 'sha256'), 'hex')) is null,
  'Avant de créer un ancien acte : le même fichier déjà archivé est repéré');
select test.verifier(
  (select chemin_stockage = 'MUL/2019/MUL-EXNAIS-2019-000001.pdf' and mode_import = 'lot' from public.documents_scannes where acte_id = :'a412')
  and (select nb_scannes = 1 from public.vue_lots where id = :'lot'),
  'Scan du lot : rangé sous MUL/2019/…, compté dans le lot');

select id as a412bis from public.actes where numero_registre = '412 bis' \gset
select public.chemin_archive(:'a412bis', 'application/pdf') as chemin2 \gset
insert into storage.objects (bucket_id, name, metadata) values ('archives', :'chemin2', '{"size": 80000, "mimetype": "application/pdf"}');
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, lot_id)
  values (:'a412bis', 'application/pdf', 1, encode(extensions.digest('registre 412 bis', 'sha256'), 'hex'), 'lot', :'lot');
update public.lots_import set statut = 'ferme' where id = :'lot';
select test.verifier((select statut = 'ferme' and ferme_le is not null from public.lots_import where id = :'lot'),
  'Tout est scanné : le lot se ferme');
select test.doit_echouer(format($q$ select public.ajouter_acte_ancien(%L, 'Tardif', null, '2019-12-01', '999') $q$, :'lot'),
  'Lot fermé : plus aucun acte', 'Ce lot est fermé');
select test.se_deconnecter();

-- La recherche (fichier 09) trouve un ancien acte par son n° de registre
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.verifier(
  (select count(*) >= 1 from public.rechercher_actes('Furaha Espoir', null, null, null, 10) r where r.identifiant = 'MUL-EXNAIS-2019-000001'),
  'Recherche : l''ancien acte est trouvé par son nom');
select test.se_deconnecter();

rollback;
