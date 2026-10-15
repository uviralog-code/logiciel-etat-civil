-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 03 : CATALOGUE DES ACTES ET TARIFS
-- ---------------------------------------------------------------------
-- 1. "types_actes"     : le catalogue des 26 actes (commun aux 4 entités).
-- 2. "tarifs_communs"  : la grille commune, datée (historique conservé).
-- 3. "tarifs_entites"  : les ajustements qu'une entité fait chez elle seule.
-- 4. "taux_change"     : le taux $ -> FC tenu par chaque entité, daté.
-- 5. Les fonctions qui donnent le BON prix à une date donnée.
-- 6. Une vue des écarts entre chaque entité et la grille commune.
--
-- Principe d'historique : un tarif ou un taux déjà en vigueur ne se
-- modifie jamais et ne s'efface jamais. Pour le changer, on ajoute une
-- nouvelle ligne avec sa date d'entrée en vigueur.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LE CATALOGUE DES ACTES
-- ---------------------------------------------------------------------
create table public.types_actes (
  id                      uuid primary key default extensions.gen_random_uuid(),
  numero                  smallint not null unique,       -- n° de la fiche officielle (1 à 26)
  code                    text not null unique,           -- ex. NAIS : apparaît dans l'ID de l'acte
  libelle                 text not null unique,           -- ex. "Extrait d'acte de naissance"
  famille                 public.famille_acte not null,
  tarif_distinct_etranger boolean not null default false, -- vrai si Nationaux et Étrangers paient différemment
  couleur                 text,                           -- code couleur affiché à l'écran (ex. #2E7D32)
  actif                   boolean not null default true,
  cree_le                 timestamptz not null default now(),
  modifie_le              timestamptz not null default now(),

  -- Code de 2 à 6 lettres majuscules, sans tiret (l'ID d'acte utilise le tiret comme séparateur)
  constraint types_actes_code_format    check (code ~ '^[A-Z]{2,6}$'),
  constraint types_actes_numero_positif check (numero > 0),
  constraint types_actes_couleur_format check (couleur is null or couleur ~ '^#[0-9A-Fa-f]{6}$'),
  constraint types_actes_libelle_rempli check (btrim(libelle) <> '')
);

comment on table  public.types_actes is 'Catalogue des types d''actes délivrés, commun aux 4 entités.';
comment on column public.types_actes.tarif_distinct_etranger is
  'Vrai si l''acte a un tarif Étrangers différent du tarif Nationaux (ex. attestation de résidence).';

create trigger types_actes_maj_date
  before update on public.types_actes
  for each row execute function public.maj_date_modification();

alter table public.types_actes enable row level security;


-- ---------------------------------------------------------------------
-- 2. LA GRILLE COMMUNE (datée)
-- ---------------------------------------------------------------------
create table public.tarifs_communs (
  id                 uuid primary key default extensions.gen_random_uuid(),
  type_acte_id       uuid not null references public.types_actes (id) on delete restrict,
  categorie          public.categorie_tarif not null default 'national',
  montant            numeric(14,2) not null,
  devise             public.devise not null,
  en_vigueur_depuis  date not null default current_date,
  motif              text,                                  -- ex. "Arrêté du Bourgmestre de 2026"
  cree_par           uuid references public.utilisateurs (id) default auth.uid(),
  cree_le            timestamptz not null default now(),

  constraint tarifs_communs_montant_positif check (montant > 0),
  constraint tarifs_communs_unique unique (type_acte_id, categorie, en_vigueur_depuis)
);

comment on table public.tarifs_communs is
  'Grille tarifaire commune aux 4 entités. Chaque changement = une nouvelle ligne datée.';

create index tarifs_communs_recherche_idx
  on public.tarifs_communs (type_acte_id, categorie, en_vigueur_depuis desc);

alter table public.tarifs_communs enable row level security;


-- ---------------------------------------------------------------------
-- 3. LES AJUSTEMENTS PROPRES À UNE ENTITÉ (datés)
-- ---------------------------------------------------------------------
-- Une ligne peut soit fixer un prix local, soit annoncer le retour à la
-- grille commune ("suit_grille_commune" = vrai, sans montant).
create table public.tarifs_entites (
  id                   uuid primary key default extensions.gen_random_uuid(),
  entite_id            uuid not null references public.entites (id) on delete restrict,
  type_acte_id         uuid not null references public.types_actes (id) on delete restrict,
  categorie            public.categorie_tarif not null default 'national',
  suit_grille_commune  boolean not null default false,
  montant              numeric(14,2),
  devise               public.devise,
  en_vigueur_depuis    date not null default current_date,
  motif                text,
  cree_par             uuid references public.utilisateurs (id) default auth.uid(),
  cree_le              timestamptz not null default now(),

  -- Soit un prix local complet, soit un retour à la grille commune (sans prix)
  constraint tarifs_entites_coherence check (
    (suit_grille_commune and montant is null and devise is null)
    or (not suit_grille_commune and montant > 0 and devise is not null)
  ),
  constraint tarifs_entites_unique unique (entite_id, type_acte_id, categorie, en_vigueur_depuis)
);

comment on table public.tarifs_entites is
  'Ajustements de tarif propres à une entité. Une ligne "suit_grille_commune" annule l''ajustement.';

create index tarifs_entites_recherche_idx
  on public.tarifs_entites (entite_id, type_acte_id, categorie, en_vigueur_depuis desc);

alter table public.tarifs_entites enable row level security;


-- ---------------------------------------------------------------------
-- 4. LES TAUX DE CHANGE (un historique par entité)
-- ---------------------------------------------------------------------
-- Taux = nombre de francs congolais pour 1 dollar.
create table public.taux_change (
  id                 uuid primary key default extensions.gen_random_uuid(),
  entite_id          uuid not null references public.entites (id) on delete restrict,
  taux               numeric(12,4) not null,
  en_vigueur_depuis  timestamptz not null default now(),
  saisi_par          uuid references public.utilisateurs (id) default auth.uid(),
  cree_le            timestamptz not null default now(),

  -- Garde-fou contre les fautes de frappe (ex. 28,5 ou 285 000 au lieu de 2 850)
  constraint taux_change_vraisemblable check (taux between 500 and 20000),
  constraint taux_change_unique unique (entite_id, en_vigueur_depuis)
);

comment on table  public.taux_change      is 'Taux de change $ -> FC de chaque entité, avec historique.';
comment on column public.taux_change.taux is 'Nombre de FC pour 1 USD. Doit être compris entre 500 et 20 000.';

create index taux_change_recherche_idx
  on public.taux_change (entite_id, en_vigueur_depuis desc);

alter table public.taux_change enable row level security;


-- ---------------------------------------------------------------------
-- 5. PROTECTION DE L'HISTORIQUE
-- ---------------------------------------------------------------------
-- Une ligne déjà en vigueur ne peut être ni modifiée ni effacée.
-- Une ligne programmée pour une date future peut encore être corrigée.
create or replace function public.proteger_historique_tarifaire()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  deja_en_vigueur boolean;
begin
  if tg_table_name = 'taux_change' then
    deja_en_vigueur := old.en_vigueur_depuis <= now();
  else
    deja_en_vigueur := old.en_vigueur_depuis <= current_date;
  end if;

  if deja_en_vigueur then
    raise exception 'Historique protégé : ce % est déjà en vigueur et ne peut être ni modifié ni supprimé. Ajoutez une nouvelle ligne datée.',
      case when tg_table_name = 'taux_change' then 'taux' else 'tarif' end
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger tarifs_communs_historique
  before update or delete on public.tarifs_communs
  for each row execute function public.proteger_historique_tarifaire();

create trigger tarifs_entites_historique
  before update or delete on public.tarifs_entites
  for each row execute function public.proteger_historique_tarifaire();

create trigger taux_change_historique
  before update or delete on public.taux_change
  for each row execute function public.proteger_historique_tarifaire();


-- ---------------------------------------------------------------------
-- 6. COHÉRENCE NATIONAUX / ÉTRANGERS
-- ---------------------------------------------------------------------
-- Un tarif "étranger" n'est accepté que pour les actes qui en ont un.
create or replace function public.verifier_categorie_tarif()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.categorie = 'etranger' and not exists (
       select 1 from public.types_actes t
       where t.id = new.type_acte_id and t.tarif_distinct_etranger
     ) then
    raise exception 'Cet acte n''a pas de tarif Étrangers distinct : utilisez la catégorie "national".'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tarifs_communs_categorie
  before insert or update on public.tarifs_communs
  for each row execute function public.verifier_categorie_tarif();

create trigger tarifs_entites_categorie
  before insert or update on public.tarifs_entites
  for each row execute function public.verifier_categorie_tarif();


-- ---------------------------------------------------------------------
-- 7. QUEL EST LE BON PRIX ?
-- ---------------------------------------------------------------------
-- Donne le tarif applicable pour une entité, un acte, une catégorie de
-- demandeur et une date. Règles, dans l'ordre :
--   a) si l'acte n'a pas de tarif Étrangers, on prend le tarif national ;
--   b) l'ajustement le plus récent de l'entité (à cette date) l'emporte,
--      sauf s'il annonce le retour à la grille commune ;
--   c) sinon, la ligne la plus récente de la grille commune (à cette date).
-- "source" indique d'où vient le prix : 'entite' ou 'commune'.
create or replace function public.tarif_applicable(
  p_entite     uuid,
  p_type_acte  uuid,
  p_categorie  public.categorie_tarif,
  p_date       date default current_date
)
returns table (montant numeric, devise public.devise, source text, tarif_id uuid)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_categorie public.categorie_tarif;
  v_local     record;
begin
  -- a) catégorie réellement applicable
  select case when t.tarif_distinct_etranger then p_categorie else 'national'::public.categorie_tarif end
    into v_categorie
  from public.types_actes t
  where t.id = p_type_acte;

  if v_categorie is null then
    return;  -- type d'acte inconnu : aucun tarif
  end if;

  -- b) ajustement local le plus récent
  select te.* into v_local
  from public.tarifs_entites te
  where te.entite_id = p_entite
    and te.type_acte_id = p_type_acte
    and te.categorie = v_categorie
    and te.en_vigueur_depuis <= p_date
  order by te.en_vigueur_depuis desc
  limit 1;

  if found and not v_local.suit_grille_commune then
    return query select v_local.montant, v_local.devise, 'entite'::text, v_local.id;
    return;
  end if;

  -- c) grille commune
  return query
    select tc.montant, tc.devise, 'commune'::text, tc.id
    from public.tarifs_communs tc
    where tc.type_acte_id = p_type_acte
      and tc.categorie = v_categorie
      and tc.en_vigueur_depuis <= p_date
    order by tc.en_vigueur_depuis desc
    limit 1;
end;
$$;

comment on function public.tarif_applicable(uuid, uuid, public.categorie_tarif, date) is
  'Tarif applicable (montant, devise, source) pour une entité, un acte, une catégorie et une date.';


-- Taux de change en vigueur pour une entité à un moment donné
create or replace function public.taux_applicable(
  p_entite  uuid,
  p_moment  timestamptz default now()
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select tc.taux
  from public.taux_change tc
  where tc.entite_id = p_entite
    and tc.en_vigueur_depuis <= p_moment
  order by tc.en_vigueur_depuis desc
  limit 1
$$;

comment on function public.taux_applicable(uuid, timestamptz) is
  'Taux $ -> FC en vigueur pour une entité à un moment donné (vide si aucun taux saisi).';


-- Conversion d'un montant en francs congolais, arrondi au franc
create or replace function public.convertir_en_cdf(
  p_montant  numeric,
  p_devise   public.devise,
  p_taux     numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_devise = 'CDF' then round(p_montant, 0)
    when p_taux is null    then null
    else round(p_montant * p_taux, 0)
  end
$$;

comment on function public.convertir_en_cdf(numeric, public.devise, numeric) is
  'Convertit un montant en FC (arrondi au franc). Un montant en $ sans taux donne une valeur vide.';


-- ---------------------------------------------------------------------
-- 8. ÉCARTS ENTRE LES ENTITÉS ET LA GRILLE COMMUNE (pour l'admin)
-- ---------------------------------------------------------------------
-- Une ligne par entité, acte et catégorie dont le tarif du jour vient
-- d'un ajustement local. "security_invoker" : la vue applique les règles
-- d'accès de la personne qui la consulte.
create or replace view public.vue_ecarts_tarifs
with (security_invoker = true)
as
select
  e.code                          as entite_code,
  e.nom                           as entite,
  t.numero,
  t.libelle                       as acte,
  c.categorie,
  commun.montant                  as montant_commun,
  commun.devise                   as devise_commune,
  applique.montant                as montant_entite,
  applique.devise                 as devise_entite
from public.entites e
cross join public.types_actes t
cross join (values ('national'::public.categorie_tarif), ('etranger'::public.categorie_tarif)) as c(categorie)
cross join lateral public.tarif_applicable(e.id, t.id, c.categorie) as applique
left join lateral (
  select tc.montant, tc.devise
  from public.tarifs_communs tc
  where tc.type_acte_id = t.id
    and tc.categorie = c.categorie
    and tc.en_vigueur_depuis <= current_date
  order by tc.en_vigueur_depuis desc
  limit 1
) as commun on true
where applique.source = 'entite'
  and (c.categorie = 'national' or t.tarif_distinct_etranger);

comment on view public.vue_ecarts_tarifs is
  'Tarifs du jour qui diffèrent de la grille commune parce qu''une entité les a ajustés.';
