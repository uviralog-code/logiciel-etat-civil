-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 06 : LES ARCHIVES SCANNÉES
-- ---------------------------------------------------------------------
-- 1. L'espace de stockage privé "archives" (Supabase Storage).
-- 2. "lots_import"        : les lots d'anciens registres numérisés.
-- 3. "documents_scannes"  : la fiche de chaque fichier scanné, toujours
--                           rattachée à UN acte précis.
-- 4. Nom et emplacement du fichier calculés par la base à partir de l'ID
--    de l'acte : MUL/2026/MUL-EXNAIS-2026-000123.pdf
-- 5. Garde-fous anti-confusion : un même fichier ne peut pas servir pour
--    deux actes ; un lot n'accepte qu'un seul type d'acte.
-- 6. Signalement « payé mais pas encore archivé » à la clôture de caisse,
--    et taux d'archivage par entité pour l'admin.
--
-- Un scan ne s'efface jamais. Pour remplacer un mauvais scan, on dépose
-- une nouvelle version (avec motif) ; la plus récente fait foi.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ESPACE DE STOCKAGE PRIVÉ
-- ---------------------------------------------------------------------
-- Privé : un fichier n'est jamais accessible par simple lien public.
-- Taille maximale : 15 Mo par fichier. Formats : PDF, JPEG, PNG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archives', 'archives', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------
-- 2. LES LOTS D'IMPORT (anciens registres)
-- ---------------------------------------------------------------------
-- Un lot est déclaré pour UN type d'acte et UNE entité avant de commencer :
-- ex. « 50 actes de naissance de 2019 ».
create type public.statut_lot as enum ('ouvert', 'ferme');

create table public.lots_import (
  id               uuid primary key default extensions.gen_random_uuid(),
  entite_id        uuid not null references public.entites (id) on delete restrict,
  type_acte_id     uuid not null references public.types_actes (id) on delete restrict,
  annee_registre   smallint check (annee_registre between 1900 and 2100),
  description      text not null,
  statut           public.statut_lot not null default 'ouvert',
  cree_par         uuid references public.utilisateurs (id) default auth.uid(),
  cree_le          timestamptz not null default now(),
  ferme_le         timestamptz,

  constraint lots_description_remplie check (btrim(description) <> '')
);

comment on table public.lots_import is
  'Lot de numérisation d''anciens registres : un seul type d''acte et une seule entité par lot.';

alter table public.lots_import enable row level security;

-- Un lot ne peut que passer d'« ouvert » à « fermé » ; rien d'autre ne change
create or replace function public.controler_modification_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'ferme' then
    raise exception 'Ce lot est fermé : il ne peut plus être modifié.' using errcode = 'P0001';
  end if;
  if new.entite_id is distinct from old.entite_id
     or new.type_acte_id is distinct from old.type_acte_id
     or new.annee_registre is distinct from old.annee_registre then
    raise exception 'L''entité, le type d''acte et l''année d''un lot ne peuvent pas être changés.'
      using errcode = 'P0001';
  end if;
  if new.statut = 'ferme' then
    new.ferme_le := now();
  end if;
  return new;
end;
$$;

create trigger lots_controler_modification
  before update on public.lots_import
  for each row execute function public.controler_modification_lot();

create trigger lots_pas_de_suppression
  before delete on public.lots_import
  for each row execute function public.interdire_modification();


-- ---------------------------------------------------------------------
-- 3. LES DOCUMENTS SCANNÉS
-- ---------------------------------------------------------------------
create table public.documents_scannes (
  id                    uuid primary key default extensions.gen_random_uuid(),
  acte_id               uuid not null references public.actes (id) on delete restrict,
  entite_id             uuid not null references public.entites (id) on delete restrict,
  version               smallint not null,                 -- 1, puis 2 si le scan est refait…
  chemin_stockage       text not null unique,              -- ex. MUL/2026/MUL-EXNAIS-2026-000123.pdf
  type_mime             text not null,
  taille_octets         bigint not null,
  nb_pages              smallint,
  empreinte_sha256      text not null,                     -- « empreinte digitale » du fichier
  mode_import           public.mode_import not null,
  lot_id                uuid references public.lots_import (id) on delete restrict,
  motif_remplacement    text,                              -- obligatoire à partir de la version 2
  importe_par           uuid references public.utilisateurs (id) default auth.uid(),
  importe_le            timestamptz not null default now(),

  constraint documents_version_unique unique (acte_id, version),
  constraint documents_type_mime_valide check (type_mime in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint documents_taille_valide check (taille_octets > 0 and taille_octets <= 15728640),
  constraint documents_nb_pages_valide check (nb_pages is null or nb_pages between 1 and 500),
  constraint documents_empreinte_format check (empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  constraint documents_lot_coherent check ((mode_import = 'lot') = (lot_id is not null)),
  constraint documents_remplacement_motive check (
    version = 1 or (motif_remplacement is not null and btrim(motif_remplacement) <> '')
  )
);

comment on table  public.documents_scannes                  is 'Fiche de chaque fichier scanné, rattaché à un acte. La version la plus récente fait foi.';
comment on column public.documents_scannes.empreinte_sha256 is 'Empreinte SHA-256 du fichier : détecte un même fichier déposé deux fois.';

create index documents_acte_idx      on public.documents_scannes (acte_id, version desc);
create index documents_empreinte_idx on public.documents_scannes (empreinte_sha256);
create index documents_entite_idx    on public.documents_scannes (entite_id);

alter table public.documents_scannes enable row level security;


-- ---------------------------------------------------------------------
-- 4. EMPLACEMENT DU FICHIER : CALCULÉ PAR LA BASE
-- ---------------------------------------------------------------------
-- L'application demande d'abord l'emplacement prévu, y dépose le fichier,
-- puis enregistre la fiche. Le nom vient toujours de l'ID de l'acte :
-- impossible de ranger un acte de naissance sous le nom d'un acte de décès.
create or replace function public.chemin_archive(p_acte uuid, p_type_mime text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acte     record;
  v_version  smallint;
  v_ext      text;
begin
  select a.identifiant, a.annee, e.code as code_entite
    into v_acte
  from public.actes a
  join public.entites e on e.id = a.entite_id
  where a.id = p_acte;

  if v_acte.identifiant is null then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;

  v_ext := case p_type_mime
             when 'application/pdf' then 'pdf'
             when 'image/jpeg'      then 'jpg'
             when 'image/png'       then 'png'
           end;
  if v_ext is null then
    raise exception 'Format non accepté (%). Formats acceptés : PDF, JPEG, PNG.', p_type_mime
      using errcode = 'P0001';
  end if;

  select coalesce(max(d.version), 0) + 1 into v_version
  from public.documents_scannes d where d.acte_id = p_acte;

  return format('%s/%s/%s%s.%s',
                v_acte.code_entite, v_acte.annee, v_acte.identifiant,
                case when v_version > 1 then '-v' || v_version end,
                v_ext);
end;
$$;

comment on function public.chemin_archive(uuid, text) is
  'Emplacement où déposer le prochain scan d''un acte, ex. MUL/2026/MUL-EXNAIS-2026-000123.pdf.';


-- ---------------------------------------------------------------------
-- 5. ENREGISTREMENT D'UN SCAN : CONTRÔLES
-- ---------------------------------------------------------------------
create or replace function public.preparer_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acte  public.actes%rowtype;
  v_lot   public.lots_import%rowtype;
  v_autre text;
begin
  select * into v_acte from public.actes where id = new.acte_id for update;
  if not found then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;

  -- L'acte doit être dans un état où son document existe
  if v_acte.statut = 'annule' then
    raise exception 'Cet acte est annulé : on ne peut plus y joindre de scan.' using errcode = 'P0001';
  end if;
  if v_acte.statut in ('enregistre', 'en_attente_paiement') then
    raise exception 'L''acte % n''est pas encore payé ni exonéré : le scan se fait après l''établissement de l''acte signé.',
      v_acte.identifiant using errcode = 'P0001';
  end if;

  -- Lot d'import : même entité, même type d'acte, lot encore ouvert
  if new.lot_id is not null then
    select * into v_lot from public.lots_import where id = new.lot_id;
    if v_lot.statut = 'ferme' then
      raise exception 'Ce lot est fermé : il n''accepte plus de documents.' using errcode = 'P0001';
    end if;
    if v_lot.entite_id <> v_acte.entite_id or v_lot.type_acte_id <> v_acte.type_acte_id then
      raise exception 'Cet acte (%) ne correspond pas au lot (autre type d''acte ou autre entité).',
        v_acte.identifiant using errcode = 'P0001';
    end if;
  end if;

  -- Même fichier déjà déposé ? (même empreinte)
  new.empreinte_sha256 := lower(btrim(new.empreinte_sha256));
  select a.identifiant into v_autre
  from public.documents_scannes d
  join public.actes a on a.id = d.acte_id
  where d.empreinte_sha256 = new.empreinte_sha256
  limit 1;
  if v_autre is not null then
    raise exception 'Ce fichier est déjà enregistré pour l''acte %. Vérifiez que vous avez scanné le bon document.',
      v_autre using errcode = 'P0001';
  end if;

  -- Entité, version et emplacement : fixés par la base
  new.entite_id       := v_acte.entite_id;
  new.chemin_stockage := public.chemin_archive(new.acte_id, new.type_mime);
  select coalesce(max(d.version), 0) + 1 into new.version
  from public.documents_scannes d where d.acte_id = new.acte_id;
  new.importe_le      := now();
  new.importe_par     := coalesce(auth.uid(), new.importe_par);
  new.motif_remplacement := nullif(btrim(coalesce(new.motif_remplacement, '')), '');

  -- Le fichier doit déjà être déposé à l'emplacement prévu
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'archives' and o.name = new.chemin_stockage
  ) then
    raise exception 'Aucun fichier trouvé à l''emplacement prévu (%). Déposez d''abord le fichier, puis enregistrez-le.',
      new.chemin_stockage using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger documents_preparer
  before insert on public.documents_scannes
  for each row execute function public.preparer_document();

create trigger documents_pas_de_modification
  before update on public.documents_scannes
  for each row execute function public.interdire_modification();
create trigger documents_pas_de_suppression
  before delete on public.documents_scannes
  for each row execute function public.interdire_modification();


-- ---------------------------------------------------------------------
-- 6. DOCUMENT QUI FAIT FOI ET ACTES NON ARCHIVÉS
-- ---------------------------------------------------------------------
-- Le document le plus récent de chaque acte
create or replace view public.vue_document_actuel
with (security_invoker = true)
as
select distinct on (d.acte_id) d.*
from public.documents_scannes d
order by d.acte_id, d.version desc;

comment on view public.vue_document_actuel is 'Pour chaque acte, la version la plus récente de son scan (celle qui fait foi).';

-- Actes payés ou exonérés qui n'ont pas encore de scan
create or replace view public.vue_actes_non_archives
with (security_invoker = true)
as
select
  a.id                as acte_id,
  a.identifiant,
  a.entite_id,
  a.titulaire_nom,
  a.statut,
  coalesce(r.journee, x.journee)                       as journee_paiement,
  public.aujourdhui() - coalesce(r.journee, x.journee) as jours_ecoules
from public.actes a
left join public.recus r        on r.acte_id = a.id and r.statut = 'valide'
left join public.exonerations x on x.acte_id = a.id
where a.origine = 'nouveau'
  and a.statut in ('paye', 'exonere', 'delivre')
  and not exists (select 1 from public.documents_scannes d where d.acte_id = a.id);

comment on view public.vue_actes_non_archives is
  'Actes payés ou exonérés sans scan, avec la journée du paiement et le nombre de jours écoulés.';

-- Taux d'archivage par entité (indicateur de l'admin)
create or replace view public.vue_taux_archivage
with (security_invoker = true)
as
select
  e.id   as entite_id,
  e.code as entite_code,
  e.nom  as entite,
  count(a.id)                                                       as actes_payes,
  count(a.id) filter (where exists (
    select 1 from public.documents_scannes d where d.acte_id = a.id)) as actes_archives,
  case when count(a.id) = 0 then null
       else round(100.0 * count(a.id) filter (where exists (
              select 1 from public.documents_scannes d where d.acte_id = a.id)) / count(a.id), 1)
  end                                                               as taux_archivage_pct
from public.entites e
left join public.actes a
  on a.entite_id = e.id
 and a.origine = 'nouveau'
 and a.statut in ('paye', 'exonere', 'delivre')
group by e.id, e.code, e.nom;

comment on view public.vue_taux_archivage is
  'Par entité : actes payés ou exonérés, combien sont archivés, et le pourcentage.';


-- ---------------------------------------------------------------------
-- 7. SIGNALEMENT À LA CLÔTURE DE CAISSE
-- ---------------------------------------------------------------------
-- La clôture n'est PAS bloquée ; le nombre d'actes du jour sans scan est
-- simplement enregistré dans la clôture, et l'admin le voit.
alter table public.clotures_caisse
  add column nb_actes_sans_scan integer not null default 0;

comment on column public.clotures_caisse.nb_actes_sans_scan is
  'Actes payés ou exonérés ce jour-là qui n''avaient pas encore de scan au moment de la clôture (signalement).';

create or replace function public.signaler_actes_sans_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select count(*) into new.nb_actes_sans_scan
  from public.vue_actes_non_archives v
  where v.entite_id = new.entite_id
    and v.journee_paiement = new.journee;
  return new;
end;
$$;

-- Déclencheur nommé pour passer APRÈS « clotures_preparer » (ordre alphabétique)
create trigger clotures_signaler_scans
  before insert on public.clotures_caisse
  for each row execute function public.signaler_actes_sans_scan();
