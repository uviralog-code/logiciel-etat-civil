-- =====================================================================
-- TESTS du fichier 09 : LA RECHERCHE
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

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000021');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Administrateur', 'admin',    null,   true),
  ('00000000-0000-0000-0000-000000000011', 'mulongwe.officier',  'Officier MUL',   'officier', :'mul', false),
  ('00000000-0000-0000-0000-000000000021', 'kavimvira.officier', 'Officier KAV',   'officier', :'kav', false);

insert into public.types_actes (numero, code, libelle, famille, modele_fiche) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',         'naissance'),
  ( 3, 'MAR',    'Célébration de mariage',       'acte_etat_civil', 'mariage'),
  ( 2, 'DEC',    'Acte de décès',                'acte_etat_civil', 'deces');
select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as mar  from public.types_actes where code = 'MAR'    \gset
select id as dec  from public.types_actes where code = 'DEC'    \gset
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis) values
  (:'nais', 30, 'USD', current_date - 100), (:'mar', 75, 'USD', current_date - 100), (:'dec', 15000, 'CDF', current_date - 100);

select extract(year from public.aujourdhui())::int as an \gset

-- Les personnes à retrouver
insert into public.actes (entite_id, type_acte_id, titulaire_nom, demandeur_nom) values
  (:'mul', :'nais', 'MUGISHO Bahati Jean', 'Mugisho Pierre'),        -- MUL-EXNAIS-…-000001
  (:'mul', :'nais', 'Neema Furaha',        null),                    -- …-000002
  (:'mul', :'nais', 'Élise Ngoma',         null);                    -- …-000003
insert into public.actes (entite_id, type_acte_id, titulaire_nom, titulaire_2_nom)
  values (:'mul', :'mar', 'Byamungu Amani', 'Mapendo Grace');
insert into public.actes (entite_id, type_acte_id, titulaire_nom)
  values (:'mul', :'dec', 'Mugisho Bahati Jean');                      -- homonyme, autre type
insert into public.actes (entite_id, type_acte_id, titulaire_nom, origine, date_acte, numero_registre)
  values (:'mul', :'nais', 'Furaha Espoir', 'archive_ancienne', '2019-05-10', 'Reg. 2019 n° 412');
insert into public.actes (entite_id, type_acte_id, titulaire_nom)
  values (:'kav', :'nais', 'Kabila Ndoole');

-- 300 actes « de bruit » pour vérifier qu'on trouve la bonne personne au milieu de la foule
insert into public.actes (entite_id, type_acte_id, titulaire_nom)
  select :'mul', :'nais', 'Personne ' || g || ' Citoyen' from generate_series(1, 300) g;

-- Le premier acte est payé puis délivré (pour tester le filtre par statut)
update public.actes set statut = 'en_attente_paiement' where titulaire_nom = 'MUGISHO Bahati Jean';
update public.actes set statut = 'paye'                where titulaire_nom = 'MUGISHO Bahati Jean';

-- Raccourci : identifiants trouvés, triés
create function pg_temp.trouves(p_texte text, p_type uuid default null, p_annee int default null,
                                p_statut public.statut_acte default null, p_limite int default 50)
returns text[] language sql as $$
  select array_agg(r.identifiant order by r.identifiant)
  from public.rechercher_actes(p_texte, p_type, p_annee, p_statut, p_limite) r
$$;

select format('MUL-EXNAIS-%s-000001', :an) as id1 \gset

-- ---------------------------------------------------------------------
-- 1. Recherche par ID
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 1 and min(correspondance) = 'id_exact' and min(titulaire_nom) = 'MUGISHO Bahati Jean'
   from public.rechercher_actes(:'id1')),
  'ID complet : l''acte exact est trouvé'
);
select test.verifier(
  pg_temp.trouves(format('  mul-exnais-%s-000001 ', :an)) = array[:'id1'],
  'ID en minuscules avec des espaces : trouvé quand même'
);
select test.verifier(
  pg_temp.trouves(format('MUL-EXNAIS-%s-1', :an)) = array[:'id1'],
  'ID sans les zéros (…-1 au lieu de …-000001) : trouvé quand même'
);
select test.verifier(
  pg_temp.trouves(format('MUL-EXNAIS-%s-999999', :an)) is null,
  'ID inexistant : aucun résultat'
);
select test.verifier(
  (select count(*) = 50 and bool_and(correspondance = 'id_debut')
   from public.rechercher_actes(format('MUL-EXNAIS-%s', :an))),
  'Début d''ID (MUL-EXNAIS-année) : liste la série, limitée à 50 résultats par défaut'
);
select test.verifier(
  pg_temp.trouves('MUL-EXNAIS-2019') = array['MUL-EXNAIS-2019-000001'],
  'Début d''ID d''une ancienne année : retrouve l''archive de 2019'
);

-- ---------------------------------------------------------------------
-- 2. Recherche par nom
-- ---------------------------------------------------------------------
select test.verifier(
  :'id1' = any(pg_temp.trouves('Bahati Mugisho')),
  'Noms dans un autre ordre (« Bahati Mugisho ») : trouvé'
);
select test.verifier(
  :'id1' = any(pg_temp.trouves('mugiso bahaty')),
  'Fautes de frappe (« mugiso bahaty ») : trouvé quand même'
);
select test.verifier(
  pg_temp.trouves('elise') = array[format('MUL-EXNAIS-%s-000003', :an)],
  'Sans accent (« elise ») : retrouve « Élise Ngoma »'
);
select test.verifier(
  pg_temp.trouves('NEEMA') = array[format('MUL-EXNAIS-%s-000002', :an)],
  'En majuscules (« NEEMA ») : retrouve « Neema Furaha »'
);
select test.verifier(
  pg_temp.trouves('Mapendo') = array[format('MUL-MAR-%s-000001', :an)],
  'Nom du second époux (« Mapendo ») : retrouve l''acte de mariage'
);
select test.verifier(
  :'id1' = any(pg_temp.trouves('Pierre Mugisho')),
  'Nom du demandeur (« Pierre Mugisho », le père) : retrouve l''acte'
);
select test.verifier(
  pg_temp.trouves('Pierre Mugisho') = array[:'id1'],
  '« Pierre Mugisho » ne remonte pas l''homonyme décédé (Pierre n''y figure pas)'
);
select test.verifier(
  (select array_agg(type_code order by type_code) = array['DEC', 'EXNAIS']
   from public.rechercher_actes('Mugisho Bahati Jean')),
  'Homonymes : les deux actes au même nom sont proposés (naissance et décès)'
);
select test.verifier(
  (select titulaire_nom = 'Furaha Espoir' from public.rechercher_actes('n° 412')),
  'Numéro d''un ancien registre papier (« n° 412 ») : retrouve l''archive'
);
select test.verifier(
  pg_temp.trouves('Zzzz Xxxxx') is null,
  'Nom inconnu : aucun résultat'
);
select test.doit_echouer(
  $q$ select * from public.rechercher_actes('a') $q$,
  'Moins de 2 caractères : la recherche demande d''en taper davantage', 'au moins 2 caractères'
);

-- Le meilleur résultat arrive en premier : une saisie exacte passe devant
-- une saisie approchante
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'nais', 'Neemaa Furahaa');
select test.verifier(
  (select array_agg(titulaire_nom) = array['Neema Furaha', 'Neemaa Furahaa']
   from (select titulaire_nom from public.rechercher_actes('Neema Furaha') limit 2) r),
  'Le meilleur résultat est classé en premier (« Neema Furaha » devant « Neemaa Furahaa »)'
);

-- ---------------------------------------------------------------------
-- 3. Filtres et limite
-- ---------------------------------------------------------------------
select test.verifier(
  pg_temp.trouves('Mugisho Bahati', :'dec') = array[format('MUL-DEC-%s-000001', :an)],
  'Filtre par type d''acte (décès) : seul l''acte de décès reste'
);
select test.verifier(
  pg_temp.trouves('Furaha', null, 2019) = array['MUL-EXNAIS-2019-000001'],
  'Filtre par année (2019) : seule l''archive de 2019 reste'
);
select test.verifier(
  pg_temp.trouves('Mugisho', null, null, 'paye') = array[:'id1'],
  'Filtre par statut (payé) : seul l''acte payé reste'
);
select test.verifier(
  (select count(*) = 10 from public.rechercher_actes('Personne Citoyen', null, null, null, 10)),
  'Limite choisie (10) : 10 résultats parmi les 300 « Personne … Citoyen »'
);
select test.verifier(
  (select count(*) = 200 from public.rechercher_actes('Personne Citoyen', null, null, null, 100000)),
  'Limite plafonnée à 200 résultats, même si on en demande plus'
);
select test.verifier(
  (select bool_and(not a_un_scan) from public.rechercher_actes('Mugisho')),
  'Chaque résultat indique si l''acte a déjà son scan'
);

-- ---------------------------------------------------------------------
-- 4. La recherche respecte les droits
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000021');  -- Officier de Kavimvira
select test.verifier(
  pg_temp.trouves('Mugisho') is null and pg_temp.trouves(:'id1') is null,
  'Officier de Kavimvira : ne trouve ni par nom ni par ID les actes de Mulongwe'
);
select test.verifier(
  pg_temp.trouves('Kabila') = array[format('KAV-EXNAIS-%s-000001', :an)],
  'Officier de Kavimvira : trouve les actes de sa propre entité'
);
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000011');  -- Officier de Mulongwe
select test.verifier(
  pg_temp.trouves('Kabila') is null,
  'Officier de Mulongwe : ne trouve pas les actes de Kavimvira'
);
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-00000000000a');  -- Admin
select test.verifier(
  (select count(*) = 1 and min(entite_code) = 'KAV' from public.rechercher_actes('Kabila'))
  and :'id1' = any(pg_temp.trouves('Mugisho')),
  'Admin : cherche dans toutes les entités, avec le code de l''entité dans chaque résultat'
);
select test.se_deconnecter();

set role anon;
select test.doit_echouer(
  $q$ select * from public.rechercher_actes('Mugisho') $q$,
  'Visiteur non connecté : ne peut pas rechercher', 'permission denied'
);
reset role;

-- ---------------------------------------------------------------------
-- 5. Rapidité : l'index de recherche est bien utilisé
-- ---------------------------------------------------------------------
create function pg_temp.plan(p_requete text) returns text
language plpgsql as $$
declare ligne text; tout text := '';
begin
  for ligne in execute 'explain ' || p_requete loop
    tout := tout || ligne || ' ';
  end loop;
  return tout;
end $$;

set local enable_seqscan = off;
select test.verifier(
  pg_temp.plan($q$ select id from public.actes where recherche_noms operator(extensions.%>) 'mugisho' $q$)
    like '%actes_recherche_noms_trgm_idx%',
  'La recherche par nom utilise l''index rapide (pas de lecture de toute la table)'
);
select test.verifier(
  pg_temp.plan($q$ select id from public.actes where identifiant like 'MUL-EXNAIS-2026%' $q$)
    like '%actes_identifiant_prefixe_idx%',
  'La recherche par début d''ID utilise l''index de l''identifiant'
);

rollback;
