-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 23 : ANCIENS REGISTRES — IMPORT EN LOT (étape 6, fichier 36)
-- ---------------------------------------------------------------------
-- Un lot = un registre papier : un seul type d'acte, une seule année, une
-- seule entité (fichier 06). Chaque ancien acte y est ajouté avec
-- l'essentiel : nom(s), date de l'acte, n° dans le registre papier. Il
-- reçoit un ID normal, est classé « délivré », sans montant, et son scan
-- est enregistré en mode « lot ».
--
-- 1. L'acte garde le lot d'où il vient (même si son scan n'a pas encore
--    pu être joint : l'écran le signale « scan manquant »).
-- 2. Le même n° de registre ne peut pas être numérisé deux fois (même
--    entité, même type, même année) : le message donne l'ID existant.
-- 3. Un lot ne se ferme que lorsque tous ses actes ont leur scan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LE LOT D'UN ANCIEN ACTE
-- ---------------------------------------------------------------------
alter table public.actes
  add column lot_id uuid references public.lots_import (id) on delete restrict;

alter table public.actes
  add constraint actes_lot_seulement_archive check (lot_id is null or origine = 'archive_ancienne');

create index actes_lot_idx on public.actes (lot_id) where lot_id is not null;

comment on column public.actes.lot_id is 'Lot (registre papier) d''où vient un ancien acte numérisé.';

-- Le lot d'un acte ne change jamais
create or replace function public.figer_lot_acte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lot_id is distinct from old.lot_id then
    raise exception 'Le lot d''un acte ne peut pas être changé.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Nommé « actes_a_l… » pour passer avant la protection des actes délivrés (même raison, message plus précis)
create trigger actes_a_lot_fige
  before update on public.actes
  for each row execute function public.figer_lot_acte();


-- ---------------------------------------------------------------------
-- 2. N° DU REGISTRE PAPIER : PAS DE DOUBLON
-- ---------------------------------------------------------------------
-- « 412 », « n° 412 », « N°412 » désignent le même acte ; « 412 bis » est un autre acte.
create or replace function public.registre_normalise(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(regexp_replace(lower(coalesce(p, '')), 'n[°o]\.?|num(é|e)ro', '', 'g'), '[^a-z0-9]', '', 'g'), '')
$$;

create unique index actes_registre_unique
  on public.actes (entite_id, type_acte_id, annee, public.registre_normalise(numero_registre))
  where origine = 'archive_ancienne' and public.registre_normalise(numero_registre) is not null;


-- ---------------------------------------------------------------------
-- 3. CRÉER UN LOT
-- ---------------------------------------------------------------------
create or replace function public.creer_lot(p_type_acte uuid, p_annee smallint, p_description text)
returns public.lots_import
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot public.lots_import;
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier de l''entité peut ouvrir un lot d''anciens registres.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.types_actes t where t.id = p_type_acte and t.actif) then
    raise exception 'Type d''acte inconnu ou retiré du catalogue.' using errcode = 'P0001';
  end if;
  if p_annee is null or p_annee < 1900 or p_annee > extract(year from public.aujourdhui()) then
    raise exception 'Année du registre invalide (de 1900 à l''année en cours).' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Décrivez le registre, par exemple « Registre des naissances 2019, volume 1 ».' using errcode = 'P0001';
  end if;
  insert into public.lots_import (entite_id, type_acte_id, annee_registre, description)
  values (public.entite_courante(), p_type_acte, p_annee, btrim(regexp_replace(p_description, '\s+', ' ', 'g')))
  returning * into v_lot;
  return v_lot;
end;
$$;

revoke execute on function public.creer_lot(uuid, smallint, text) from public, anon;
grant  execute on function public.creer_lot(uuid, smallint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. AJOUTER UN ANCIEN ACTE AU LOT
-- ---------------------------------------------------------------------
create or replace function public.ajouter_acte_ancien(
  p_lot             uuid,
  p_titulaire_nom   text,
  p_titulaire_2_nom text,
  p_date_acte       date,
  p_numero_registre text
)
returns public.actes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot     public.lots_import%rowtype;
  v_modele  text;
  v_existant text;
  v_numero   text;
  v_acte    public.actes;
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier de l''entité peut numériser un ancien registre.' using errcode = 'P0001';
  end if;
  select * into v_lot from public.lots_import l where l.id = p_lot;
  if not found or not public.est_de_mon_entite(v_lot.entite_id) then
    raise exception 'Lot introuvable.' using errcode = 'P0001';
  end if;
  if v_lot.statut = 'ferme' then
    raise exception 'Ce lot est fermé : il n''accepte plus d''actes.' using errcode = 'P0001';
  end if;
  select t.modele_fiche::text into v_modele from public.types_actes t where t.id = v_lot.type_acte_id;

  if btrim(coalesce(p_titulaire_nom, '')) = '' then
    raise exception 'Indiquez le nom du titulaire.' using errcode = 'P0001';
  end if;
  if v_modele = 'mariage' and btrim(coalesce(p_titulaire_2_nom, '')) = '' then
    raise exception 'Indiquez le nom des deux époux.' using errcode = 'P0001';
  end if;
  if p_date_acte is null then
    raise exception 'Indiquez la date de l''acte dans le registre.' using errcode = 'P0001';
  end if;
  if p_date_acte > public.aujourdhui() then
    raise exception 'La date de l''acte ne peut pas être dans le futur.' using errcode = 'P0001';
  end if;
  if v_lot.annee_registre is not null and extract(year from p_date_acte) <> v_lot.annee_registre then
    raise exception 'La date doit être en %, l''année de ce registre.', v_lot.annee_registre using errcode = 'P0001';
  end if;
  if public.registre_normalise(p_numero_registre) is null then
    raise exception 'Indiquez le n° de l''acte dans le registre papier.' using errcode = 'P0001';
  end if;

  -- Déjà numérisé ?
  select a.identifiant, a.numero_registre into v_existant, v_numero
  from public.actes a
  where a.origine = 'archive_ancienne'
    and a.entite_id = v_lot.entite_id and a.type_acte_id = v_lot.type_acte_id
    and a.annee = extract(year from p_date_acte)
    and public.registre_normalise(a.numero_registre) = public.registre_normalise(p_numero_registre);
  if v_existant is not null then
    raise exception 'Le n° % du registre % est déjà numérisé : %.', v_numero, extract(year from p_date_acte), v_existant
      using errcode = 'P0001';
  end if;

  insert into public.actes (entite_id, type_acte_id, origine, lot_id, titulaire_nom, titulaire_2_nom, date_acte, numero_registre)
  values (v_lot.entite_id, v_lot.type_acte_id, 'archive_ancienne', v_lot.id, p_titulaire_nom,
          case when v_modele = 'mariage' then p_titulaire_2_nom end, p_date_acte,
          btrim(regexp_replace(p_numero_registre, '\s+', ' ', 'g')))
  returning * into v_acte;
  return v_acte;
end;
$$;

revoke execute on function public.ajouter_acte_ancien(uuid, text, text, date, text) from public, anon;
grant  execute on function public.ajouter_acte_ancien(uuid, text, text, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. LES LOTS ET LEURS ACTES
-- ---------------------------------------------------------------------
create or replace view public.vue_lots
with (security_invoker = true)
as
select
  l.id, l.entite_id, l.type_acte_id, l.annee_registre, l.description, l.statut, l.cree_le, l.ferme_le,
  t.code as type_code, t.libelle as type_libelle, t.modele_fiche::text as modele_fiche, t.couleur as type_couleur, t.famille::text as type_famille,
  count(a.id)::int as nb_actes,
  count(a.id) filter (where exists (select 1 from public.documents_scannes d where d.acte_id = a.id))::int as nb_scannes
from public.lots_import l
join public.types_actes t on t.id = l.type_acte_id
left join public.actes a on a.lot_id = l.id
group by l.id, t.id;

comment on view public.vue_lots is 'Lots d''anciens registres avec le nombre d''actes et de scans.';


-- ---------------------------------------------------------------------
-- 6. FERMER UN LOT : SEULEMENT QUAND TOUT EST SCANNÉ
-- ---------------------------------------------------------------------
create or replace function public.lot_complet_avant_fermeture()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_manquants int;
begin
  if new.statut = 'ferme' and old.statut = 'ouvert' then
    select count(*) into v_manquants
    from public.actes a
    where a.lot_id = new.id and a.statut <> 'annule'
      and not exists (select 1 from public.documents_scannes d where d.acte_id = a.id);
    if v_manquants > 0 then
      raise exception '% acte(s) de ce lot n''ont pas encore leur scan : joignez-les avant de fermer le lot.', v_manquants
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger lots_complet_avant_fermeture
  before update on public.lots_import
  for each row execute function public.lot_complet_avant_fermeture();


-- ---------------------------------------------------------------------
-- 7. MÊME FICHIER DÉJÀ ARCHIVÉ ? (avant de créer l'ancien acte)
-- ---------------------------------------------------------------------
-- Comme verifier_empreinte_scan (fichier 21), mais sans acte : l'ancien acte
-- n'est créé que si son fichier n'est pas déjà archivé.
create or replace function public.verifier_empreinte_entite(p_empreinte text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_autre record;
begin
  if not public.est_officier() then
    raise exception 'Accès refusé.' using errcode = 'P0001';
  end if;
  if coalesce(p_empreinte, '') !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Empreinte invalide.' using errcode = 'P0001';
  end if;
  select a.identifiant, a.entite_id into v_autre
  from public.documents_scannes d
  join public.actes a on a.id = d.acte_id
  where d.empreinte_sha256 = lower(btrim(p_empreinte))
  order by d.importe_le
  limit 1;
  if v_autre.identifiant is null then
    return null;
  elsif public.est_de_mon_entite(v_autre.entite_id) then
    return format('Ce fichier est déjà enregistré pour l''acte %s. Vérifiez que vous avez scanné le bon document.', v_autre.identifiant);
  end if;
  return 'Ce fichier est déjà enregistré pour un acte d''une autre entité. Vérifiez que vous avez scanné le bon document.';
end;
$$;

revoke execute on function public.verifier_empreinte_entite(text) from public, anon;
grant  execute on function public.verifier_empreinte_entite(text) to authenticated;
