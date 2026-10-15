-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 09 : LA RECHERCHE D'UN ACTE
-- ---------------------------------------------------------------------
-- Une seule barre de recherche, deux façons de trouver un acte :
--
--   1. PAR ID : « MUL-EXNAIS-2026-000123 »
--      - majuscules/minuscules et espaces sans importance ;
--      - les zéros du numéro peuvent être omis (« MUL-EXNAIS-2026-123 ») ;
--      - un début d'ID liste toute la série (« MUL-EXNAIS-2026 »).
--
--   2. PAR NOM : titulaire, second époux ou demandeur
--      - l'ordre des noms n'a pas d'importance (« Bahati Mugisho »
--        retrouve « MUGISHO Bahati Jean ») ;
--      - les accents et majuscules non plus (« elise » -> « Élise ») ;
--      - les fautes de frappe sont tolérées (« Mugiso » -> « Mugisho ») ;
--      - le numéro d'un ancien registre papier est aussi reconnu.
--
-- Filtres facultatifs : type d'acte, année, statut.
-- La recherche respecte les droits : un agent ne trouve que les actes de
-- son entité ; l'admin cherche dans les 4.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. INDEX : POUR UNE RECHERCHE RAPIDE MÊME AVEC DES DIZAINES DE MILLIERS D'ACTES
-- ---------------------------------------------------------------------
create index actes_recherche_noms_trgm_idx
  on public.actes using gin (recherche_noms extensions.gin_trgm_ops);

create index actes_numero_registre_trgm_idx
  on public.actes using gin (lower(numero_registre) extensions.gin_trgm_ops);

-- Recherche par début d'ID (« MUL-EXNAIS-2026… ») : index spécial
-- « préfixe », indispensable quel que soit le réglage de langue du serveur
create index actes_identifiant_prefixe_idx
  on public.actes (identifiant text_pattern_ops);


-- ---------------------------------------------------------------------
-- 2. LA FONCTION DE RECHERCHE
-- ---------------------------------------------------------------------
create or replace function public.rechercher_actes(
  p_texte      text,
  p_type_acte  uuid default null,
  p_annee      integer default null,
  p_statut     public.statut_acte default null,
  p_limite     integer default 50
)
returns table (
  acte_id          uuid,
  identifiant      text,
  entite_code      text,
  type_code        text,
  type_libelle     text,
  titulaire_nom    text,
  titulaire_2_nom  text,
  demandeur_nom    text,
  numero_registre  text,
  date_acte        date,
  statut           public.statut_acte,
  a_un_scan        boolean,
  correspondance   text,      -- 'id_exact', 'id_debut' ou 'nom'
  pertinence       real       -- de 0 à 1 : 1 = correspondance parfaite
)
language plpgsql
stable
-- Exécutée avec les droits de la personne connectée : les règles d'accès
-- du fichier 08 s'appliquent automatiquement aux résultats.
set search_path = ''
-- Seuil de tolérance aux fautes de frappe (0 = tout passe, 1 = exact)
set pg_trgm.word_similarity_threshold = 0.5
as $$
declare
  v_saisie  text := upper(regexp_replace(coalesce(p_texte, ''), '\s+', '', 'g'));
  v_limite  integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_id      text;
  v_mots    text[];
  v_nom     text;
begin
  -- -------------------------------------------------------------------
  -- Cas 1 : un ID complet (ENTITÉ-TYPE-ANNÉE-NUMÉRO)
  -- -------------------------------------------------------------------
  if v_saisie ~ '^[A-Z]{3}-[A-Z]{2,6}-[0-9]{4}-[0-9]{1,6}$' then
    -- Les zéros manquants sont rétablis : MUL-EXNAIS-2026-123 -> …-000123
    v_id := regexp_replace(v_saisie, '-([0-9]{1,6})$', '') || '-'
            || lpad(substring(v_saisie from '([0-9]{1,6})$'), 6, '0');

    return query
      select a.id, a.identifiant, e.code, t.code, t.libelle,
             a.titulaire_nom, a.titulaire_2_nom, a.demandeur_nom, a.numero_registre,
             a.date_acte, a.statut,
             exists (select 1 from public.documents_scannes d where d.acte_id = a.id),
             'id_exact'::text, 1::real
      from public.actes a
      join public.entites e     on e.id = a.entite_id
      join public.types_actes t on t.id = a.type_acte_id
      where a.identifiant = v_id;
    return;
  end if;

  -- -------------------------------------------------------------------
  -- Cas 2 : un début d'ID (ex. MUL-EXNAIS-2026 ou MUL-EXNAIS)
  -- -------------------------------------------------------------------
  if v_saisie ~ '^[A-Z]{3}-[A-Z]{2,6}(-[0-9]{0,4})?(-[0-9]{0,6})?$' then
    return query
      select a.id, a.identifiant, e.code, t.code, t.libelle,
             a.titulaire_nom, a.titulaire_2_nom, a.demandeur_nom, a.numero_registre,
             a.date_acte, a.statut,
             exists (select 1 from public.documents_scannes d where d.acte_id = a.id),
             'id_debut'::text, 0.9::real
      from public.actes a
      join public.entites e     on e.id = a.entite_id
      join public.types_actes t on t.id = a.type_acte_id
      where a.identifiant like v_saisie || '%'
        and (p_type_acte is null or a.type_acte_id = p_type_acte)
        and (p_annee     is null or a.annee = p_annee)
        and (p_statut    is null or a.statut = p_statut)
      order by a.identifiant desc
      limit v_limite;
    return;
  end if;

  -- -------------------------------------------------------------------
  -- Cas 3 : un nom (ou un numéro de registre papier)
  -- -------------------------------------------------------------------
  v_nom := public.normaliser_texte(p_texte);
  if v_nom is null or length(replace(v_nom, ' ', '')) < 2 then
    raise exception 'Tapez au moins 2 caractères pour lancer une recherche.' using errcode = 'P0001';
  end if;

  -- Mots d'au moins 2 lettres ; l'ordre n'a pas d'importance
  select array_agg(m) into v_mots
  from unnest(string_to_array(v_nom, ' ')) as m
  where length(m) >= 2;

  if v_mots is null then
    v_mots := array[v_nom];
  end if;

  return query
    select a.id, a.identifiant, e.code, t.code, t.libelle,
           a.titulaire_nom, a.titulaire_2_nom, a.demandeur_nom, a.numero_registre,
           a.date_acte, a.statut,
           exists (select 1 from public.documents_scannes d where d.acte_id = a.id),
           'nom'::text,
           greatest(
             -- moyenne de la ressemblance de chaque mot tapé
             (select avg(extensions.word_similarity(m, a.recherche_noms)) from unnest(v_mots) m),
             -- ou correspondance avec le numéro du registre papier
             case when a.numero_registre is not null
                       and lower(a.numero_registre) like '%' || lower(btrim(p_texte)) || '%'
                  then 1 else 0 end
           )::real as score
    from public.actes a
    join public.entites e     on e.id = a.entite_id
    join public.types_actes t on t.id = a.type_acte_id
    where (
            -- chaque mot tapé ressemble à un mot du nom
            (a.recherche_noms operator(extensions.%>) v_mots[1]
             and not exists (
               select 1 from unnest(v_mots) m
               where not (a.recherche_noms operator(extensions.%>) m)
             ))
            or (a.numero_registre is not null
                and lower(a.numero_registre) like '%' || lower(btrim(p_texte)) || '%')
          )
      and (p_type_acte is null or a.type_acte_id = p_type_acte)
      and (p_annee     is null or a.annee = p_annee)
      and (p_statut    is null or a.statut = p_statut)
    order by score desc, a.date_acte desc, a.identifiant
    limit v_limite;
end;
$$;

comment on function public.rechercher_actes(text, uuid, integer, public.statut_acte, integer) is
  'Recherche un acte par ID (complet ou début) ou par nom (titulaire, époux, demandeur), avec tolérance aux fautes.';

grant execute on function public.rechercher_actes(text, uuid, integer, public.statut_acte, integer) to authenticated;
revoke execute on function public.rechercher_actes(text, uuid, integer, public.statut_acte, integer) from anon, public;
