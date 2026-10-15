-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 24 : ENCAISSEMENT (étape 7, fichier 38)
-- ---------------------------------------------------------------------
-- Décisions validées pour l'écran « Encaissement » :
--
-- 1. Un acte « en attente de paiement » est chez le Caissier : l'Officier
--    ne peut plus le modifier ni le reprendre. Seuls gestes possibles :
--    encaisser, exonérer ou renvoyer (Caissier) ; annuler avec motif
--    (Officier ou administrateur). Le prix ne peut donc plus changer
--    pendant que le Caissier encaisse.
-- 2. Les montants en francs issus d'une conversion de dollars sont
--    arrondis à la centaine la plus proche (7 182,5 FC → 7 200 FC) :
--    un montant au franc près ne peut pas être payé en billets.
-- 3. Un acte au tarif en francs se paie en francs (18 000 FC ne devient
--    plus 6,32 $). Le choix $ / FC reste possible pour un acte en dollars.
-- 4. « encaisser_verifie » : l'écran envoie le montant qu'il a annoncé ;
--    si le taux du jour a changé entre-temps, rien n'est enregistré et le
--    Caissier voit le nouveau montant avant de valider de nouveau.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ACTE EN ATTENTE DE PAIEMENT : FIGÉ POUR L'OFFICIER
-- ---------------------------------------------------------------------
-- Redéfinition du contrôle des droits (fichiers 08 et 12) : seule la
-- branche de l'Officier change.
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
    -- Acte chez le Caissier : seulement l'annuler (avec motif)
    if old.statut = 'en_attente_paiement' then
      v_reste_n := to_jsonb(new) - array['statut', 'motif_annulation', 'annule_le', 'annule_par', 'modifie_le', 'recherche_noms'];
      v_reste_o := to_jsonb(old) - array['statut', 'motif_annulation', 'annule_le', 'annule_par', 'modifie_le', 'recherche_noms'];
      if not (new.statut = 'annule' and v_reste_n = v_reste_o) then
        raise exception 'Cet acte est chez le Caissier (en attente de paiement) : il ne peut plus être modifié. Demandez au Caissier de vous le renvoyer, ou annulez-le.'
          using errcode = 'P0001';
      end if;
    end if;
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


-- ---------------------------------------------------------------------
-- 2. CONVERSION EN FRANCS : À LA CENTAINE LA PLUS PROCHE
-- ---------------------------------------------------------------------
-- Les tarifs fixés en francs ne changent pas ; seuls les montants obtenus
-- en multipliant des dollars par le taux sont arrondis à 100 FC (jamais
-- moins de 100 FC pour un montant positif).
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
    when p_montant * p_taux <= 0 then 0
    else greatest(round(p_montant * p_taux / 100, 0) * 100, 100)
  end
$$;

comment on function public.convertir_en_cdf(numeric, public.devise, numeric) is
  'Convertit un montant en FC. Dollars × taux : arrondi à la centaine la plus proche (au moins 100 FC). Un montant en $ sans taux donne une valeur vide.';


-- ---------------------------------------------------------------------
-- 3. PRÉPARATION D'UN REÇU : ACTE EN FRANCS = PAIEMENT EN FRANCS
-- ---------------------------------------------------------------------
-- Redéfinition du fichier 05 : seuls changent le refus d'un paiement en
-- dollars pour un acte en francs, et le taux exigé seulement pour un acte
-- en dollars.
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

  if new.devise_du = 'CDF' and new.devise_recue = 'USD' then
    raise exception 'Cet acte est au tarif en francs : il se paie en francs congolais.' using errcode = 'P0001';
  end if;

  -- Taux du jour : indispensable pour un acte en dollars
  v_taux := public.taux_applicable(new.entite_id, new.encaisse_le);
  if new.devise_du = 'USD' and v_taux is null then
    raise exception 'Aucun taux de change n''est saisi pour cette entité : enregistrez le taux du jour avant d''encaisser.'
      using errcode = 'P0001';
  end if;
  new.taux_applique := case when new.devise_du = 'USD' then v_taux end;

  -- Montant à recevoir dans la monnaie choisie par le demandeur
  new.montant_recu := case
    when new.devise_recue = new.devise_du then new.montant_du
    else public.convertir_en_cdf(new.montant_du, 'USD', v_taux)   -- acte en $ payé en FC
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


-- ---------------------------------------------------------------------
-- 4. ENCAISSER AU MONTANT ANNONCÉ
-- ---------------------------------------------------------------------
-- L'écran affiche le montant à percevoir, l'usager paie ce montant : le
-- reçu doit porter exactement ce montant. Si la base calcule autre chose
-- (taux du jour changé depuis l'affichage), tout est annulé — reçu,
-- numéro et paiement — et le Caissier voit le nouveau montant.
create or replace function public.encaisser_verifie(
  p_acte            uuid,
  p_devise_recue    public.devise,
  p_montant_annonce numeric
)
returns public.recus
language plpgsql
set search_path = ''
as $$
declare
  v_recu public.recus;
begin
  if p_devise_recue is null or p_montant_annonce is null then
    raise exception 'Indiquez la monnaie et le montant à percevoir.' using errcode = 'P0001';
  end if;
  insert into public.recus (acte_id, devise_recue) values (p_acte, p_devise_recue)
  returning * into v_recu;
  if v_recu.montant_recu <> p_montant_annonce then
    raise exception 'Le montant à percevoir a changé (nouveau taux du jour) : % au lieu de %. Rien n''a été encaissé ; vérifiez le nouveau montant puis validez de nouveau.',
      public.montant_lisible(v_recu.montant_recu, v_recu.devise_recue), public.montant_lisible(p_montant_annonce, p_devise_recue)
      using errcode = 'P0001';
  end if;
  return v_recu;
end;
$$;

-- « 85 500 FC », « 30 $ » (messages d'erreur)
create or replace function public.montant_lisible(p_montant numeric, p_devise public.devise)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(
           case when p_montant = trunc(p_montant) then to_char(p_montant, 'FM999,999,999,990')
                else to_char(p_montant, 'FM999,999,999,990.00') end,
           ',', ' '), '.', ',')
         || case when p_devise = 'CDF' then ' FC' else ' $' end
$$;

comment on function public.encaisser_verifie(uuid, public.devise, numeric) is
  'Émet le reçu d''un acte, seulement si le montant calculé par la base est celui annoncé à l''usager.';

revoke execute on function public.encaisser_verifie(uuid, public.devise, numeric) from public, anon;
grant  execute on function public.encaisser_verifie(uuid, public.devise, numeric) to authenticated;
revoke execute on function public.montant_lisible(numeric, public.devise) from public, anon;
grant  execute on function public.montant_lisible(numeric, public.devise) to authenticated;
