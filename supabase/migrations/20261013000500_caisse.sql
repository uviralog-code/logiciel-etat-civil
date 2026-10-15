-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 05 : LA CAISSE
-- ---------------------------------------------------------------------
-- 0. Heure locale d'Uvira (la "journée de caisse" suit l'heure d'Uvira).
-- 1. "recus"          : un reçu numéroté par paiement (MUL-REC-2026-000845).
-- 2. "exonerations"   : les actes accordés gratuitement, avec motif.
-- 3. "clotures_caisse": la clôture de chaque journée, avec contrôle de
--                       l'argent compté et des écarts.
-- 4. Fonctions prêtes à l'emploi : encaisser, exonérer, annuler un reçu,
--    clôturer la journée.
--
-- Règles clés :
--   - le montant à encaisser est TOUJOURS calculé par la base ;
--   - un reçu ne s'efface jamais : il s'annule, avec motif ;
--   - une journée clôturée est verrouillée : plus de reçu, d'exonération
--     ni d'annulation pour cette journée.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. HEURE LOCALE D'UVIRA
-- ---------------------------------------------------------------------
-- Les serveurs de Supabase sont réglés sur l'heure universelle (UTC),
-- qui a 2 heures de retard sur Uvira. Sans réglage, un paiement fait à
-- 1 h du matin à Uvira serait compté dans la journée de la veille.
-- On règle donc la base sur l'heure de la RDC orientale.
do $$
begin
  execute format('alter database %I set timezone = %L', current_database(), 'Africa/Lubumbashi');
end $$;
set timezone = 'Africa/Lubumbashi';  -- pour la suite de ce fichier

-- Date du jour à Uvira, quel que soit le réglage de la session
create or replace function public.aujourdhui()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Lubumbashi')::date
$$;

-- Journée (à Uvira) d'un instant donné
create or replace function public.journee_de(p_moment timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_moment at time zone 'Africa/Lubumbashi')::date
$$;

comment on function public.aujourdhui()           is 'Date du jour à l''heure d''Uvira.';
comment on function public.journee_de(timestamptz) is 'Journée de caisse (heure d''Uvira) correspondant à un instant.';


-- ---------------------------------------------------------------------
-- 1. LES CLÔTURES DE CAISSE (créées d'abord : les autres tables les consultent)
-- ---------------------------------------------------------------------
create table public.clotures_caisse (
  id                    uuid primary key default extensions.gen_random_uuid(),
  entite_id             uuid not null references public.entites (id) on delete restrict,
  journee               date not null,

  -- Totaux attendus, calculés par la base à partir des reçus du jour
  nb_recus              integer not null default 0,
  nb_recus_annules      integer not null default 0,
  nb_exonerations       integer not null default 0,
  attendu_usd           numeric(14,2) not null default 0,
  attendu_cdf           numeric(16,2) not null default 0,
  total_equivalent_cdf  numeric(16,2) not null default 0,

  -- Argent réellement compté par le Caissier
  compte_usd            numeric(14,2) not null,
  compte_cdf            numeric(16,2) not null,

  -- Écarts (positif = excédent, négatif = manque)
  ecart_usd             numeric(14,2) generated always as (compte_usd - attendu_usd) stored,
  ecart_cdf             numeric(16,2) generated always as (compte_cdf - attendu_cdf) stored,
  explication_ecart     text,

  cloture_par           uuid references public.utilisateurs (id) default auth.uid(),
  cloture_le            timestamptz not null default now(),

  constraint clotures_une_par_jour unique (entite_id, journee),
  constraint clotures_comptes_positifs check (compte_usd >= 0 and compte_cdf >= 0)
);

comment on table public.clotures_caisse is
  'Clôture de chaque journée de caisse : totaux attendus, argent compté, écarts. Verrouille la journée.';

alter table public.clotures_caisse enable row level security;

-- Une journée est-elle clôturée ?
create or replace function public.journee_cloturee(p_entite uuid, p_journee date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clotures_caisse c
    where c.entite_id = p_entite and c.journee = p_journee
  )
$$;


-- ---------------------------------------------------------------------
-- 2. LES REÇUS
-- ---------------------------------------------------------------------
create type public.statut_recu as enum ('valide', 'annule');

create table public.compteurs_recus (
  entite_id       uuid not null references public.entites (id) on delete restrict,
  annee           smallint not null,
  dernier_numero  integer not null default 0,
  primary key (entite_id, annee)
);
alter table public.compteurs_recus enable row level security;

create table public.recus (
  id                     uuid primary key default extensions.gen_random_uuid(),
  numero_recu            text not null unique,                   -- ex. MUL-REC-2026-000845
  entite_id              uuid not null references public.entites (id) on delete restrict,
  acte_id                uuid not null unique references public.actes (id) on delete restrict,
  annee                  smallint not null,
  numero_ordre           integer not null,

  -- Ce qui était dû (copié de l'acte)
  montant_du             numeric(14,2) not null,
  devise_du              public.devise not null,

  -- Ce qui a été réellement reçu
  devise_recue           public.devise not null,
  montant_recu           numeric(16,2) not null,
  taux_applique          numeric(12,4),                           -- FC pour 1 $, si une conversion est en jeu
  montant_equivalent_cdf numeric(16,2) not null,                  -- valeur en FC, pour les rapports
  mode_paiement          public.mode_paiement not null default 'especes',

  -- Journée et auteur
  journee                date not null,
  encaisse_par           uuid references public.utilisateurs (id) default auth.uid(),
  encaisse_le            timestamptz not null default now(),

  -- Annulation
  statut                 public.statut_recu not null default 'valide',
  motif_annulation       text,
  annule_par             uuid references public.utilisateurs (id),
  annule_le              timestamptz,

  constraint recus_numero_unique unique (entite_id, annee, numero_ordre),
  constraint recus_montants_positifs check (montant_du > 0 and montant_recu > 0 and montant_equivalent_cdf > 0),
  constraint recus_annulation_motivee check (
    statut = 'valide' or (motif_annulation is not null and btrim(motif_annulation) <> '')
  )
);

comment on table  public.recus               is 'Un reçu par acte payé. Numéroté automatiquement, jamais supprimé.';
comment on column public.recus.montant_recu  is 'Montant réellement encaissé, dans la monnaie reçue. Calculé par la base.';
comment on column public.recus.journee       is 'Journée de caisse (heure d''Uvira) à laquelle le reçu est rattaché.';

create index recus_entite_journee_idx on public.recus (entite_id, journee);

alter table public.recus enable row level security;


-- Préparation d'un reçu : tout est calculé par la base
create or replace function public.preparer_recu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acte    public.actes%rowtype;
  v_code    text;
  v_taux    numeric;
  v_numero  integer;
begin
  select * into v_acte from public.actes where id = new.acte_id for update;

  if not found then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  if v_acte.statut <> 'en_attente_paiement' then
    raise exception 'Seul un acte « en attente de paiement » peut être encaissé (statut actuel : %).', v_acte.statut
      using errcode = 'P0001';
  end if;

  new.entite_id   := v_acte.entite_id;
  new.encaisse_le := now();
  new.journee     := public.journee_de(new.encaisse_le);
  new.annee       := extract(year from new.journee)::smallint;
  new.statut      := 'valide';
  new.motif_annulation := null;
  new.annule_par  := null;
  new.annule_le   := null;

  if public.journee_cloturee(new.entite_id, new.journee) then
    raise exception 'La caisse du % est déjà clôturée : aucun encaissement possible pour cette journée.',
      to_char(new.journee, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  -- Montant dû : celui de l'acte, jamais un montant saisi
  new.montant_du   := v_acte.montant_du;
  new.devise_du    := v_acte.devise_du;
  new.devise_recue := coalesce(new.devise_recue, v_acte.devise_du);

  -- Taux du jour : indispensable dès qu'un dollar est en jeu
  v_taux := public.taux_applicable(new.entite_id, new.encaisse_le);
  if (new.devise_du = 'USD' or new.devise_recue = 'USD') and v_taux is null then
    raise exception 'Aucun taux de change n''est saisi pour cette entité : enregistrez le taux du jour avant d''encaisser.'
      using errcode = 'P0001';
  end if;
  new.taux_applique := case when new.devise_du = 'USD' or new.devise_recue = 'USD' then v_taux end;

  -- Montant à recevoir dans la monnaie choisie par le demandeur
  new.montant_recu := case
    when new.devise_recue = new.devise_du then new.montant_du
    when new.devise_recue = 'CDF'          then public.convertir_en_cdf(new.montant_du, 'USD', v_taux)
    else round(new.montant_du / v_taux, 2)  -- acte en FC payé en dollars
  end;
  new.montant_equivalent_cdf := public.convertir_en_cdf(new.montant_du, new.devise_du, v_taux);

  -- Numéro de reçu
  select e.code into v_code from public.entites e where e.id = new.entite_id;

  insert into public.compteurs_recus as c (entite_id, annee, dernier_numero)
  values (new.entite_id, new.annee, 1)
  on conflict (entite_id, annee) do update set dernier_numero = c.dernier_numero + 1
  returning c.dernier_numero into v_numero;

  new.numero_ordre := v_numero;
  new.numero_recu  := format('%s-REC-%s-%s', v_code, new.annee, lpad(v_numero::text, 6, '0'));
  new.encaisse_par := coalesce(auth.uid(), new.encaisse_par);
  return new;
end;
$$;

create trigger recus_preparer
  before insert on public.recus
  for each row execute function public.preparer_recu();

-- Après l'émission du reçu : l'acte passe à « payé »
create or replace function public.marquer_acte_paye()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.actes set statut = 'paye' where id = new.acte_id;
  return null;
end;
$$;

create trigger recus_marquer_acte_paye
  after insert on public.recus
  for each row execute function public.marquer_acte_paye();


-- Modification d'un reçu : seule l'annulation est permise
create or replace function public.controler_modification_recu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motif text;
begin
  if old.statut = 'annule' then
    raise exception 'Ce reçu est déjà annulé : il ne peut plus être modifié.' using errcode = 'P0001';
  end if;

  if new.statut <> 'annule' then
    raise exception 'Un reçu ne peut pas être modifié. Seule l''annulation, avec motif, est possible.'
      using errcode = 'P0001';
  end if;

  if public.journee_cloturee(old.entite_id, old.journee) then
    raise exception 'La caisse du % est clôturée : ce reçu ne peut plus être annulé.',
      to_char(old.journee, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  -- Tout reste identique, sauf les informations d'annulation
  v_motif := btrim(coalesce(new.motif_annulation, ''));
  new := old;
  new.statut           := 'annule';
  new.motif_annulation := nullif(v_motif, '');
  new.annule_le        := now();
  new.annule_par       := auth.uid();
  return new;
end;
$$;

create trigger recus_controler_modification
  before update on public.recus
  for each row execute function public.controler_modification_recu();

-- Après l'annulation d'un reçu : l'acte est annulé avec le même motif
create or replace function public.annuler_acte_du_recu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.actes
     set statut = 'annule',
         motif_annulation = 'Reçu ' || new.numero_recu || ' annulé : ' || new.motif_annulation
   where id = new.acte_id
     and statut <> 'annule';
  return null;
end;
$$;

create trigger recus_annuler_acte
  after update of statut on public.recus
  for each row
  when (old.statut = 'valide' and new.statut = 'annule')
  execute function public.annuler_acte_du_recu();

create trigger recus_pas_de_suppression
  before delete on public.recus
  for each row execute function public.interdire_suppression();


-- Enregistrement définitif : ni modification ni suppression
create or replace function public.interdire_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% interdite sur « % » : cet enregistrement est définitif.',
    case when tg_op = 'DELETE' then 'Suppression' else 'Modification' end, tg_table_name
    using errcode = 'P0001';
end;
$$;


-- ---------------------------------------------------------------------
-- 3. LES EXONÉRATIONS
-- ---------------------------------------------------------------------
create table public.exonerations (
  id           uuid primary key default extensions.gen_random_uuid(),
  acte_id      uuid not null unique references public.actes (id) on delete restrict,
  entite_id    uuid not null references public.entites (id) on delete restrict,
  motif        text not null,
  montant_du   numeric(14,2) not null,    -- montant auquel l'entité renonce
  devise_du    public.devise not null,
  journee      date not null,
  accorde_par  uuid references public.utilisateurs (id) default auth.uid(),
  accorde_le   timestamptz not null default now(),

  constraint exonerations_motif_rempli check (btrim(motif) <> '')
);

comment on table public.exonerations is
  'Actes délivrés gratuitement, avec le motif et le montant non perçu. Visibles par l''admin dans les rapports.';

create index exonerations_entite_journee_idx on public.exonerations (entite_id, journee);

alter table public.exonerations enable row level security;

create or replace function public.preparer_exoneration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acte public.actes%rowtype;
begin
  select * into v_acte from public.actes where id = new.acte_id for update;

  if not found then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  if v_acte.statut <> 'en_attente_paiement' then
    raise exception 'Seul un acte « en attente de paiement » peut être exonéré (statut actuel : %).', v_acte.statut
      using errcode = 'P0001';
  end if;

  new.entite_id  := v_acte.entite_id;
  new.montant_du := v_acte.montant_du;
  new.devise_du  := v_acte.devise_du;
  new.accorde_le := now();
  new.journee    := public.journee_de(new.accorde_le);
  new.motif      := btrim(new.motif);
  new.accorde_par := coalesce(auth.uid(), new.accorde_par);

  if public.journee_cloturee(new.entite_id, new.journee) then
    raise exception 'La caisse du % est déjà clôturée : aucune exonération possible pour cette journée.',
      to_char(new.journee, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger exonerations_preparer
  before insert on public.exonerations
  for each row execute function public.preparer_exoneration();

create or replace function public.marquer_acte_exonere()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.actes set statut = 'exonere' where id = new.acte_id;
  return null;
end;
$$;

create trigger exonerations_marquer_acte
  after insert on public.exonerations
  for each row execute function public.marquer_acte_exonere();

-- Une exonération ne se modifie ni ne s'efface
create trigger exonerations_pas_de_modification
  before update on public.exonerations
  for each row execute function public.interdire_modification();
create trigger exonerations_pas_de_suppression
  before delete on public.exonerations
  for each row execute function public.interdire_modification();


-- ---------------------------------------------------------------------
-- 4. CALCUL DE LA CLÔTURE
-- ---------------------------------------------------------------------
create or replace function public.preparer_cloture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.journee is null then
    new.journee := public.aujourdhui();
  end if;
  if new.journee > public.aujourdhui() then
    raise exception 'On ne peut pas clôturer une journée future.' using errcode = 'P0001';
  end if;

  -- Totaux attendus, calculés uniquement à partir des reçus et exonérations
  select
    count(*) filter (where r.statut = 'valide'),
    count(*) filter (where r.statut = 'annule'),
    coalesce(sum(r.montant_recu) filter (where r.statut = 'valide' and r.devise_recue = 'USD'), 0),
    coalesce(sum(r.montant_recu) filter (where r.statut = 'valide' and r.devise_recue = 'CDF'), 0),
    coalesce(sum(r.montant_equivalent_cdf) filter (where r.statut = 'valide'), 0)
  into new.nb_recus, new.nb_recus_annules, new.attendu_usd, new.attendu_cdf, new.total_equivalent_cdf
  from public.recus r
  where r.entite_id = new.entite_id and r.journee = new.journee;

  select count(*) into new.nb_exonerations
  from public.exonerations x
  where x.entite_id = new.entite_id and x.journee = new.journee;

  new.cloture_le := now();
  new.cloture_par := coalesce(auth.uid(), new.cloture_par);
  new.explication_ecart := nullif(btrim(coalesce(new.explication_ecart, '')), '');

  -- Un écart doit toujours être expliqué
  if (new.compte_usd <> new.attendu_usd or new.compte_cdf <> new.attendu_cdf)
     and new.explication_ecart is null then
    raise exception 'Écart constaté (attendu : % $ et % FC ; compté : % $ et % FC). Une explication est obligatoire.',
      new.attendu_usd, new.attendu_cdf, new.compte_usd, new.compte_cdf
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger clotures_preparer
  before insert on public.clotures_caisse
  for each row execute function public.preparer_cloture();

-- Une clôture est définitive
create trigger clotures_pas_de_modification
  before update on public.clotures_caisse
  for each row execute function public.interdire_modification();
create trigger clotures_pas_de_suppression
  before delete on public.clotures_caisse
  for each row execute function public.interdire_modification();


-- ---------------------------------------------------------------------
-- 5. FONCTIONS PRÊTES À L'EMPLOI POUR L'APPLICATION
-- ---------------------------------------------------------------------
-- Elles s'exécutent avec les droits de la personne connectée : les règles
-- d'accès du fichier 08 décideront qui peut s'en servir.

-- Encaisser un acte (la monnaie reçue est facultative : par défaut, celle de l'acte)
create or replace function public.encaisser(p_acte uuid, p_devise_recue public.devise default null)
returns public.recus
language plpgsql
set search_path = ''
as $$
declare
  v_recu public.recus;
begin
  insert into public.recus (acte_id, devise_recue) values (p_acte, p_devise_recue)
  returning * into v_recu;
  return v_recu;
end;
$$;

-- Exonérer un acte (motif obligatoire)
create or replace function public.exonerer(p_acte uuid, p_motif text)
returns public.exonerations
language plpgsql
set search_path = ''
as $$
declare
  v_exo public.exonerations;
begin
  insert into public.exonerations (acte_id, motif) values (p_acte, p_motif)
  returning * into v_exo;
  return v_exo;
end;
$$;

-- Annuler un reçu (motif obligatoire) : l'acte est annulé aussi
create or replace function public.annuler_recu(p_recu uuid, p_motif text)
returns public.recus
language plpgsql
set search_path = ''
as $$
declare
  v_recu public.recus;
begin
  update public.recus set statut = 'annule', motif_annulation = p_motif
  where id = p_recu
  returning * into v_recu;
  if v_recu.id is null then
    raise exception 'Reçu introuvable.' using errcode = 'P0001';
  end if;
  return v_recu;
end;
$$;

-- Clôturer une journée (par défaut : aujourd'hui)
create or replace function public.cloturer_journee(
  p_entite      uuid,
  p_compte_usd  numeric,
  p_compte_cdf  numeric,
  p_explication text default null,
  p_journee     date default null
)
returns public.clotures_caisse
language plpgsql
set search_path = ''
as $$
declare
  v_cloture public.clotures_caisse;
begin
  insert into public.clotures_caisse (entite_id, journee, compte_usd, compte_cdf, explication_ecart)
  values (p_entite, coalesce(p_journee, public.aujourdhui()), p_compte_usd, p_compte_cdf, p_explication)
  returning * into v_cloture;
  return v_cloture;
end;
$$;

comment on function public.encaisser(uuid, public.devise)  is 'Émet le reçu d''un acte en attente de paiement. Montant calculé par la base.';
comment on function public.exonerer(uuid, text)            is 'Exonère un acte en attente de paiement, avec motif obligatoire.';
comment on function public.annuler_recu(uuid, text)         is 'Annule un reçu (motif obligatoire) et l''acte correspondant, si la journée n''est pas clôturée.';
comment on function public.cloturer_journee(uuid, numeric, numeric, text, date) is
  'Clôture une journée : compare l''argent compté aux totaux attendus et verrouille la journée.';
