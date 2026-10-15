-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 04 : LES ACTES
-- ---------------------------------------------------------------------
-- 1. Chaque type d'acte indique quelle fiche de détails il utilise.
-- 2. Table centrale "actes" : une ligne par acte, toutes entités confondues.
-- 3. ID unique automatique : MUL-EXNAIS-2026-000123.
-- 4. Prix calculé automatiquement (jamais saisi à la main), puis figé.
-- 5. Cycle de vie contrôlé : seules les étapes prévues sont possibles.
-- 6. Fiches de détails : naissance, mariage, décès.
-- 7. Un acte ne s'efface jamais : on l'annule, avec un motif.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MODÈLE DE FICHE PAR TYPE D'ACTE
-- ---------------------------------------------------------------------
create type public.modele_fiche as enum (
  'naissance',   -- fiche avec enfant, parents, date et lieu de naissance
  'mariage',     -- fiche avec les deux époux, date et lieu de célébration
  'deces',       -- fiche avec défunt, date et lieu du décès
  'generique'    -- fiche simple (nom, demandeur, observations)
);

alter table public.types_actes
  add column modele_fiche public.modele_fiche not null default 'generique';

comment on column public.types_actes.modele_fiche is
  'Fiche de détails à remplir pour ce type d''acte (naissance, mariage, décès ou simple).';

-- Origine d'un acte dans le logiciel
create type public.origine_acte as enum (
  'nouveau',           -- acte établi avec le logiciel (paiement obligatoire ou exonération)
  'archive_ancienne'   -- ancien acte papier numérisé (import en lot)
);


-- ---------------------------------------------------------------------
-- 2. COMPTEURS POUR L'ID UNIQUE
-- ---------------------------------------------------------------------
-- Un compteur par entité, type d'acte et année.
create table public.compteurs_actes (
  entite_id       uuid not null references public.entites (id) on delete restrict,
  type_acte_id    uuid not null references public.types_actes (id) on delete restrict,
  annee           smallint not null,
  dernier_numero  integer not null default 0,
  primary key (entite_id, type_acte_id, annee)
);

comment on table public.compteurs_actes is
  'Dernier numéro attribué par entité, type d''acte et année. Géré automatiquement.';

alter table public.compteurs_actes enable row level security;


-- ---------------------------------------------------------------------
-- 3. LA TABLE CENTRALE DES ACTES
-- ---------------------------------------------------------------------
create table public.actes (
  id                uuid primary key default extensions.gen_random_uuid(),

  -- Identification (attribuée automatiquement, jamais modifiable)
  identifiant       text not null unique,          -- ex. MUL-EXNAIS-2026-000123
  entite_id         uuid not null references public.entites (id) on delete restrict,
  type_acte_id      uuid not null references public.types_actes (id) on delete restrict,
  annee             smallint not null,
  numero_ordre      integer not null,
  origine           public.origine_acte not null default 'nouveau',
  numero_registre   text,                          -- n° inscrit dans le registre papier, si connu

  -- Personnes concernées
  titulaire_nom     text not null,                 -- enfant, défunt, époux, bénéficiaire de l'attestation…
  titulaire_2_nom   text,                          -- seconde personne (épouse pour un mariage)
  demandeur_nom     text,                          -- personne qui fait la démarche, si différente
  demandeur_telephone text,
  categorie         public.categorie_tarif not null default 'national',

  -- Texte de recherche (noms sans accents ni majuscules), calculé automatiquement
  recherche_noms    text generated always as (
                      public.normaliser_texte(
                        coalesce(titulaire_nom, '') || ' ' || coalesce(titulaire_2_nom, '') || ' ' || coalesce(demandeur_nom, '')
                      )
                    ) stored,

  -- Montant dû, calculé automatiquement à partir de la grille, puis figé
  montant_du        numeric(14,2),
  devise_du         public.devise,
  tarif_source      text,                          -- 'commune' ou 'entite'
  tarif_id          uuid,

  -- Cycle de vie
  statut            public.statut_acte not null default 'enregistre',
  date_acte         date not null default current_date,
  delivre_le        timestamptz,
  delivre_par       uuid references public.utilisateurs (id),
  annule_le         timestamptz,
  annule_par        uuid references public.utilisateurs (id),
  motif_annulation  text,
  observations      text,

  -- Traçabilité
  cree_par          uuid references public.utilisateurs (id) default auth.uid(),
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now(),

  constraint actes_numero_unique unique (entite_id, type_acte_id, annee, numero_ordre),
  constraint actes_titulaire_rempli check (btrim(titulaire_nom) <> ''),
  constraint actes_date_pas_future check (date_acte <= current_date),
  constraint actes_tarif_source_valide check (tarif_source is null or tarif_source in ('commune', 'entite')),

  -- Un nouvel acte a toujours un montant ; une archive ancienne n'en a pas
  constraint actes_montant_selon_origine check (
    (origine = 'nouveau' and montant_du > 0 and devise_du is not null)
    or (origine = 'archive_ancienne' and montant_du is null and devise_du is null)
  ),

  -- Une archive ancienne est forcément un acte déjà délivré (ou annulé)
  constraint actes_archive_deja_delivree check (
    origine = 'nouveau' or statut in ('delivre', 'annule')
  ),

  -- Un acte annulé a toujours un motif
  constraint actes_annulation_motivee check (
    statut <> 'annule' or (motif_annulation is not null and btrim(motif_annulation) <> '')
  )
);

comment on table  public.actes             is 'Table centrale : un enregistrement par acte, avec son ID unique, son montant et son statut.';
comment on column public.actes.identifiant is 'ID unique lisible : ENTITÉ-TYPE-ANNÉE-NUMÉRO, ex. MUL-EXNAIS-2026-000123.';
comment on column public.actes.montant_du  is 'Prix calculé automatiquement depuis la grille en vigueur. Figé dès le paiement ou l''exonération.';

create index actes_entite_statut_idx on public.actes (entite_id, statut);
create index actes_entite_date_idx   on public.actes (entite_id, date_acte);
create index actes_type_idx          on public.actes (type_acte_id);

alter table public.actes enable row level security;


-- ---------------------------------------------------------------------
-- 4. CRÉATION D'UN ACTE : ID, ANNÉE ET PRIX AUTOMATIQUES
-- ---------------------------------------------------------------------
create or replace function public.preparer_nouvel_acte()
returns trigger
language plpgsql
security definer          -- doit pouvoir lire les tarifs et tenir les compteurs
set search_path = ''
as $$
declare
  v_code_entite  text;
  v_code_type    text;
  v_numero       integer;
  v_tarif        record;
begin
  -- Entité et type d'acte doivent exister et être actifs
  select e.code into v_code_entite from public.entites e where e.id = new.entite_id and e.active;
  if v_code_entite is null then
    raise exception 'Entité inconnue ou désactivée.' using errcode = 'P0001';
  end if;

  select t.code into v_code_type from public.types_actes t where t.id = new.type_acte_id and t.actif;
  if v_code_type is null then
    raise exception 'Type d''acte inconnu ou désactivé.' using errcode = 'P0001';
  end if;

  -- Statut de départ selon l'origine
  if new.origine = 'nouveau' and new.statut not in ('enregistre', 'en_attente_paiement') then
    raise exception 'Un nouvel acte commence au statut « enregistré » ou « en attente de paiement ».'
      using errcode = 'P0001';
  end if;
  if new.origine = 'archive_ancienne' then
    new.statut := 'delivre';
  end if;

  -- Date d'un nouvel acte : aujourd'hui, ou au plus 7 jours en arrière
  -- (cas d'un acte saisi hors-ligne et synchronisé plus tard).
  -- Empêche d'antidater un acte pour profiter d'un ancien tarif.
  if new.origine = 'nouveau' and new.date_acte < current_date - 7 then
    raise exception 'Un nouvel acte ne peut pas être daté de plus de 7 jours en arrière.'
      using errcode = 'P0001';
  end if;

  -- Année tirée de la date de l'acte
  new.annee := extract(year from new.date_acte)::smallint;

  -- Prix : calculé depuis la grille, jamais saisi à la main
  if new.origine = 'nouveau' then
    select * into v_tarif
    from public.tarif_applicable(new.entite_id, new.type_acte_id, new.categorie, new.date_acte);
    if v_tarif.montant is null then
      raise exception 'Aucun tarif n''est défini pour cet acte à cette date : impossible de l''enregistrer.'
        using errcode = 'P0001';
    end if;
    new.montant_du   := v_tarif.montant;
    new.devise_du    := v_tarif.devise;
    new.tarif_source := v_tarif.source;
    new.tarif_id     := v_tarif.tarif_id;
  else
    new.montant_du   := null;
    new.devise_du    := null;
    new.tarif_source := null;
    new.tarif_id     := null;
  end if;

  -- Numéro d'ordre : le compteur est verrouillé le temps de l'opération,
  -- deux actes ne peuvent donc jamais recevoir le même numéro.
  insert into public.compteurs_actes as c (entite_id, type_acte_id, annee, dernier_numero)
  values (new.entite_id, new.type_acte_id, new.annee, 1)
  on conflict (entite_id, type_acte_id, annee)
  do update set dernier_numero = c.dernier_numero + 1
  returning c.dernier_numero into v_numero;

  new.numero_ordre := v_numero;
  new.identifiant  := format('%s-%s-%s-%s', v_code_entite, v_code_type, new.annee, lpad(v_numero::text, 6, '0'));

  -- Traçabilité et propreté des noms
  new.cree_le         := now();
  new.modifie_le      := now();
  new.titulaire_nom   := btrim(regexp_replace(new.titulaire_nom, '\s+', ' ', 'g'));
  new.titulaire_2_nom := nullif(btrim(regexp_replace(coalesce(new.titulaire_2_nom, ''), '\s+', ' ', 'g')), '');
  new.demandeur_nom   := nullif(btrim(regexp_replace(coalesce(new.demandeur_nom, ''), '\s+', ' ', 'g')), '');

  if new.statut = 'delivre' then
    new.delivre_le := coalesce(new.delivre_le, now());
  end if;

  return new;
end;
$$;

create trigger actes_preparer
  before insert on public.actes
  for each row execute function public.preparer_nouvel_acte();


-- ---------------------------------------------------------------------
-- 5. MODIFICATION D'UN ACTE : CE QUI EST PERMIS
-- ---------------------------------------------------------------------
-- Étapes autorisées du cycle de vie :
--   enregistré           -> en attente de paiement, annulé
--   en attente paiement  -> enregistré (retour pour correction), payé, exonéré, annulé
--   payé / exonéré       -> délivré, annulé
--   délivré              -> annulé
--   annulé               -> (plus rien : statut définitif)
create or replace function public.controler_modification_acte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarif record;
begin
  -- Un acte annulé est définitif
  if old.statut = 'annule' then
    raise exception 'Cet acte est annulé : il ne peut plus être modifié.' using errcode = 'P0001';
  end if;

  -- L'identification ne change jamais
  if new.identifiant  is distinct from old.identifiant
     or new.entite_id    is distinct from old.entite_id
     or new.type_acte_id is distinct from old.type_acte_id
     or new.annee        is distinct from old.annee
     or new.numero_ordre is distinct from old.numero_ordre
     or new.origine      is distinct from old.origine
     or new.cree_par     is distinct from old.cree_par
     or new.cree_le      is distinct from old.cree_le then
    raise exception 'L''identification d''un acte (ID, entité, type, année, origine) ne peut pas être modifiée. Pour corriger le type, annulez l''acte et créez-en un nouveau.'
      using errcode = 'P0001';
  end if;

  -- Contrôle des étapes du cycle de vie
  if new.statut is distinct from old.statut then
    if not (
         (old.statut = 'enregistre'          and new.statut in ('en_attente_paiement', 'annule'))
      or (old.statut = 'en_attente_paiement' and new.statut in ('enregistre', 'paye', 'exonere', 'annule'))
      or (old.statut in ('paye', 'exonere')  and new.statut in ('delivre', 'annule'))
      or (old.statut = 'delivre'             and new.statut = 'annule')
    ) then
      raise exception 'Passage de « % » à « % » non autorisé.', old.statut, new.statut
        using errcode = 'P0001';
    end if;

    if new.statut = 'delivre' then
      new.delivre_le  := now();
      new.delivre_par := coalesce(new.delivre_par, auth.uid());
    end if;

    if new.statut = 'annule' then
      new.annule_le  := now();
      new.annule_par := coalesce(new.annule_par, auth.uid());
    end if;
  end if;

  -- Montant : recalculé tant que l'acte n'est pas payé, figé ensuite
  if old.statut in ('enregistre', 'en_attente_paiement')
     and new.statut in ('enregistre', 'en_attente_paiement', 'annule') then
    if old.origine = 'nouveau' then
      new.date_acte := old.date_acte;  -- la date d'enregistrement fixe le tarif
      select * into v_tarif
      from public.tarif_applicable(new.entite_id, new.type_acte_id, new.categorie, new.date_acte);
      new.montant_du   := v_tarif.montant;
      new.devise_du    := v_tarif.devise;
      new.tarif_source := v_tarif.source;
      new.tarif_id     := v_tarif.tarif_id;
    end if;
  elsif new.montant_du   is distinct from old.montant_du
     or new.devise_du    is distinct from old.devise_du
     or new.categorie    is distinct from old.categorie
     or new.tarif_source is distinct from old.tarif_source
     or new.tarif_id     is distinct from old.tarif_id
     or new.date_acte    is distinct from old.date_acte then
    raise exception 'Le montant, la catégorie et la date sont figés une fois l''acte payé ou exonéré.'
      using errcode = 'P0001';
  end if;

  new.titulaire_nom   := btrim(regexp_replace(new.titulaire_nom, '\s+', ' ', 'g'));
  new.titulaire_2_nom := nullif(btrim(regexp_replace(coalesce(new.titulaire_2_nom, ''), '\s+', ' ', 'g')), '');
  new.demandeur_nom   := nullif(btrim(regexp_replace(coalesce(new.demandeur_nom, ''), '\s+', ' ', 'g')), '');
  new.modifie_le := now();
  return new;
end;
$$;

create trigger actes_controler_modification
  before update on public.actes
  for each row execute function public.controler_modification_acte();


-- Un acte ne s'efface jamais
create or replace function public.interdire_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Suppression interdite sur « % » : utilisez l''annulation avec motif.', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger actes_pas_de_suppression
  before delete on public.actes
  for each row execute function public.interdire_suppression();


-- ---------------------------------------------------------------------
-- 6. FICHES DE DÉTAILS
-- ---------------------------------------------------------------------
-- Une fiche par acte au plus (clé = l'acte lui-même). Le nom du titulaire
-- reste dans la table centrale ; la fiche ne contient que le complément.

create table public.details_naissance (
  acte_id          uuid primary key references public.actes (id) on delete restrict,
  sexe             char(1) not null check (sexe in ('M', 'F')),
  date_naissance   date not null check (date_naissance <= current_date),
  lieu_naissance   text,
  nom_pere         text,
  nom_mere         text,
  modifie_le       timestamptz not null default now()
);

create table public.details_mariage (
  acte_id            uuid primary key references public.actes (id) on delete restrict,
  date_celebration   date not null check (date_celebration <= current_date),
  lieu_celebration   text,
  temoins            text,
  modifie_le         timestamptz not null default now()
);

create table public.details_deces (
  acte_id        uuid primary key references public.actes (id) on delete restrict,
  sexe           char(1) check (sexe in ('M', 'F')),
  date_deces     date not null check (date_deces <= current_date),
  lieu_deces     text,
  age_au_deces   smallint check (age_au_deces between 0 and 130),
  declarant_nom  text,
  modifie_le     timestamptz not null default now()
);

comment on table public.details_naissance is 'Complément d''un acte de type « naissance ». Titulaire = l''enfant.';
comment on table public.details_mariage   is 'Complément d''un acte de type « mariage ». Titulaires = les deux époux.';
comment on table public.details_deces     is 'Complément d''un acte de type « décès ». Titulaire = le défunt.';

-- La fiche doit correspondre au modèle du type d'acte : impossible de
-- ranger des informations de décès sur un acte de naissance.
create or replace function public.verifier_modele_fiche()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendu public.modele_fiche;
  v_statut  public.statut_acte;
begin
  select t.modele_fiche, a.statut into v_attendu, v_statut
  from public.actes a
  join public.types_actes t on t.id = a.type_acte_id
  where a.id = new.acte_id;

  if v_attendu is distinct from tg_argv[0]::public.modele_fiche then
    raise exception 'Cette fiche « % » ne correspond pas au type de l''acte (fiche attendue : « % »).',
      tg_argv[0], coalesce(v_attendu::text, 'acte introuvable')
      using errcode = 'P0001';
  end if;

  if v_statut = 'annule' then
    raise exception 'Cet acte est annulé : sa fiche ne peut plus être modifiée.' using errcode = 'P0001';
  end if;

  new.modifie_le := now();
  return new;
end;
$$;

create trigger details_naissance_modele before insert or update on public.details_naissance
  for each row execute function public.verifier_modele_fiche('naissance');
create trigger details_mariage_modele before insert or update on public.details_mariage
  for each row execute function public.verifier_modele_fiche('mariage');
create trigger details_deces_modele before insert or update on public.details_deces
  for each row execute function public.verifier_modele_fiche('deces');

create trigger details_naissance_pas_de_suppression before delete on public.details_naissance
  for each row execute function public.interdire_suppression();
create trigger details_mariage_pas_de_suppression before delete on public.details_mariage
  for each row execute function public.interdire_suppression();
create trigger details_deces_pas_de_suppression before delete on public.details_deces
  for each row execute function public.interdire_suppression();

alter table public.details_naissance enable row level security;
alter table public.details_mariage   enable row level security;
alter table public.details_deces     enable row level security;
