-- =====================================================================
-- TESTS du fichier 22 : PHOTOS PAR TÉLÉPHONE
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000091');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati Mugisho', 'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema Furaha',   'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000091', 'kavimvira.officier', 'Amani Byamungu', 'officier', :'kav', false, false);

insert into public.taux_change (entite_id, taux) values (:'mul', 2850);
create function pg_temp.acte(p_nom text, p_payer boolean) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values ((select id from public.entites where code = 'MUL'), (select id from public.types_actes where code = 'EXNAIS'), p_nom, 'en_attente_paiement')
  returning id into v;
  if p_payer then perform public.encaisser(v); end if;
  return v;
end $$;
-- Une « photo » JPEG de 300 octets, en base64
create function pg_temp.jpeg(p_graine text) returns text
language sql as $$ select encode('\xffd8ffe0'::bytea || extensions.digest(p_graine, 'sha256') || convert_to(repeat('x', 264), 'UTF8'), 'base64') $$;

select pg_temp.acte('MUGISHO Bahati Jean', true) as p \gset
select pg_temp.acte('Kahindo Aline', false) as u \gset

-- ---------------------------------------------------------------------
-- 1. L'ordinateur de l'Officier crée le lien
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select id as t, secret, expire_le from public.creer_transfert_photo(:'p') \gset
select test.verifier(length(:'secret') = 43 and :'secret' ~ '^[A-Za-z0-9_-]+$',
  'Lien : secret de 256 bits, utilisable dans une adresse');
select test.verifier(:'expire_le'::timestamptz between now() + interval '9 minutes 50 seconds' and now() + interval '10 minutes 10 seconds',
  'Lien : valable 10 minutes');
select test.doit_echouer(format($q$ select public.creer_transfert_photo(%L) $q$, :'u'),
  'Lien : refusé pour un acte pas encore payé', 'pas encore payé');
select test.doit_echouer($q$ select count(*) from public.transferts_photo $q$,
  'Tables : aucun accès direct, même pour l''Officier', 'permission denied');
select test.se_deconnecter();
select test.verifier(
  (select empreinte_secret = encode(extensions.digest(:'secret', 'sha256'), 'hex') and position(:'secret' in empreinte_secret) = 0
   from public.transferts_photo where id = :'t'),
  'Base : seule l''empreinte du secret est gardée');

select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.creer_transfert_photo(%L) $q$, :'p'),
  'Lien : le Caissier ne peut pas en créer', 'Seul l''Officier');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000091');
select test.doit_echouer(format($q$ select public.creer_transfert_photo(%L) $q$, :'p'),
  'Lien : l''Officier d''une autre entité ne voit pas l''acte', 'Acte introuvable');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Le téléphone, SANS session (rôle anon), avec le secret
-- ---------------------------------------------------------------------
set role anon;
select test.verifier(
  (select identifiant like 'MUL-EXNAIS-%' and titulaire = 'MUGISHO Bahati Jean' and pages = 0 and not termine
   from public.lire_transfert_photo(:'secret')),
  'Téléphone : voit l''acte à photographier');
select test.doit_echouer($q$ select public.lire_transfert_photo('mauvais-secret') $q$,
  'Téléphone : un autre secret ne donne rien', 'plus valable');
select test.verifier(public.ajouter_page_photo(:'secret', pg_temp.jpeg('page 1'), 1654, 2339) = 1
  and public.ajouter_page_photo(:'secret', pg_temp.jpeg('page 2'), 1654, 2339) = 2,
  'Téléphone : dépose 2 pages');
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, %L, 100, 100) $q$, :'secret', encode('pas une photo'::bytea, 'base64')),
  'Téléphone : seulement des photos JPEG', 'JPEG');
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, '@@@', 100, 100) $q$, :'secret'),
  'Téléphone : contenu illisible refusé', 'illisible');
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, %L, 10, 100) $q$, :'secret', pg_temp.jpeg('x')),
  'Téléphone : dimensions invalides refusées', 'Dimensions');
select test.doit_echouer($q$ select public.creer_transfert_photo(gen_random_uuid()) $q$,
  'Téléphone : ne peut pas créer de lien', 'permission denied');
select test.doit_echouer(format($q$ select public.recuperer_pages_photo(%L) $q$, :'t'),
  'Téléphone : ne peut pas reprendre les pages', 'permission denied');
reset role;

-- ---------------------------------------------------------------------
-- 3. L'ordinateur reprend les pages (elles sont alors effacées)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.recuperer_pages_photo(%L) $q$, :'t'),
  'Ordinateur : le Caissier ne reprend pas les pages', 'Envoi introuvable');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select public.recuperer_pages_photo(:'t') as recu \gset
select test.verifier(
  jsonb_array_length((:'recu'::jsonb) -> 'pages') = 2
  and (:'recu'::jsonb) #>> '{pages,0,numero}' = '1'
  and decode((:'recu'::jsonb) #>> '{pages,1,jpeg}', 'base64') = decode(pg_temp.jpeg('page 2'), 'base64')
  and (:'recu'::jsonb) #>> '{pages,0,largeur}' = '1654'
  and (:'recu'::jsonb) ->> 'termine' = 'false',
  'Ordinateur : reçoit les 2 pages, dans l''ordre, intactes');
select test.verifier(jsonb_array_length(public.recuperer_pages_photo(:'t') -> 'pages') = 0,
  'Ordinateur : une page reprise n''est pas renvoyée (effacée)');
select test.se_deconnecter();
select test.verifier((select count(*) = 0 from public.pages_photo), 'Base : aucune photo ne reste après reprise');

-- ---------------------------------------------------------------------
-- 4. Fin de l'envoi, 10 pages au plus, expiration
-- ---------------------------------------------------------------------
set role anon;
select count(*) as nb_ajoutees from (select public.ajouter_page_photo(:'secret', pg_temp.jpeg('page ' || n), 1654, 2339) from generate_series(3, 10) n) x \gset
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, %L, 1654, 2339) $q$, :'secret', pg_temp.jpeg('page 11')),
  'Téléphone : 10 pages au plus', '10 pages au plus');
select public.terminer_transfert_photo(:'secret');
select test.verifier((select termine from public.lire_transfert_photo(:'secret')), 'Téléphone : envoi terminé');
reset role;

select test.se_connecter('00000000-0000-0000-0000-000000000081');
select id as t2, secret as secret2 from public.creer_transfert_photo(:'p') \gset
select test.se_deconnecter();
set role anon;
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, %L, 1654, 2339) $q$, :'secret', pg_temp.jpeg('tard')),
  'Téléphone : plus rien après « terminé »', 'déjà terminé');
reset role;
update public.transferts_photo set expire_le = now() - interval '1 second' where id = :'t2';
set role anon;
select test.doit_echouer(format($q$ select public.ajouter_page_photo(%L, %L, 1654, 2339) $q$, :'secret2', pg_temp.jpeg('expire')),
  'Téléphone : lien expiré après 10 minutes', 'plus valable');
reset role;

-- Ménage : un transfert expiré depuis plus d'une heure disparaît avec ses pages
update public.transferts_photo set expire_le = now() - interval '2 hours' where id = :'t';
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select from public.creer_transfert_photo(:'p');
select test.se_deconnecter();
select test.verifier(
  not exists (select 1 from public.transferts_photo where id = :'t') and not exists (select 1 from public.pages_photo where transfert_id = :'t')
  and exists (select 1 from public.transferts_photo where id = :'t2'),
  'Ménage : les transferts expirés depuis plus d''une heure sont effacés, avec leurs pages');

rollback;
