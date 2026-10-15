-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 08 : SÉCURITÉ ET DROITS D'ACCÈS
-- ---------------------------------------------------------------------
-- Jusqu'ici, toutes les tables étaient verrouillées. Ce fichier ouvre
-- l'accès, table par table, selon le tableau des droits validé :
--
--   | Données                 | Admin              | Officier            | Caissier            |
--   |-------------------------|--------------------|---------------------|---------------------|
--   | Entités                 | gère les 4         | la sienne           | la sienne           |
--   | Comptes                 | gère               | son profil          | son profil          |
--   | Catalogue, grille       | gère               | consulte            | consulte            |
--   | Tarifs de l'entité      | consulte (écarts)  | AJUSTE              | consulte            |
--   | Taux de change          | consulte           | consulte            | SAISIT              |
--   | Actes et fiches         | consulte, annule   | crée, corrige,      | consulte, renvoie   |
--   |                         |                    | transmet, délivre   | pour correction     |
--   | Reçus, exonérations     | consulte, annule   | consulte            | encaisse, exonère,  |
--   |                         | un reçu (avant     |                     | annule              |
--   |                         | clôture)           |                     |                     |
--   | Clôture de caisse       | consulte           | consulte            | CLÔTURE             |
--   | Scans et lots           | consulte           | DÉPOSE, gère lots   | consulte            |
--   | Journal d'audit         | SEUL à consulter   | —                   | —                   |
--   | Journal des connexions  | tout               | les siennes         | les siennes         |
--
-- Règles générales :
--   - un agent ne voit et ne touche QUE les données de son entité ;
--   - un compte désactivé n'a plus accès à rien ;
--   - un visiteur non connecté (anon) n'a accès à rien, sauf à la
--     fonction qui note une tentative de connexion échouée ;
--   - les fichiers scannés ne peuvent jamais être modifiés ni effacés.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. FONCTIONS D'AIDE
-- ---------------------------------------------------------------------
create or replace function public.est_officier()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.role_courant() = 'officier', false) $$;

create or replace function public.est_caissier()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.role_courant() = 'caissier', false) $$;

-- L'utilisateur connecté (actif) appartient-il à cette entité ?
create or replace function public.est_de_mon_entite(p_entite uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select p_entite is not null and p_entite = public.entite_courante() $$;

-- Peut-il voir les données de cette entité ? (admin : toutes ; agent : la sienne)
create or replace function public.peut_voir_entite(p_entite uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.est_admin() or public.est_de_mon_entite(p_entite) $$;

-- Code de l'entité de l'utilisateur connecté (ex. MUL), pour les fichiers
create or replace function public.code_entite_courante()
returns text language sql stable security definer set search_path = ''
as $$ select e.code from public.entites e where e.id = public.entite_courante() $$;

-- Entité d'un acte (pour les fiches de détails) — seulement si on a le
-- droit de voir cet acte (sinon : vide, sans rien révéler)
create or replace function public.entite_de_acte(p_acte uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select a.entite_id from public.actes a
  where a.id = p_acte
    and (auth.uid() is null or public.peut_voir_entite(a.entite_id))
$$;

-- Une journée est-elle clôturée ? — seulement pour une entité que l'on
-- a le droit de voir (redéfinition de la fonction du fichier 05)
create or replace function public.journee_cloturee(p_entite uuid, p_journee date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is not null and not public.peut_voir_entite(p_entite) then null
    else exists (
      select 1 from public.clotures_caisse c
      where c.entite_id = p_entite and c.journee = p_journee
    )
  end
$$;


-- ---------------------------------------------------------------------
-- 2. FERMETURE AUX VISITEURS NON CONNECTÉS ET AUX ACCÈS DIRECTS INUTILES
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant  execute on all functions in schema public to authenticated, service_role;

-- Seule exception pour un visiteur non connecté : noter un échec de connexion
grant execute on function public.journaliser_connexion(text, boolean, text, text, text, boolean, timestamptz) to anon;

-- Les compteurs ne sont tenus que par la base elle-même
revoke all on public.compteurs_actes, public.compteurs_recus from authenticated;

-- Les journaux ne s'écrivent que par la base ; les agents ne peuvent que lire (selon les règles)
revoke insert, update, delete, truncate on public.journal_audit, public.journal_connexions from authenticated;


-- ---------------------------------------------------------------------
-- 3. ENTITÉS ET COMPTES
-- ---------------------------------------------------------------------
create policy entites_lecture on public.entites
  for select to authenticated
  using (public.peut_voir_entite(id));

create policy entites_ajout on public.entites
  for insert to authenticated
  with check (public.est_admin());

create policy entites_modification on public.entites
  for update to authenticated
  using (public.est_admin())
  with check (public.est_admin());

create policy utilisateurs_lecture on public.utilisateurs
  for select to authenticated
  using (public.est_admin() or id = auth.uid());

create policy utilisateurs_ajout on public.utilisateurs
  for insert to authenticated
  with check (public.est_admin());

create policy utilisateurs_modification on public.utilisateurs
  for update to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- Après avoir changé son mot de passe, l'agent lève lui-même l'obligation
-- de le changer (sans pouvoir toucher au reste de son profil).
create or replace function public.mot_de_passe_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.utilisateurs
     set doit_changer_mot_de_passe = false
   where id = auth.uid() and actif;
end;
$$;
grant execute on function public.mot_de_passe_change() to authenticated;


-- ---------------------------------------------------------------------
-- 4. CATALOGUE, TARIFS ET TAUX
-- ---------------------------------------------------------------------
-- Catalogue et grille commune : lus par tout agent actif, gérés par l'admin
create policy types_actes_lecture on public.types_actes
  for select to authenticated using (public.role_courant() is not null);
create policy types_actes_gestion on public.types_actes
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

create policy tarifs_communs_lecture on public.tarifs_communs
  for select to authenticated using (public.role_courant() is not null);
create policy tarifs_communs_gestion on public.tarifs_communs
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- Tarifs propres à l'entité : ajustés par l'Officier de l'entité
create policy tarifs_entites_lecture on public.tarifs_entites
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy tarifs_entites_gestion on public.tarifs_entites
  for all to authenticated
  using (public.est_officier() and public.est_de_mon_entite(entite_id))
  with check (public.est_officier() and public.est_de_mon_entite(entite_id));

-- Taux de change : saisi par le Caissier de l'entité
create policy taux_lecture on public.taux_change
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy taux_gestion on public.taux_change
  for all to authenticated
  using (public.est_caissier() and public.est_de_mon_entite(entite_id))
  with check (public.est_caissier() and public.est_de_mon_entite(entite_id));


-- ---------------------------------------------------------------------
-- 5. ACTES ET FICHES DE DÉTAILS
-- ---------------------------------------------------------------------
create policy actes_lecture on public.actes
  for select to authenticated using (public.peut_voir_entite(entite_id));

create policy actes_ajout on public.actes
  for insert to authenticated
  with check (public.est_officier() and public.est_de_mon_entite(entite_id));

-- Modification : Officier et Caissier de l'entité, admin pour toutes.
-- CE QUE chacun peut changer est précisé par le contrôle ci-dessous.
create policy actes_modification on public.actes
  for update to authenticated
  using (
    public.est_admin()
    or ((public.est_officier() or public.est_caissier()) and public.est_de_mon_entite(entite_id))
  )
  with check (
    public.est_admin()
    or ((public.est_officier() or public.est_caissier()) and public.est_de_mon_entite(entite_id))
  );

-- Contrôle des changements selon le rôle (s'applique aux demandes venant
-- directement de l'application ; les opérations internes de la caisse,
-- comme le passage à « payé » lors de l'encaissement, ne sont pas visées).
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
    -- Seul geste permis : renvoyer à l'Officier un acte en attente (pour correction)
    v_reste_n := to_jsonb(new) - array['statut', 'modifie_le', 'recherche_noms'];
    v_reste_o := to_jsonb(old) - array['statut', 'modifie_le', 'recherche_noms'];
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

-- Nommé « actes_a_… » pour passer AVANT le contrôle du cycle de vie
create trigger actes_a_droits_par_role
  before update on public.actes
  for each row execute function public.controler_droits_acte();

-- Fiches de détails : visibles avec leur acte, remplies par l'Officier de l'entité
do $$
declare
  t text;
begin
  foreach t in array array['details_naissance', 'details_mariage', 'details_deces'] loop
    execute format(
      'create policy %1$s_lecture on public.%1$I
         for select to authenticated
         using (public.peut_voir_entite(public.entite_de_acte(acte_id)))', t);
    execute format(
      'create policy %1$s_ajout on public.%1$I
         for insert to authenticated
         with check (public.est_officier() and public.est_de_mon_entite(public.entite_de_acte(acte_id)))', t);
    execute format(
      'create policy %1$s_modification on public.%1$I
         for update to authenticated
         using (public.est_officier() and public.est_de_mon_entite(public.entite_de_acte(acte_id)))
         with check (public.est_officier() and public.est_de_mon_entite(public.entite_de_acte(acte_id)))', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. CAISSE
-- ---------------------------------------------------------------------
create policy recus_lecture on public.recus
  for select to authenticated using (public.peut_voir_entite(entite_id));

create policy recus_encaissement on public.recus
  for insert to authenticated
  with check (public.est_caissier() and public.est_de_mon_entite(entite_id));

-- Annulation d'un reçu : Caissier de l'entité ou admin
-- (dans tous les cas, impossible une fois la journée clôturée)
create policy recus_annulation on public.recus
  for update to authenticated
  using (public.est_admin() or (public.est_caissier() and public.est_de_mon_entite(entite_id)))
  with check (public.est_admin() or (public.est_caissier() and public.est_de_mon_entite(entite_id)));

create policy exonerations_lecture on public.exonerations
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy exonerations_ajout on public.exonerations
  for insert to authenticated
  with check (public.est_caissier() and public.est_de_mon_entite(entite_id));

create policy clotures_lecture on public.clotures_caisse
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy clotures_ajout on public.clotures_caisse
  for insert to authenticated
  with check (public.est_caissier() and public.est_de_mon_entite(entite_id));


-- ---------------------------------------------------------------------
-- 7. ARCHIVES SCANNÉES
-- ---------------------------------------------------------------------
create policy lots_lecture on public.lots_import
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy lots_gestion on public.lots_import
  for all to authenticated
  using (public.est_officier() and public.est_de_mon_entite(entite_id))
  with check (public.est_officier() and public.est_de_mon_entite(entite_id));

create policy documents_lecture on public.documents_scannes
  for select to authenticated using (public.peut_voir_entite(entite_id));
create policy documents_ajout on public.documents_scannes
  for insert to authenticated
  with check (public.est_officier() and public.est_de_mon_entite(entite_id));

-- Fichiers dans l'espace de stockage : le 1er dossier du chemin est le code
-- de l'entité (MUL/2026/…). Lecture : admin ou agents de l'entité.
-- Dépôt : Officier de l'entité. Modification et suppression : personne.
create policy archives_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'archives'
    and (public.est_admin() or split_part(name, '/', 1) = public.code_entite_courante())
  );

create policy archives_depot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'archives'
    and public.est_officier()
    and split_part(name, '/', 1) = public.code_entite_courante()
  );

-- L'emplacement prévu n'est donné que pour un acte que l'on a le droit de voir
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
  select a.identifiant, a.annee, a.entite_id, e.code as code_entite
    into v_acte
  from public.actes a
  join public.entites e on e.id = a.entite_id
  where a.id = p_acte;

  -- Fonction exécutée avec les droits de la base : on contrôle donc
  -- l'identité réelle de la personne connectée (auth.uid()).
  if v_acte.identifiant is null
     or (auth.uid() is not null and not public.peut_voir_entite(v_acte.entite_id)) then
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


-- ---------------------------------------------------------------------
-- 7 bis. PAS D'INDISCRÉTION SUR LES ACTES DES AUTRES ENTITÉS
-- ---------------------------------------------------------------------
-- Avant tout encaissement, exonération ou dépôt de scan, on vérifie que la
-- personne a le droit de VOIR l'acte visé. Sinon : « Acte introuvable »,
-- sans rien révéler de son statut ni de son existence.
-- (Fonction exécutée avec les droits de la personne connectée : la règle
--  de lecture des actes s'applique.)
create or replace function public.verifier_acces_acte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and not exists (select 1 from public.actes a where a.id = new.acte_id) then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Nommés « …_a_… » pour passer AVANT les autres contrôles
create trigger recus_a_verifier_acces
  before insert on public.recus
  for each row execute function public.verifier_acces_acte();
create trigger exonerations_a_verifier_acces
  before insert on public.exonerations
  for each row execute function public.verifier_acces_acte();
create trigger documents_a_verifier_acces
  before insert on public.documents_scannes
  for each row execute function public.verifier_acces_acte();


-- ---------------------------------------------------------------------
-- 8. JOURNAUX
-- ---------------------------------------------------------------------
create policy journal_audit_lecture on public.journal_audit
  for select to authenticated using (public.est_admin());

create policy journal_connexions_lecture on public.journal_connexions
  for select to authenticated
  using (public.est_admin() or utilisateur_id = auth.uid());

-- La règle des 7 jours ne se consulte que pour soi-même (ou par l'admin)
create or replace function public.hors_ligne_autorise(utilisateur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Identité réelle de la personne connectée (la fonction tourne avec les droits de la base)
    when auth.uid() is not null and utilisateur is distinct from auth.uid() and not public.est_admin()
      then false
    else coalesce(
      (select u.actif
              and u.derniere_connexion_en_ligne is not null
              and u.derniere_connexion_en_ligne > now() - interval '7 days'
       from public.utilisateurs u
       where u.id = utilisateur),
      false)
  end
$$;


-- ---------------------------------------------------------------------
-- 9. DROITS SUR LES FONCTIONS CRÉÉES DANS CE FICHIER
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant  execute on all functions in schema public to authenticated, service_role;
grant  execute on function public.journaliser_connexion(text, boolean, text, text, text, boolean, timestamptz) to anon;
