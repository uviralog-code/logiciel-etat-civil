-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 26 : ANNULATION D'UN REÇU (étape 7, fichier 40)
-- ---------------------------------------------------------------------
-- Décision validée : quand le Caissier annule un reçu (le jour même, avant
-- la clôture), il choisit ce que devient l'acte :
--   - « erreur de caisse » (mauvaise monnaie, mauvais acte encaissé…) :
--     l'acte REVIENT dans la file « À encaisser », pour un nouveau reçu ;
--   - « erreur sur l'acte » : l'acte est ANNULÉ (règle du fichier 05),
--     l'Officier en refait un.
-- Le motif est un texte libre (3 caractères au moins).
--
-- Conséquence : un acte peut avoir plusieurs reçus, mais un seul VALIDE.
-- Un acte déjà délivré ne revient jamais dans la file.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. UN SEUL REÇU VALIDE PAR ACTE (les reçus annulés restent)
-- ---------------------------------------------------------------------
alter table public.recus drop constraint recus_acte_id_key;
create unique index recus_un_seul_valide_par_acte on public.recus (acte_id) where statut = 'valide';
create index recus_acte_idx on public.recus (acte_id);

alter table public.recus
  add column suite_annulation text,
  add constraint recus_suite_annulation_valide check (
    suite_annulation is null or suite_annulation in ('acte_annule', 'acte_remis_en_file')
  );

comment on column public.recus.suite_annulation is
  'Après l''annulation : acte annulé, ou remis dans la file « À encaisser » (erreur de caisse).';


-- ---------------------------------------------------------------------
-- 2. LE CYCLE DE VIE ACCEPTE « payé → en attente » POUR CE SEUL CAS
-- ---------------------------------------------------------------------
-- Redéfinition du fichier 04 : seule change la liste des passages permis.
-- Le passage n'est possible que pendant l'annulation d'un reçu (réglage
-- local posé par annuler_acte_du_recu ci-dessous), jamais directement.
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
      -- Reçu annulé pour une erreur de caisse : l'acte revient dans la file (fichier 26)
      or (old.statut = 'paye' and new.statut = 'en_attente_paiement'
          and current_setting('etat_civil.remise_en_file', true) = 'oui')
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


-- ---------------------------------------------------------------------
-- 3. ANNULATION : LE CHOIX DU CAISSIER EST GARDÉ, PUIS APPLIQUÉ À L'ACTE
-- ---------------------------------------------------------------------
-- Redéfinition du fichier 05 : la suite choisie est conservée.
create or replace function public.controler_modification_recu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motif text;
  v_suite text;
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

  v_motif := btrim(regexp_replace(coalesce(new.motif_annulation, ''), '\s+', ' ', 'g'));
  if length(v_motif) < 3 then
    raise exception 'Indiquez le motif de l''annulation (3 caractères au moins).' using errcode = 'P0001';
  end if;
  v_suite := coalesce(new.suite_annulation, 'acte_annule');

  -- Tout reste identique, sauf les informations d'annulation
  new := old;
  new.statut           := 'annule';
  new.motif_annulation := v_motif;
  new.suite_annulation := v_suite;
  new.annule_le        := now();
  new.annule_par       := auth.uid();
  return new;
end;
$$;

create or replace function public.annuler_acte_du_recu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_acte;
begin
  select statut into v_statut from public.actes where id = new.acte_id for update;

  if new.suite_annulation = 'acte_remis_en_file' then
    if v_statut <> 'paye' then
      raise exception 'Cet acte est déjà « % » : il ne peut pas revenir dans la file. Annulez le reçu en annulant aussi l''acte.',
        case v_statut when 'delivre' then 'délivré' when 'annule' then 'annulé' when 'exonere' then 'exonéré' else v_statut::text end
        using errcode = 'P0001';
    end if;
    perform set_config('etat_civil.remise_en_file', 'oui', true);
    update public.actes set statut = 'en_attente_paiement' where id = new.acte_id;
    perform set_config('etat_civil.remise_en_file', '', true);
  else
    update public.actes
       set statut = 'annule',
           motif_annulation = 'Reçu ' || new.numero_recu || ' annulé : ' || new.motif_annulation
     where id = new.acte_id
       and statut <> 'annule';
  end if;
  return null;
end;
$$;

-- Fonction prête à l'emploi (remplace celle du fichier 05) :
-- p_remettre_en_file = vrai → l'acte revient dans la file « À encaisser ».
drop function public.annuler_recu(uuid, text);

create or replace function public.annuler_recu(p_recu uuid, p_motif text, p_remettre_en_file boolean default false)
returns public.recus
language plpgsql
set search_path = ''
as $$
declare
  v_recu public.recus;
begin
  update public.recus
     set statut = 'annule',
         motif_annulation = p_motif,
         suite_annulation = case when p_remettre_en_file then 'acte_remis_en_file' else 'acte_annule' end
   where id = p_recu
  returning * into v_recu;
  if v_recu.id is null then
    raise exception 'Reçu introuvable.' using errcode = 'P0001';
  end if;
  return v_recu;
end;
$$;

comment on function public.annuler_recu(uuid, text, boolean) is
  'Annule un reçu (motif obligatoire), avant la clôture : l''acte est annulé, ou remis dans la file à encaisser.';

revoke execute on function public.annuler_recu(uuid, text, boolean) from public, anon;
grant  execute on function public.annuler_recu(uuid, text, boolean) to authenticated;
