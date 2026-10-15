-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 10 : LES RAPPORTS
-- ---------------------------------------------------------------------
-- Quatre périodes : JOUR, MOIS, SEMESTRE (janv.–juin / juil.–déc.), ANNÉE.
-- Trois rapports, chacun pour une entité ou pour toutes (consolidé) :
--
--   1. rapport_synthese  : les chiffres clés de la période, par entité,
--                          plus une ligne TOTAL ; comparaison avec la
--                          période précédente.
--   2. rapport_par_acte  : nombre d'actes et recettes par type d'acte,
--                          part Nationaux / Étrangers.
--   3. rapport_evolution : la période découpée (jour par jour pour un mois,
--                          mois par mois pour un semestre ou une année).
--
-- Les rapports respectent les droits : un agent ne voit que son entité ;
-- l'admin voit chaque entité et le total des 4.
-- Règles de calcul :
--   - un reçu compte dans la journée de caisse où il a été émis ;
--   - un reçu annulé ne compte pas dans les recettes (il est compté à part) ;
--   - les dollars et les francs sont totalisés séparément, puis convertis
--     en FC au taux du jour de chaque paiement ("équivalent FC").
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LES PÉRIODES
-- ---------------------------------------------------------------------
create type public.periodicite as enum ('jour', 'mois', 'semestre', 'annee');

-- Début, fin et libellé de la période qui contient une date donnée
create or replace function public.periode(p_periodicite public.periodicite, p_date date)
returns table (debut date, fin date, libelle text)
language sql
immutable
set search_path = ''
as $$
  with b as (
    select
      case p_periodicite
        when 'jour'     then p_date
        when 'mois'     then date_trunc('month', p_date)::date
        when 'semestre' then make_date(extract(year from p_date)::int,
                                       case when extract(month from p_date) <= 6 then 1 else 7 end, 1)
        when 'annee'    then date_trunc('year', p_date)::date
      end as debut
  )
  select
    b.debut,
    (case p_periodicite
       when 'jour'     then b.debut
       when 'mois'     then (b.debut + interval '1 month')::date - 1
       when 'semestre' then (b.debut + interval '6 months')::date - 1
       when 'annee'    then (b.debut + interval '1 year')::date - 1
     end) as fin,
    case p_periodicite
      when 'jour'     then to_char(b.debut, 'DD/MM/YYYY')
      when 'mois'     then (array['Janvier','Février','Mars','Avril','Mai','Juin','Juillet',
                                  'Août','Septembre','Octobre','Novembre','Décembre'])
                             [extract(month from b.debut)::int] || ' ' || extract(year from b.debut)
      when 'semestre' then case when extract(month from b.debut) = 1 then '1er' else '2e' end
                             || ' semestre ' || extract(year from b.debut)
      when 'annee'    then 'Année ' || extract(year from b.debut)
    end as libelle
  from b
$$;

comment on function public.periode(public.periodicite, date) is
  'Début, fin et libellé (« Octobre 2026 », « 2e semestre 2026 »…) de la période contenant une date.';


-- ---------------------------------------------------------------------
-- 2. SYNTHÈSE DE LA PÉRIODE (par entité + TOTAL)
-- ---------------------------------------------------------------------
create or replace function public.rapport_synthese(
  p_periodicite  public.periodicite,
  p_date         date default null,
  p_entite       uuid default null      -- vide = toutes les entités visibles
)
returns table (
  entite_code                text,       -- 'TOTAL' pour la ligne de consolidation
  entite                     text,
  periode                    text,
  du                         date,
  au                         date,
  actes_enregistres          bigint,     -- nouveaux actes créés dans la période
  actes_delivres             bigint,
  recus_valides              bigint,
  recus_annules              bigint,
  recettes_usd               numeric,    -- dollars réellement encaissés
  recettes_cdf               numeric,    -- francs réellement encaissés
  recettes_equivalent_cdf    numeric,    -- tout converti en FC
  exonerations               bigint,
  exonere_usd                numeric,    -- montants non perçus (actes en $)
  exonere_cdf                numeric,    -- montants non perçus (actes en FC)
  jours_clotures             bigint,
  ecart_caisse_usd           numeric,    -- somme des écarts constatés aux clôtures
  ecart_caisse_cdf           numeric,
  actes_payes_sans_scan      bigint,     -- payés/exonérés dans la période, toujours sans scan
  precedent_equivalent_cdf   numeric,    -- même indicateur, période précédente
  variation_pct              numeric     -- évolution par rapport à la période précédente
)
language sql
stable
set search_path = ''
as $$
  with p as (
    select * from public.periode(p_periodicite, coalesce(p_date, public.aujourdhui()))
  ),
  prec as (
    select pp.* from p, lateral public.periode(p_periodicite, p.debut - 1) pp
  ),
  ent as (
    select e.id, e.code, e.nom
    from public.entites e
    where p_entite is null or e.id = p_entite
  ),
  par_entite as (
    select
      ent.code, ent.nom,
      (select count(*) from public.actes a, p
        where a.entite_id = ent.id and a.origine = 'nouveau'
          and a.date_acte between p.debut and p.fin)                           as actes_enregistres,
      (select count(*) from public.actes a, p
        where a.entite_id = ent.id and a.origine = 'nouveau' and a.statut = 'delivre'
          and public.journee_de(a.delivre_le) between p.debut and p.fin)       as actes_delivres,
      r.recus_valides, r.recus_annules, r.usd, r.cdf, r.equiv,
      x.nb as exonerations, x.usd as exonere_usd, x.cdf as exonere_cdf,
      c.jours, c.ecart_usd, c.ecart_cdf,
      (select count(*) from public.vue_actes_non_archives v, p
        where v.entite_id = ent.id and v.journee_paiement between p.debut and p.fin) as sans_scan,
      (select coalesce(sum(r2.montant_equivalent_cdf), 0) from public.recus r2, prec
        where r2.entite_id = ent.id and r2.statut = 'valide'
          and r2.journee between prec.debut and prec.fin)                      as precedent
    from ent
    cross join p
    cross join lateral (
      select
        count(*) filter (where rr.statut = 'valide')                                         as recus_valides,
        count(*) filter (where rr.statut = 'annule')                                         as recus_annules,
        coalesce(sum(rr.montant_recu) filter (where rr.statut = 'valide' and rr.devise_recue = 'USD'), 0) as usd,
        coalesce(sum(rr.montant_recu) filter (where rr.statut = 'valide' and rr.devise_recue = 'CDF'), 0) as cdf,
        coalesce(sum(rr.montant_equivalent_cdf) filter (where rr.statut = 'valide'), 0)      as equiv
      from public.recus rr
      where rr.entite_id = ent.id and rr.journee between p.debut and p.fin
    ) r
    cross join lateral (
      select count(*) as nb,
             coalesce(sum(xx.montant_du) filter (where xx.devise_du = 'USD'), 0) as usd,
             coalesce(sum(xx.montant_du) filter (where xx.devise_du = 'CDF'), 0) as cdf
      from public.exonerations xx
      where xx.entite_id = ent.id and xx.journee between p.debut and p.fin
    ) x
    cross join lateral (
      select count(*) as jours,
             coalesce(sum(cc.ecart_usd), 0) as ecart_usd,
             coalesce(sum(cc.ecart_cdf), 0) as ecart_cdf
      from public.clotures_caisse cc
      where cc.entite_id = ent.id and cc.journee between p.debut and p.fin
    ) c
  ),
  lignes as (
    select code, nom, actes_enregistres, actes_delivres, recus_valides, recus_annules,
           usd, cdf, equiv, exonerations, exonere_usd, exonere_cdf,
           jours, ecart_usd, ecart_cdf, sans_scan, precedent, 1 as ordre
    from par_entite
    union all
    -- Ligne TOTAL, seulement quand plusieurs entités sont présentées
    select 'TOTAL', 'Total des entités',
           sum(actes_enregistres), sum(actes_delivres), sum(recus_valides), sum(recus_annules),
           sum(usd), sum(cdf), sum(equiv), sum(exonerations), sum(exonere_usd), sum(exonere_cdf),
           sum(jours), sum(ecart_usd), sum(ecart_cdf), sum(sans_scan), sum(precedent), 2
    from par_entite
    having count(*) > 1
  )
  select
    l.code, l.nom, p.libelle, p.debut, p.fin,
    l.actes_enregistres::bigint, l.actes_delivres::bigint,
    l.recus_valides::bigint, l.recus_annules::bigint,
    l.usd, l.cdf, l.equiv,
    l.exonerations::bigint, l.exonere_usd, l.exonere_cdf,
    l.jours::bigint, l.ecart_usd, l.ecart_cdf,
    l.sans_scan::bigint,
    l.precedent,
    case when l.precedent = 0 then null
         else round(100.0 * (l.equiv - l.precedent) / l.precedent, 1) end
  from lignes l
  cross join p
  order by l.ordre, l.code
$$;

comment on function public.rapport_synthese(public.periodicite, date, uuid) is
  'Chiffres clés d''une période (jour, mois, semestre, année) par entité, avec ligne TOTAL et comparaison.';


-- ---------------------------------------------------------------------
-- 3. DÉTAIL PAR TYPE D'ACTE
-- ---------------------------------------------------------------------
create or replace function public.rapport_par_acte(
  p_periodicite  public.periodicite,
  p_date         date default null,
  p_entite       uuid default null
)
returns table (
  entite_code              text,
  numero                   smallint,
  type_code                text,
  type_libelle             text,
  famille                  public.famille_acte,
  actes_payes              bigint,
  dont_nationaux           bigint,
  dont_etrangers           bigint,
  exonerations             bigint,
  recettes_usd             numeric,
  recettes_cdf             numeric,
  recettes_equivalent_cdf  numeric,
  part_recettes_pct        numeric    -- part de ce type dans les recettes de l'entité
)
language sql
stable
set search_path = ''
as $$
  with p as (
    select * from public.periode(p_periodicite, coalesce(p_date, public.aujourdhui()))
  ),
  mouvements as (
    -- reçus valides de la période
    select a.entite_id, a.type_acte_id, a.categorie, 'recu' as nature,
           r.devise_recue, r.montant_recu, r.montant_equivalent_cdf
    from public.recus r
    join public.actes a on a.id = r.acte_id
    cross join p
    where r.statut = 'valide' and r.journee between p.debut and p.fin
      and (p_entite is null or r.entite_id = p_entite)
    union all
    -- exonérations de la période
    select a.entite_id, a.type_acte_id, a.categorie, 'exoneration',
           null, 0, 0
    from public.exonerations x
    join public.actes a on a.id = x.acte_id
    cross join p
    where x.journee between p.debut and p.fin
      and (p_entite is null or x.entite_id = p_entite)
  ),
  agrege as (
    select
      m.entite_id, m.type_acte_id,
      count(*) filter (where nature = 'recu')                                 as actes_payes,
      count(*) filter (where nature = 'recu' and categorie = 'national')      as dont_nationaux,
      count(*) filter (where nature = 'recu' and categorie = 'etranger')      as dont_etrangers,
      count(*) filter (where nature = 'exoneration')                          as exonerations,
      coalesce(sum(montant_recu) filter (where devise_recue = 'USD'), 0)      as usd,
      coalesce(sum(montant_recu) filter (where devise_recue = 'CDF'), 0)      as cdf,
      coalesce(sum(montant_equivalent_cdf), 0)                                as equiv
    from mouvements m
    group by m.entite_id, m.type_acte_id
  )
  select
    e.code, t.numero, t.code, t.libelle, t.famille,
    g.actes_payes, g.dont_nationaux, g.dont_etrangers, g.exonerations,
    g.usd, g.cdf, g.equiv,
    case when sum(g.equiv) over (partition by g.entite_id) = 0 then null
         else round(100.0 * g.equiv / sum(g.equiv) over (partition by g.entite_id), 1) end
  from agrege g
  join public.entites e     on e.id = g.entite_id
  join public.types_actes t on t.id = g.type_acte_id
  order by e.code, g.equiv desc, g.actes_payes desc, t.numero
$$;

comment on function public.rapport_par_acte(public.periodicite, date, uuid) is
  'Par entité et type d''acte : actes payés (nationaux/étrangers), exonérations, recettes et part des recettes.';


-- ---------------------------------------------------------------------
-- 4. ÉVOLUTION DANS LA PÉRIODE
-- ---------------------------------------------------------------------
-- Mois -> jour par jour ; semestre ou année -> mois par mois ; jour -> la journée.
-- Toutes les sous-périodes sont présentes, même sans recette (valeur 0),
-- pour que les graphiques n'aient pas de trou.
create or replace function public.rapport_evolution(
  p_periodicite  public.periodicite,
  p_date         date default null,
  p_entite       uuid default null      -- vide = toutes les entités visibles, additionnées
)
returns table (
  debut                    date,
  libelle                  text,
  recus_valides            bigint,
  recettes_usd             numeric,
  recettes_cdf             numeric,
  recettes_equivalent_cdf  numeric,
  exonerations             bigint
)
language sql
stable
set search_path = ''
as $$
  with p as (
    select * from public.periode(p_periodicite, coalesce(p_date, public.aujourdhui()))
  ),
  pas as (
    select case when p_periodicite in ('semestre', 'annee') then 'mois'::public.periodicite
                else 'jour'::public.periodicite end as unite
  ),
  sous_periodes as (
    select s.debut, s.fin, s.libelle
    from p, pas,
         lateral generate_series(p.debut, p.fin,
                                 case when pas.unite = 'mois' then interval '1 month' else interval '1 day' end) g,
         lateral public.periode(pas.unite, g::date) s
  )
  select
    sp.debut,
    sp.libelle,
    (select count(*) from public.recus r
      where r.statut = 'valide' and r.journee between sp.debut and sp.fin
        and (p_entite is null or r.entite_id = p_entite)),
    (select coalesce(sum(r.montant_recu), 0) from public.recus r
      where r.statut = 'valide' and r.devise_recue = 'USD' and r.journee between sp.debut and sp.fin
        and (p_entite is null or r.entite_id = p_entite)),
    (select coalesce(sum(r.montant_recu), 0) from public.recus r
      where r.statut = 'valide' and r.devise_recue = 'CDF' and r.journee between sp.debut and sp.fin
        and (p_entite is null or r.entite_id = p_entite)),
    (select coalesce(sum(r.montant_equivalent_cdf), 0) from public.recus r
      where r.statut = 'valide' and r.journee between sp.debut and sp.fin
        and (p_entite is null or r.entite_id = p_entite)),
    (select count(*) from public.exonerations x
      where x.journee between sp.debut and sp.fin
        and (p_entite is null or x.entite_id = p_entite))
  from sous_periodes sp
  order by sp.debut
$$;

comment on function public.rapport_evolution(public.periodicite, date, uuid) is
  'Recettes découpées dans la période (jours d''un mois, mois d''un semestre ou d''une année), sans trou.';


-- ---------------------------------------------------------------------
-- 5. DROITS
-- ---------------------------------------------------------------------
-- Fonctions exécutées avec les droits de la personne connectée : les
-- règles d'accès du fichier 08 limitent automatiquement les chiffres à
-- ce qu'elle a le droit de voir.
revoke execute on function public.periode(public.periodicite, date)                  from anon, public;
revoke execute on function public.rapport_synthese(public.periodicite, date, uuid)   from anon, public;
revoke execute on function public.rapport_par_acte(public.periodicite, date, uuid)   from anon, public;
revoke execute on function public.rapport_evolution(public.periodicite, date, uuid)  from anon, public;
grant  execute on function public.periode(public.periodicite, date)                  to authenticated;
grant  execute on function public.rapport_synthese(public.periodicite, date, uuid)   to authenticated;
grant  execute on function public.rapport_par_acte(public.periodicite, date, uuid)   to authenticated;
grant  execute on function public.rapport_evolution(public.periodicite, date, uuid)  to authenticated;
