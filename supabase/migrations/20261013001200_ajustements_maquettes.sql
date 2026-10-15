-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 12 : AJUSTEMENTS DÉCIDÉS PENDANT LES MAQUETTES (étape 3)
-- ---------------------------------------------------------------------
-- 1. Couleurs plus lisibles : le texte blanc sur l'orange des
--    autorisations et sur le turquoise des certificats manquait de
--    contraste. Teintes assombries.
-- 2. Motif de renvoi obligatoire : quand un acte en attente de paiement
--    est renvoyé à l'Officier pour correction, le motif est noté, avec
--    la date et l'auteur, pour que l'Officier sache quoi corriger.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. COULEURS PLUS LISIBLES
-- ---------------------------------------------------------------------
update public.types_actes set couleur = '#BF360C' where famille = 'autorisation' and couleur = '#E65100';
update public.types_actes set couleur = '#00727C' where famille = 'certificat'   and couleur = '#00838F';


-- ---------------------------------------------------------------------
-- 2. MOTIF DE RENVOI
-- ---------------------------------------------------------------------
alter table public.actes
  add column motif_renvoi text,
  add column renvoye_le   timestamptz,
  add column renvoye_par  uuid references public.utilisateurs (id);

comment on column public.actes.motif_renvoi is
  'Dernier motif pour lequel l''acte a été renvoyé à l''Officier (l''historique complet est au journal d''audit).';

-- Le renvoi (en attente de paiement -> enregistré) exige un motif
create or replace function public.exiger_motif_renvoi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'en_attente_paiement' and new.statut = 'enregistre' then
    new.motif_renvoi := nullif(btrim(coalesce(new.motif_renvoi, '')), '');
    if new.motif_renvoi is null then
      raise exception 'Indiquez le motif du renvoi, pour que l''Officier sache quoi corriger.'
        using errcode = 'P0001';
    end if;
    new.renvoye_le  := now();
    new.renvoye_par := auth.uid();
  elsif old.statut = 'enregistre' and new.statut = 'en_attente_paiement' then
    -- L'acte corrigé est retransmis : le motif est soldé (il reste au journal)
    new.motif_renvoi := null;
    new.renvoye_le   := null;
    new.renvoye_par  := null;
  elsif new.motif_renvoi is distinct from old.motif_renvoi
     or new.renvoye_le  is distinct from old.renvoye_le
     or new.renvoye_par is distinct from old.renvoye_par then
    -- Le motif ne se change qu'au moment d'un renvoi
    new.motif_renvoi := old.motif_renvoi;
    new.renvoye_le   := old.renvoye_le;
    new.renvoye_par  := old.renvoye_par;
  end if;
  return new;
end;
$$;

-- Nommé « actes_b_… » : après le contrôle des droits, avant le cycle de vie
create trigger actes_b_motif_renvoi
  before update on public.actes
  for each row execute function public.exiger_motif_renvoi();

-- Le Caissier, qui ne peut que renvoyer un acte, peut désormais y joindre
-- le motif (redéfinition du contrôle du fichier 08, seule la liste des
-- colonnes autorisées pour le Caissier change).
create or replace function public.controler_droits_acte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role    public.role_utilisateur := public.role_courant();
  v_reste_n jsonb;
  v_reste_o jsonb;
begin
  if current_user <> 'authenticated' then
    return new;  -- opération interne (encaissement, exonération, annulation d'un reçu…)
  end if;

  -- « Payé » et « exonéré » ne s'obtiennent QUE par la caisse
  if new.statut in ('paye', 'exonere') and new.statut is distinct from old.statut then
    raise exception 'Le statut « % » ne peut être donné que par la caisse (encaissement ou exonération).', new.statut
      using errcode = 'P0001';
  end if;

  if v_role = 'officier' then
    return new;  -- les autres règles (cycle de vie, montant figé…) s'appliquent ensuite

  elsif v_role = 'caissier' then
    -- Seul geste permis : renvoyer à l'Officier un acte en attente, avec motif
    v_reste_n := to_jsonb(new) - array['statut', 'motif_renvoi', 'renvoye_le', 'renvoye_par', 'modifie_le', 'recherche_noms'];
    v_reste_o := to_jsonb(old) - array['statut', 'motif_renvoi', 'renvoye_le', 'renvoye_par', 'modifie_le', 'recherche_noms'];
    if not (old.statut = 'en_attente_paiement' and new.statut = 'enregistre' and v_reste_n = v_reste_o) then
      raise exception 'Le Caissier ne peut que renvoyer à l''Officier un acte en attente de paiement.'
        using errcode = 'P0001';
    end if;
    return new;

  elsif v_role = 'admin' then
    -- Seul geste permis : annuler, avec motif
    v_reste_n := to_jsonb(new) - array['statut', 'motif_annulation', 'modifie_le', 'recherche_noms'];
    v_reste_o := to_jsonb(old) - array['statut', 'motif_annulation', 'modifie_le', 'recherche_noms'];
    if not (new.statut = 'annule' and v_reste_n = v_reste_o) then
      raise exception 'L''administrateur ne peut qu''annuler un acte (avec motif), pas le modifier.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  raise exception 'Accès refusé.' using errcode = '42501';
end;
$$;

-- Fonction prête à l'emploi pour l'application
create or replace function public.renvoyer_a_l_officier(p_acte uuid, p_motif text)
returns public.actes
language plpgsql
set search_path = ''
as $$
declare
  v_acte public.actes;
begin
  update public.actes
     set statut = 'enregistre', motif_renvoi = p_motif
   where id = p_acte
  returning * into v_acte;
  if v_acte.id is null then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  return v_acte;
end;
$$;

comment on function public.renvoyer_a_l_officier(uuid, text) is
  'Renvoie à l''Officier un acte en attente de paiement, avec le motif de la correction demandée.';

revoke execute on function public.renvoyer_a_l_officier(uuid, text) from anon, public;
grant  execute on function public.renvoyer_a_l_officier(uuid, text) to authenticated;
revoke execute on function public.exiger_motif_renvoi() from anon, public;
