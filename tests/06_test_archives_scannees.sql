-- =====================================================================
-- TESTS du fichier 06 : LES ARCHIVES SCANNÉES
-- Transaction annulée à la fin.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Données d'essai
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune');
select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into public.types_actes (numero, code, libelle, famille, modele_fiche) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',         'naissance'),
  ( 2, 'DEC',    'Acte de décès',                'acte_etat_civil', 'deces');
select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as dec  from public.types_actes where code = 'DEC'    \gset

insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis) values
  (:'nais', 30,    'USD', current_date - 100),
  (:'dec',  15000, 'CDF', current_date - 100);
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2850, now() - interval '1 hour');

select extract(year from public.aujourdhui())::int as an \gset

-- Outils : créer un acte encaissé, déposer un fichier, calculer une empreinte
create function pg_temp.acte_paye(p_entite uuid, p_type uuid, p_nom text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (p_entite, p_type, p_nom, 'en_attente_paiement') returning id into v;
  perform public.encaisser(v);
  return v;
end $$;

create function pg_temp.deposer(p_chemin text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name) values ('archives', p_chemin)
$$;

create function pg_temp.empreinte(p_contenu text) returns text
language sql as $$ select encode(extensions.digest(p_contenu, 'sha256'), 'hex') $$;

select pg_temp.acte_paye(:'mul', :'nais', 'Acte A') as a \gset
select pg_temp.acte_paye(:'mul', :'nais', 'Acte E') as e \gset
insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (:'mul', :'nais', 'Acte B en attente', 'en_attente_paiement');
select id as b from public.actes where titulaire_nom = 'Acte B en attente' \gset
insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (:'mul', :'dec', 'Acte D exonéré', 'en_attente_paiement');
select id as d from public.actes where titulaire_nom = 'Acte D exonéré' \gset
select from public.exonerer(:'d', 'Indigent');
select pg_temp.acte_paye(:'mul', :'nais', 'Acte C annulé') as c \gset
select from public.annuler_recu((select id from public.recus where acte_id = :'c'), 'Erreur');

-- ---------------------------------------------------------------------
-- 1. Espace de stockage
-- ---------------------------------------------------------------------
select test.verifier(
  (select not public and file_size_limit = 15728640
          and allowed_mime_types = array['application/pdf','image/jpeg','image/png']
   from storage.buckets where id = 'archives'),
  'Espace « archives » privé, 15 Mo maximum, formats PDF, JPEG et PNG'
);

-- ---------------------------------------------------------------------
-- 2. Emplacement calculé à partir de l'ID de l'acte
-- ---------------------------------------------------------------------
select test.verifier(
  public.chemin_archive(:'a', 'application/pdf') = format('MUL/%s/MUL-EXNAIS-%s-000001.pdf', :an, :an),
  format('Emplacement prévu : MUL/%s/MUL-EXNAIS-%s-000001.pdf', :an, :an)
);
select test.verifier(
  public.chemin_archive(:'a', 'image/jpeg') like '%-000001.jpg',
  'Une photo JPEG reçoit l''extension .jpg'
);
select test.doit_echouer(
  format($q$ select public.chemin_archive(%L, 'image/gif') $q$, :'a'),
  'Un format non accepté (GIF) est refusé',
  'Format non accepté'
);

-- ---------------------------------------------------------------------
-- 3. Enregistrement d'un scan
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 250000, %L, 'scanner') $q$, :'a', pg_temp.empreinte('scan A')),
  'Un scan est refusé tant que le fichier n''a pas été déposé',
  'Aucun fichier trouvé'
);

select pg_temp.deposer(public.chemin_archive(:'a', 'application/pdf'));
insert into public.documents_scannes (acte_id, entite_id, chemin_stockage, type_mime, taille_octets, nb_pages, empreinte_sha256, mode_import)
  values (:'a', :'kav', 'KAV/piege.pdf', 'application/pdf', 250000, 1, upper(pg_temp.empreinte('scan A')), 'scanner');
select test.verifier(
  (select version = 1
          and entite_id = :'mul'
          and chemin_stockage = format('MUL/%s/MUL-EXNAIS-%s-000001.pdf', :an, :an)
          and empreinte_sha256 = pg_temp.empreinte('scan A')
   from public.documents_scannes where acte_id = :'a'),
  'Scan enregistré : version 1, entité et emplacement imposés par la base (les valeurs saisies sont ignorées)'
);

-- Nouvelle version (scan refait)
select test.verifier(
  public.chemin_archive(:'a', 'application/pdf') like '%-000001-v2.pdf',
  'Le scan suivant du même acte est prévu en version 2 (…-000001-v2.pdf)'
);
select pg_temp.deposer(public.chemin_archive(:'a', 'application/pdf'));
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 260000, %L, 'scanner') $q$, :'a', pg_temp.empreinte('scan A v2')),
  'Un deuxième scan du même acte sans motif de remplacement est refusé',
  'documents_remplacement_motive'
);
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, motif_remplacement)
  values (:'a', 'application/pdf', 260000, pg_temp.empreinte('scan A v2'), 'scanner', 'Premier scan illisible');
select test.verifier(
  (select version = 2 from public.vue_document_actuel where acte_id = :'a')
  and (select count(*) = 2 from public.documents_scannes where acte_id = :'a'),
  'Version 2 enregistrée : elle fait foi, la version 1 reste conservée'
);

-- ---------------------------------------------------------------------
-- 4. Garde-fous anti-confusion
-- ---------------------------------------------------------------------
select pg_temp.deposer(public.chemin_archive(:'e', 'application/pdf'));
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 250000, %L, 'scanner') $q$, :'e', pg_temp.empreinte('scan A')),
  'Le même fichier ne peut pas être rattaché à un deuxième acte',
  format('déjà enregistré pour l''acte MUL-EXNAIS-%s-000001', :an)
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 250000, %L, 'scanner') $q$, :'b', pg_temp.empreinte('scan B')),
  'Un acte encore en attente de paiement ne peut pas recevoir de scan',
  'pas encore payé'
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 250000, %L, 'scanner') $q$, :'c', pg_temp.empreinte('scan C')),
  'Un acte annulé ne peut pas recevoir de scan',
  'annulé'
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'image/gif', 250000, %L, 'scanner') $q$, :'e', pg_temp.empreinte('gif')),
  'Un fichier GIF est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 20000000, %L, 'scanner') $q$, :'e', pg_temp.empreinte('gros')),
  'Un fichier de plus de 15 Mo est refusé',
  'documents_taille_valide'
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 1000, 'abc', 'scanner') $q$, :'e'),
  'Une empreinte de fichier mal formée est refusée',
  'documents_empreinte_format'
);
select test.doit_echouer(
  format($q$ update public.documents_scannes set acte_id = %L where acte_id = %L $q$, :'e', :'a'),
  'Un scan ne peut pas être déplacé vers un autre acte',
  'Modification interdite'
);
select test.doit_echouer(
  format($q$ delete from public.documents_scannes where acte_id = %L $q$, :'a'),
  'Un scan ne peut pas être supprimé',
  'Suppression interdite'
);

-- ---------------------------------------------------------------------
-- 5. Import en lot des anciens registres
-- ---------------------------------------------------------------------
insert into public.lots_import (entite_id, type_acte_id, annee_registre, description)
  values (:'mul', :'nais', 2019, 'Registre des naissances 2019, volume 1');
select id as lot from public.lots_import \gset

insert into public.actes (entite_id, type_acte_id, titulaire_nom, origine, date_acte, numero_registre)
  values (:'mul', :'nais', 'Furaha Espoir', 'archive_ancienne', '2019-05-10', 'Reg. 2019 n° 412');
select id as ancien from public.actes where titulaire_nom = 'Furaha Espoir' \gset

select pg_temp.deposer(public.chemin_archive(:'ancien', 'image/jpeg'));
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, lot_id)
  values (:'ancien', 'image/jpeg', 180000, pg_temp.empreinte('registre 412'), 'lot', :'lot');
select test.verifier(
  (select chemin_stockage = 'MUL/2019/MUL-EXNAIS-2019-000001.jpg' from public.documents_scannes where acte_id = :'ancien'),
  'Ancien acte numérisé en lot : rangé sous MUL/2019/MUL-EXNAIS-2019-000001.jpg'
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom, origine, date_acte)
  values (:'mul', :'dec', 'Ancien décès', 'archive_ancienne', '2019-08-01');
select id as ancien_dec from public.actes where titulaire_nom = 'Ancien décès' \gset
select pg_temp.deposer(public.chemin_archive(:'ancien_dec', 'image/jpeg'));
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, lot_id)
             values (%L, 'image/jpeg', 180000, %L, 'lot', %L) $q$, :'ancien_dec', pg_temp.empreinte('deces 2019'), :'lot'),
  'Un acte de décès est refusé dans un lot déclaré « naissances »',
  'ne correspond pas au lot'
);
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'image/jpeg', 180000, %L, 'lot') $q$, :'ancien_dec', pg_temp.empreinte('deces 2019')),
  'Un import « en lot » sans lot désigné est refusé',
  'documents_lot_coherent'
);
select test.doit_echouer(
  format($q$ update public.lots_import set type_acte_id = %L where id = %L $q$, :'dec', :'lot'),
  'Le type d''acte d''un lot ne peut pas être changé',
  'ne peuvent pas être changés'
);

update public.lots_import set statut = 'ferme' where id = :'lot';
insert into public.actes (entite_id, type_acte_id, titulaire_nom, origine, date_acte)
  values (:'mul', :'nais', 'Après fermeture', 'archive_ancienne', '2019-06-01');
select id as tardif from public.actes where titulaire_nom = 'Après fermeture' \gset
select pg_temp.deposer(public.chemin_archive(:'tardif', 'image/jpeg'));
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, lot_id)
             values (%L, 'image/jpeg', 180000, %L, 'lot', %L) $q$, :'tardif', pg_temp.empreinte('tardif'), :'lot'),
  'Un lot fermé n''accepte plus de documents',
  'lot est fermé'
);
select test.doit_echouer(
  format($q$ update public.lots_import set statut = 'ouvert' where id = %L $q$, :'lot'),
  'Un lot fermé ne peut pas être rouvert',
  'lot est fermé'
);

-- ---------------------------------------------------------------------
-- 6. Actes payés non archivés et taux d'archivage
-- ---------------------------------------------------------------------
select test.verifier(
  (select array_agg(titulaire_nom order by titulaire_nom) = array['Acte D exonéré', 'Acte E']
   from public.vue_actes_non_archives where entite_id = :'mul'),
  'Actes payés ou exonérés sans scan : D (exonéré) et E (payé) ; A est archivé, B pas encore payé, C annulé'
);
select test.verifier(
  (select journee_paiement = public.aujourdhui() and jours_ecoules = 0
   from public.vue_actes_non_archives where titulaire_nom = 'Acte E'),
  'Pour chaque acte non archivé : la journée du paiement et le nombre de jours écoulés'
);
select test.verifier(
  (select actes_payes = 3 and actes_archives = 1 and taux_archivage_pct = 33.3
   from public.vue_taux_archivage where entite_code = 'MUL'),
  'Taux d''archivage de Mulongwe : 1 acte archivé sur 3 payés = 33,3 %'
);
select test.verifier(
  (select actes_payes = 0 and taux_archivage_pct is null from public.vue_taux_archivage where entite_code = 'KAV'),
  'Kavimvira, sans acte payé : pas de taux calculé'
);

-- ---------------------------------------------------------------------
-- 7. Signalement à la clôture (non bloquant)
-- ---------------------------------------------------------------------
select
  coalesce(sum(montant_recu) filter (where statut = 'valide' and devise_recue = 'USD'), 0) as usd,
  coalesce(sum(montant_recu) filter (where statut = 'valide' and devise_recue = 'CDF'), 0) as cdf
from public.recus where entite_id = :'mul' and journee = public.aujourdhui() \gset

select from public.cloturer_journee(:'mul', :usd, :cdf);
select test.verifier(
  (select nb_actes_sans_scan = 2 from public.clotures_caisse where entite_id = :'mul' and journee = public.aujourdhui()),
  'La clôture passe, et signale 2 actes du jour payés ou exonérés sans scan'
);

-- Après la clôture, le scan reste possible (rattrapage).
-- (Le fichier de l'acte E a déjà été déposé plus haut, à la section 4.)
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
  values (:'e', 'application/pdf', 240000, pg_temp.empreinte('scan E'), 'fichier');
select test.verifier(
  not exists (select 1 from public.vue_actes_non_archives where titulaire_nom = 'Acte E'),
  'Après la clôture, l''Officier peut encore rattraper le scan oublié'
);

-- ---------------------------------------------------------------------
-- 8. Verrouillage par défaut
-- ---------------------------------------------------------------------
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000001', 'mulongwe.officier', 'Officier test', 'officier', :'mul');
select test.se_connecter('00000000-0000-0000-0000-000000000001');
select test.verifier(
  (select count(*) from public.documents_scannes) = 0 and (select count(*) from public.lots_import) = 0,
  'Sans règle d''accès, un utilisateur connecté ne voit ni scans ni lots'
);
select test.se_deconnecter();

rollback;
