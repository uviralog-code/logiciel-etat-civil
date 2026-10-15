-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 11 : DONNÉES DE DÉPART
-- ---------------------------------------------------------------------
-- 1. Les 4 entités d'Uvira.
-- 2. Le catalogue des 26 actes (fiche « Tarif des actes de l'état civil »,
--    Bureau de l'état civil de la commune de Mulongwe, 2026), avec leur
--    code, leur famille, leur fiche de détails et leur couleur.
-- 3. La grille tarifaire commune (en vigueur au 1er janvier 2026).
--
-- Ce fichier peut être rejoué sans risque : ce qui existe déjà n'est ni
-- dupliqué ni écrasé.
-- Les comptes utilisateurs ne sont PAS créés ici : ils le seront par
-- l'administrateur (étape 4), avec leurs mots de passe.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LES 4 ENTITÉS
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune'),
  ('KAL', 'Commune de Kalundu',   'commune'),
  ('BAV', 'Chefferie des Bavira', 'chefferie')
on conflict (code) do nothing;


-- ---------------------------------------------------------------------
-- 2. LE CATALOGUE DES 26 ACTES
-- ---------------------------------------------------------------------
-- Couleurs à l'écran :
--   naissance = vert, mariage = violet, décès = gris foncé,
--   attestations = bleu, certificats = turquoise, autorisations = orange.
insert into public.types_actes (numero, code, libelle, famille, modele_fiche, tarif_distinct_etranger, couleur) values
  ( 1, 'NOTNAI', 'Acte de notoriété supplétif à un acte de naissance',                                              'acte_etat_civil', 'naissance', false, '#2E7D32'),
  ( 2, 'DEC',    'Acte de décès',                                                                                   'acte_etat_civil', 'deces',     false, '#455A64'),
  ( 3, 'MAR',    'Célébration et affichage de mariage, acte de mariage, livret de ménage et procès-verbal de proclamation de mariage',
                                                                                                                    'acte_etat_civil', 'mariage',   false, '#6A1B9A'),
  ( 4, 'DEPMAR', 'Déplacement de l''Officier de l''état civil pour la célébration de mariage',                       'acte_etat_civil', 'mariage',   false, '#6A1B9A'),
  ( 5, 'ATRES',  'Attestation de résidence',                                                                        'attestation',     'generique', true,  '#1565C0'),
  ( 6, 'ATNAI',  'Attestation de naissance',                                                                        'attestation',     'naissance', true,  '#2E7D32'),
  ( 7, 'CBCVM',  'Certificat de bonne conduite, vie et mœurs',                                                      'certificat',      'generique', true,  '#00838F'),
  ( 8, 'ATCEL',  'Attestation de célibat',                                                                          'attestation',     'generique', true,  '#1565C0'),
  ( 9, 'ATIDC',  'Attestation d''identité complète',                                                                'attestation',     'generique', false, '#1565C0'),
  (10, 'ATDEC',  'Attestation de décès',                                                                            'attestation',     'deces',     false, '#455A64'),
  (11, 'AUTOMB', 'Autorisation d''érection d''une tombe',                                                           'autorisation',    'generique', false, '#E65100'),
  (12, 'ATDECD', 'Attestation de décès à domicile',                                                                 'attestation',     'deces',     false, '#455A64'),
  (13, 'PINHUM', 'Permis d''inhumation',                                                                            'autorisation',    'generique', false, '#E65100'),
  (14, 'PEXHUM', 'Permis d''exhumation',                                                                            'autorisation',    'generique', false, '#E65100'),
  (15, 'ATCOMP', 'Attestation de composition familiale',                                                            'attestation',     'generique', true,  '#1565C0'),
  (16, 'ATVEUV', 'Attestation de veuvage',                                                                          'attestation',     'generique', false, '#1565C0'),
  (17, 'ATLOG',  'Attestation de logement',                                                                         'attestation',     'generique', false, '#1565C0'),
  (18, 'ATMAR',  'Attestation de mariage',                                                                          'attestation',     'mariage',   true,  '#6A1B9A'),
  (19, 'AUTRAN', 'Autorisation de transfert de corps',                                                              'autorisation',    'generique', false, '#E65100'),
  (20, 'AUPAV',  'Autorisation parentale de voyage',                                                                'autorisation',    'generique', false, '#E65100'),
  (21, 'ATPEC',  'Attestation de prise en charge',                                                                  'attestation',     'generique', false, '#1565C0'),
  (22, 'EXNAIS', 'Extrait d''acte de naissance',                                                                    'extrait',         'naissance', false, '#2E7D32'),
  (23, 'EXMAR',  'Extrait d''acte de mariage',                                                                      'extrait',         'mariage',   false, '#6A1B9A'),
  (24, 'EXDEC',  'Extrait d''acte de décès',                                                                        'extrait',         'deces',     false, '#455A64'),
  (25, 'ATPERT', 'Attestation de perte de pièce',                                                                   'attestation',     'generique', false, '#1565C0'),
  (26, 'CVIE',   'Certificat de vie',                                                                               'certificat',      'generique', false, '#00838F')
on conflict (code) do nothing;


-- ---------------------------------------------------------------------
-- 3. LA GRILLE TARIFAIRE COMMUNE
-- ---------------------------------------------------------------------
-- Montants en $ : « ou son équivalent en FC » (conversion au taux du jour
-- saisi par le Caissier de chaque entité).
-- N° 12 (attestation de décès à domicile) : 9 000 FC, montant ajouté à la
-- main sur la fiche d'origine.
with grille (code, categorie, montant, devise) as (
  values
    ('NOTNAI', 'national', 60000, 'CDF'),
    ('DEC',    'national', 15000, 'CDF'),
    ('MAR',    'national',    75, 'USD'),
    ('DEPMAR', 'national',    95, 'USD'),
    ('ATRES',  'national', 18000, 'CDF'), ('ATRES',  'etranger', 39000, 'CDF'),
    ('ATNAI',  'national',  7000, 'CDF'), ('ATNAI',  'etranger', 11000, 'CDF'),
    ('CBCVM',  'national', 11000, 'CDF'), ('CBCVM',  'etranger', 50000, 'CDF'),
    ('ATCEL',  'national',  9000, 'CDF'), ('ATCEL',  'etranger', 30000, 'CDF'),
    ('ATIDC',  'national',  8000, 'CDF'),
    ('ATDEC',  'national',  9000, 'CDF'),
    ('AUTOMB', 'national',   500, 'USD'),
    ('ATDECD', 'national',  9000, 'CDF'),
    ('PINHUM', 'national',  9000, 'CDF'),
    ('PEXHUM', 'national',   500, 'USD'),
    ('ATCOMP', 'national',  9000, 'CDF'), ('ATCOMP', 'etranger', 16000, 'CDF'),
    ('ATVEUV', 'national',  5000, 'CDF'),
    ('ATLOG',  'national',  8000, 'CDF'),
    ('ATMAR',  'national', 13000, 'CDF'), ('ATMAR',  'etranger', 19000, 'CDF'),
    ('AUTRAN', 'national',   300, 'USD'),
    ('AUPAV',  'national',  5000, 'CDF'),
    ('ATPEC',  'national',    20, 'USD'),
    ('EXNAIS', 'national',    30, 'USD'),
    ('EXMAR',  'national',    20, 'USD'),
    ('EXDEC',  'national',    10, 'USD'),
    ('ATPERT', 'national', 18000, 'CDF'),
    ('CVIE',   'national', 18000, 'CDF')
)
insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif, cree_par)
select t.id, g.categorie::public.categorie_tarif, g.montant, g.devise::public.devise,
       date '2026-01-01',
       'Tarif des actes de l''état civil — Bureau de l''état civil, Commune de Mulongwe (2026)',
       null
from grille g
join public.types_actes t on t.code = g.code
on conflict (type_acte_id, categorie, en_vigueur_depuis) do nothing;
