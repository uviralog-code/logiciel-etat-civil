-- =====================================================================
-- MIGRATION 18 : CATALOGUE DES ACTES PROTÉGÉ
-- ---------------------------------------------------------------------
-- Décisions de l'étape 5 (fichier 27) :
--
-- 1. Un type d'acte ne se supprime JAMAIS : on le retire du catalogue
--    (actif = faux) et on peut le remettre. Les actes déjà enregistrés,
--    leurs reçus et l'historique des prix restent intacts.
-- 2. Après sa création, seuls le libellé, la famille et la couleur d'un
--    type d'acte se corrigent. Le code (il figure dans chaque ID d'acte),
--    le numéro de la fiche officielle, le modèle de fiche de détails et le
--    choix d'un tarif Étrangers distinct sont fixés pour toujours.
-- 3. Un nouveau type d'acte est créé AVEC son prix (National, et Étranger
--    s'il en a un), en une seule opération : jamais d'acte sans prix. Ce
--    prix entre en vigueur au plus tôt demain, comme tout tarif (migration 17).
--
-- Comme pour la migration 17, la maintenance de la base n'est pas concernée.
-- =====================================================================

-- 1 et 2. Protections du catalogue
create or replace function public.proteger_catalogue()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.saisie_par_l_application() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Un type d''acte ne se supprime jamais : retirez-le du catalogue. Il reste dans l''historique des actes et des prix.'
      using errcode = 'P0001';
  end if;

  if new.code is distinct from old.code
     or new.numero is distinct from old.numero
     or new.modele_fiche is distinct from old.modele_fiche
     or new.tarif_distinct_etranger is distinct from old.tarif_distinct_etranger then
    raise exception 'Le code, le numéro, le modèle de fiche et le tarif Étrangers d''un type d''acte sont fixés à sa création. Seuls le libellé, la famille et la couleur se corrigent.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger types_actes_protection
  before update or delete on public.types_actes
  for each row execute function public.proteger_catalogue();


-- 3. Ajout d'un type d'acte avec son prix, en une seule opération
--    (avec les droits de la personne connectée : seul l'administrateur
--    vérifié peut écrire dans le catalogue et la grille commune, fichier 08)
create or replace function public.ajouter_type_acte(
  p_numero            smallint,
  p_code              text,
  p_libelle           text,
  p_famille           public.famille_acte,
  p_modele_fiche      public.modele_fiche,
  p_distinct_etranger boolean,
  p_couleur           text,
  p_montant_national  numeric,
  p_devise_national   public.devise,
  p_montant_etranger  numeric,
  p_devise_etranger   public.devise,
  p_en_vigueur_depuis date,
  p_motif             text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.est_admin() then
    raise exception 'Action réservée à l''administrateur connecté avec son code de vérification.'
      using errcode = '42501';
  end if;
  if p_montant_national is null or p_devise_national is null then
    raise exception 'Un nouveau type d''acte a toujours un prix : indiquez le tarif National.' using errcode = 'P0001';
  end if;
  if p_distinct_etranger and (p_montant_etranger is null or p_devise_etranger is null) then
    raise exception 'Cet acte a un tarif Étrangers distinct : indiquez-le aussi.' using errcode = 'P0001';
  end if;

  insert into public.types_actes (numero, code, libelle, famille, modele_fiche, tarif_distinct_etranger, couleur)
  values (p_numero, p_code, btrim(p_libelle), p_famille, p_modele_fiche, p_distinct_etranger, p_couleur)
  returning id into v_id;

  insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
  values (v_id, 'national', p_montant_national, p_devise_national, p_en_vigueur_depuis, p_motif);

  if p_distinct_etranger then
    insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
    values (v_id, 'etranger', p_montant_etranger, p_devise_etranger, p_en_vigueur_depuis, p_motif);
  end if;

  return v_id;
end;
$$;

comment on function public.ajouter_type_acte is
  'Ajoute un type d''acte au catalogue avec son prix (National, et Étranger s''il en a un), en une seule opération.';


-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
revoke execute on function public.proteger_catalogue() from public, anon, authenticated;
revoke execute on function public.ajouter_type_acte(smallint, text, text, public.famille_acte, public.modele_fiche, boolean, text, numeric, public.devise, numeric, public.devise, date, text) from public, anon;
grant  execute on function public.ajouter_type_acte(smallint, text, text, public.famille_acte, public.modele_fiche, boolean, text, numeric, public.devise, numeric, public.devise, date, text) to authenticated;
