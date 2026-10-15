-- =====================================================================
-- MIGRATION 20 : FICHE D'UN ACTE (étape 6, fichiers 30 et 31)
-- ---------------------------------------------------------------------
-- 1. Heure de transmission au Caissier, gardée sur l'acte (pour le
--    parcours affiché sur la fiche).
-- 2. Noms des agents de son entité (nom de l'officier qui a enregistré,
--    du Caissier qui a encaissé ou renvoyé) — sans rien d'autre de leur compte.
-- 3. Décisions de l'étape 6 pour un acte PAYÉ, EXONÉRÉ ou DÉLIVRÉ :
--    a) l'officier ne peut plus l'annuler : c'est le Caissier qui annule
--       le reçu (avant la clôture), ce qui annule l'acte ; l'argent et
--       l'acte restent toujours d'accord ;
--    b) l'officier ne corrige plus que l'orthographe des noms (titulaire,
--       second époux, demandeur), avec un motif obligatoire ; la fiche de
--       détails, la catégorie, le prix et le reste sont figés ;
--    c) il le marque « délivré » quand il remet le document.
-- Les opérations internes (encaissement, annulation d'un reçu) et
-- l'administrateur ne sont pas concernés par ces limites.
-- =====================================================================

-- 1. Heure de transmission
alter table public.actes add column transmis_le timestamptz;
comment on column public.actes.transmis_le is 'Dernière transmission au Caissier (passage « en attente de paiement »).';

create or replace function public.noter_transmission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut = 'en_attente_paiement'
     and (tg_op = 'INSERT' or old.statut is distinct from 'en_attente_paiement') then
    new.transmis_le := now();
  end if;
  return new;
end;
$$;

create trigger actes_c_transmission
  before insert or update of statut on public.actes
  for each row execute function public.noter_transmission();

-- Actes déjà transmis avant cette migration : au mieux, leur date de création
update public.actes set transmis_le = cree_le
 where transmis_le is null and statut not in ('enregistre', 'annule') and origine = 'nouveau';


-- 2. Noms des agents de son entité (l'administrateur : tous)
create or replace function public.agents_de_mon_entite()
returns table (id uuid, nom_complet text, role public.role_utilisateur)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nom_complet, u.role
  from public.utilisateurs u
  where public.role_courant() is not null
    and (public.est_admin() or u.entite_id = public.entite_courante() or u.role = 'admin')
$$;

comment on function public.agents_de_mon_entite() is
  'Nom et rôle des agents de l''entité de la personne connectée (pour afficher « par Neema Furaha »), rien d''autre.';


-- 3. Correction de l'orthographe d'un nom, après le paiement
alter table public.actes
  add column motif_correction text,
  add column corrige_le       timestamptz,
  add column corrige_par      uuid references public.utilisateurs (id);
comment on column public.actes.motif_correction is
  'Motif de la dernière correction d''orthographe d''un nom sur un acte payé (l''historique complet est au journal d''audit).';

create or replace function public.proteger_acte_paye()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_permis text[] := array['statut', 'titulaire_nom', 'titulaire_2_nom', 'demandeur_nom', 'motif_correction',
                           'corrige_le', 'corrige_par', 'modifie_le', 'recherche_noms', 'delivre_le', 'delivre_par'];
  v_noms_changes boolean;
begin
  -- Seulement l'officier, depuis l'application, sur un acte payé, exonéré ou délivré
  if current_user <> 'authenticated' or public.role_courant() is distinct from 'officier'
     or old.statut not in ('paye', 'exonere', 'delivre') then
    return new;
  end if;

  if new.statut = 'annule' then
    raise exception 'Un acte payé ne s''annule que par le Caissier, en annulant son reçu (avant la clôture de la journée) : l''argent et l''acte restent ainsi d''accord.'
      using errcode = 'P0001';
  end if;

  if (to_jsonb(new) - v_permis) is distinct from (to_jsonb(old) - v_permis) then
    raise exception 'Après le paiement, seule l''orthographe des noms se corrige (avec un motif). La fiche, la catégorie et le prix sont figés.'
      using errcode = 'P0001';
  end if;

  v_noms_changes := new.titulaire_nom   is distinct from old.titulaire_nom
                 or new.titulaire_2_nom is distinct from old.titulaire_2_nom
                 or new.demandeur_nom   is distinct from old.demandeur_nom;
  if v_noms_changes then
    if nullif(btrim(coalesce(new.motif_correction, '')), '') is null
       or new.corrige_le is not distinct from old.corrige_le then
      raise exception 'Indiquez le motif de la correction : elle est inscrite au journal d''audit.' using errcode = 'P0001';
    end if;
    new.motif_correction := btrim(new.motif_correction);
    new.corrige_le  := clock_timestamp();
    new.corrige_par := auth.uid();
  elsif new.motif_correction is distinct from old.motif_correction
     or new.corrige_le is distinct from old.corrige_le
     or new.corrige_par is distinct from old.corrige_par then
    raise exception 'Le motif d''une correction ne se modifie pas seul.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger actes_b_apres_paiement
  before update on public.actes
  for each row execute function public.proteger_acte_paye();

-- Fiche de détails figée après le paiement (pour l'officier)
create or replace function public.figer_fiche_apres_paiement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and exists (select 1 from public.actes a where a.id = new.acte_id and a.statut in ('paye', 'exonere', 'delivre')) then
    raise exception 'Après le paiement, la fiche de détails est figée : seule l''orthographe des noms se corrige.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger details_naissance_figee before update on public.details_naissance
  for each row execute function public.figer_fiche_apres_paiement();
create trigger details_mariage_figee before update on public.details_mariage
  for each row execute function public.figer_fiche_apres_paiement();
create trigger details_deces_figee before update on public.details_deces
  for each row execute function public.figer_fiche_apres_paiement();


-- La correction d'un nom, en une fonction (messages clairs)
create or replace function public.corriger_nom_acte(
  p_acte            uuid,
  p_titulaire_nom   text,
  p_titulaire_2_nom text,
  p_demandeur_nom   text,
  p_motif           text
)
returns public.actes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acte public.actes;
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier d''état civil peut corriger un acte.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_titulaire_nom, '')), '') is null then
    raise exception 'Le nom complet du titulaire de l''acte est obligatoire.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'Indiquez le motif de la correction : elle est inscrite au journal d''audit.' using errcode = 'P0001';
  end if;

  update public.actes
     set titulaire_nom = p_titulaire_nom, titulaire_2_nom = p_titulaire_2_nom, demandeur_nom = p_demandeur_nom,
         motif_correction = p_motif, corrige_le = clock_timestamp()
   where id = p_acte and statut in ('paye', 'exonere', 'delivre')
  returning * into v_acte;
  if v_acte.id is null then
    raise exception 'Cette correction concerne les actes payés, exonérés ou délivrés de votre entité. Un acte « enregistré » se corrige par sa fiche complète.'
      using errcode = 'P0001';
  end if;
  return v_acte;
end;
$$;

comment on function public.corriger_nom_acte is
  'Corrige l''orthographe des noms d''un acte payé, exonéré ou délivré (Officier), avec un motif inscrit au journal.';


-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
revoke execute on function public.noter_transmission() from public, anon, authenticated;
revoke execute on function public.proteger_acte_paye() from public, anon, authenticated;
revoke execute on function public.figer_fiche_apres_paiement() from public, anon, authenticated;
revoke execute on function public.agents_de_mon_entite() from public, anon;
revoke execute on function public.corriger_nom_acte(uuid, text, text, text, text) from public, anon;
grant  execute on function public.agents_de_mon_entite() to authenticated;
grant  execute on function public.corriger_nom_acte(uuid, text, text, text, text) to authenticated;
