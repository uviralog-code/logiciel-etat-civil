-- =====================================================================
-- TESTS du fichier 21 : ARCHIVER UN ACTE PAR FICHIER
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset
select id as nais from public.types_actes where code = 'EXNAIS' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000091');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Abbé Justin Nkunzi', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati Mugisho',     'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema Furaha',       'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000091', 'kavimvira.officier', 'Amani Byamungu',     'officier', :'kav', false, false);

-- Actes de départ (maintenance) : P et Q payés à Mulongwe, U en attente, K payé à Kavimvira
insert into public.taux_change (entite_id, taux) values (:'mul', 2850), (:'kav', 2850);
create function pg_temp.acte(p_entite uuid, p_nom text, p_payer boolean) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (p_entite, (select id from public.types_actes where code = 'EXNAIS'), p_nom, 'en_attente_paiement')
  returning id into v;
  if p_payer then perform public.encaisser(v); end if;
  return v;
end $$;
create function pg_temp.empreinte(p_contenu text) returns text
language sql as $$ select encode(extensions.digest(p_contenu, 'sha256'), 'hex') $$;

select pg_temp.acte(:'mul', 'Acte P', true)  as p \gset
select pg_temp.acte(:'mul', 'Acte Q', true)  as q \gset
select pg_temp.acte(:'mul', 'Acte U', false) as u \gset
select pg_temp.acte(:'kav', 'Acte K', true)  as k \gset
select public.chemin_archive(:'p', 'application/pdf') as chemin_p \gset
select public.chemin_archive(:'u', 'application/pdf') as chemin_u \gset
select public.chemin_archive(:'k', 'application/pdf') as chemin_k \gset

-- ---------------------------------------------------------------------
-- 1. PDF seulement
-- ---------------------------------------------------------------------
select test.verifier(
  (select allowed_mime_types = array['application/pdf'] and file_size_limit = 15728640 from storage.buckets where id = 'archives'),
  'Espace « archives » : PDF seulement, 15 Mo au plus');

-- ---------------------------------------------------------------------
-- 2. Dépôt : seulement à l'emplacement prévu
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.verifier(public.depot_archive_autorise(:'chemin_p'), 'Officier : peut déposer à l''emplacement prévu de l''acte payé P');
select test.verifier(not public.depot_archive_autorise(replace(:'chemin_p', '.pdf', '-v2.pdf')),
  '… pas sous « -v2 » tant que la version 1 n''existe pas');
select test.verifier(not public.depot_archive_autorise(replace(:'chemin_p', '.pdf', '.jpg')), '… pas en JPEG');
select test.verifier(not public.depot_archive_autorise('MUL/2026/autre-nom.pdf'), '… pas sous un autre nom');
select test.verifier(not public.depot_archive_autorise(replace(:'chemin_p', 'MUL/2026/', 'MUL/2025/')), '… pas dans un autre dossier');
select test.verifier(not public.depot_archive_autorise(:'chemin_u'), '… pas pour un acte pas encore payé');
select test.verifier(not public.depot_archive_autorise(:'chemin_k'), '… pas pour un acte de Kavimvira');

insert into storage.objects (bucket_id, name, metadata)
  values ('archives', :'chemin_p', '{"size": 120000, "mimetype": "application/pdf"}');
select test.verifier((select count(*) = 1 from storage.objects where name = :'chemin_p'), 'Officier : dépose le fichier de P');
select test.doit_echouer(
  format($q$ insert into storage.objects (bucket_id, name) values ('archives', %L) $q$, :'chemin_u'),
  'Officier : ne peut rien déposer pour un acte en attente de paiement', 'row-level security');
select test.doit_echouer(
  $q$ insert into storage.objects (bucket_id, name) values ('archives', 'MUL/2026/photo-perso.pdf') $q$,
  'Officier : ne peut rien déposer sous un nom libre', 'row-level security');

-- Envoi interrompu puis repris : l'emplacement prévu peut être réécrit
update storage.objects set metadata = '{"size": 210000, "mimetype": "application/pdf"}' where name = :'chemin_p';
select test.verifier((select (metadata ->> 'size') = '210000' from storage.objects where name = :'chemin_p'),
  'Envoi repris : le fichier pas encore enregistré peut être remplacé');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.verifier(not public.depot_archive_autorise(:'chemin_p'), 'Caissier : ne dépose pas de scan');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier(not public.depot_archive_autorise(:'chemin_p'), 'Administrateur : ne dépose pas de scan');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Contrôle de l'empreinte avant l'envoi, puis enregistrement
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.verifier(public.verifier_empreinte_scan(:'p', pg_temp.empreinte('scan P')) is null,
  'Avant l''envoi : fichier jamais vu, aucun message');
select test.doit_echouer(format($q$ select public.verifier_empreinte_scan(%L, 'abc') $q$, :'p'),
  'Avant l''envoi : empreinte mal formée refusée', 'Empreinte invalide');
select test.doit_echouer(format($q$ select public.verifier_empreinte_scan(%L, %L) $q$, :'k', pg_temp.empreinte('x')),
  'Avant l''envoi : acte d''une autre entité « introuvable »', 'Acte introuvable');

select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'image/jpeg', 1000, %L, 'fichier') $q$, :'p', pg_temp.empreinte('jpeg')),
  'Enregistrement : un scan qui n''est pas un PDF est refusé', 'doit être un fichier PDF');

insert into public.documents_scannes (acte_id, type_mime, taille_octets, nb_pages, empreinte_sha256, mode_import)
  values (:'p', 'application/pdf', 999, 2, pg_temp.empreinte('scan P'), 'fichier');
select test.verifier(
  (select version = 1 and chemin_stockage = :'chemin_p' and taille_octets = 210000 and nb_pages = 2
          and importe_par = '00000000-0000-0000-0000-000000000081'
   from public.documents_scannes where acte_id = :'p'),
  'Enregistrement : version 1, taille lue dans le fichier réellement déposé (210 000 et non 999 octets déclarés)');

-- Le fichier archivé ne peut plus être réécrit (aucun effet)
update storage.objects set metadata = '{"size": 1, "mimetype": "application/pdf"}' where name = :'chemin_p';
select test.se_deconnecter();
select test.verifier((select (metadata ->> 'size') = '210000' from storage.objects where name = :'chemin_p'),
  'Fichier archivé : ne peut plus être remplacé, même par l''Officier');

-- ---------------------------------------------------------------------
-- 4. Même fichier déjà déposé
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.verifier(
  public.verifier_empreinte_scan(:'q', pg_temp.empreinte('scan P'))
    = format('Ce fichier est déjà enregistré pour l''acte %s. Vérifiez que vous avez scanné le bon document.',
             (select identifiant from public.actes where id = :'p')),
  'Doublon dans la même entité : l''ID de l''autre acte est indiqué');
select test.verifier(
  public.verifier_empreinte_scan(:'p', pg_temp.empreinte('scan P')) like 'Ce fichier est identique au scan déjà archivé pour cet acte (version 1)%',
  'Même fichier pour le même acte : rien à remplacer');
select public.chemin_archive(:'q', 'application/pdf') as chemin_q \gset
insert into storage.objects (bucket_id, name, metadata) values ('archives', :'chemin_q', '{"size": 5000, "mimetype": "application/pdf"}');
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 5000, %L, 'fichier') $q$, :'q', pg_temp.empreinte('scan P')),
  'Doublon : l''enregistrement est refusé aussi par la base', 'déjà enregistré pour l''acte');
select test.se_deconnecter();

-- Kavimvira dépose le même fichier : on ne lui révèle pas l'ID de Mulongwe
select test.se_connecter('00000000-0000-0000-0000-000000000091');
select test.verifier(
  public.verifier_empreinte_scan(:'k', pg_temp.empreinte('SCAN P ')) is null
  and public.verifier_empreinte_scan(:'k', upper(pg_temp.empreinte('scan P')))
      = 'Ce fichier est déjà enregistré pour un acte d''une autre entité. Vérifiez que vous avez scanné le bon document.',
  'Doublon dans une autre entité : message sans l''ID de l''acte');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 5. Refaire le scan : version 2 avec motif
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select public.chemin_archive(:'p', 'application/pdf') as chemin_p2 \gset
select test.verifier(:'chemin_p2' = replace(:'chemin_p', '.pdf', '-v2.pdf') and public.depot_archive_autorise(:'chemin_p2'),
  'Refaire le scan : nouvel emplacement « -v2.pdf » autorisé');
insert into storage.objects (bucket_id, name, metadata) values ('archives', :'chemin_p2', '{"size": 300000, "mimetype": "application/pdf"}');
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 1, %L, 'fichier') $q$, :'p', pg_temp.empreinte('scan P v2')),
  'Refaire le scan : motif obligatoire', 'documents_remplacement_motive');
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import, motif_remplacement)
  values (:'p', 'application/pdf', 1, pg_temp.empreinte('scan P v2'), 'fichier', '  Page 2 illisible  ');
select test.verifier(
  (select version = 2 and motif_remplacement = 'Page 2 illisible' and taille_octets = 300000
   from public.vue_document_actuel where acte_id = :'p'),
  'Refaire le scan : la version 2 fait foi, avec son motif ; la version 1 est gardée');
select test.se_deconnecter();

-- Un fichier déposé à l'emplacement prévu mais qui n'est pas un PDF
select public.chemin_archive(:'q', 'application/pdf') as chemin_q \gset
update storage.objects set metadata = '{"size": 5000, "mimetype": "image/jpeg"}' where name = :'chemin_q';
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.doit_echouer(
  format($q$ insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
             values (%L, 'application/pdf', 5000, %L, 'fichier') $q$, :'q', pg_temp.empreinte('scan Q')),
  'Le format du fichier réellement déposé fait foi', 'n''est pas un PDF');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 6. Fonctions réservées
-- ---------------------------------------------------------------------
select test.verifier(
  not has_function_privilege('anon', 'public.verifier_empreinte_scan(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.message_scan_en_double(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.depot_archive_autorise(text)', 'execute'),
  'Droits : contrôle d''empreinte réservé aux agents connectés ; message interne non appelable');

rollback;
