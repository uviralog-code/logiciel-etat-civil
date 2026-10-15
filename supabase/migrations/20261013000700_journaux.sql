-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 07 : JOURNAL D'AUDIT ET JOURNAL DES CONNEXIONS
-- ---------------------------------------------------------------------
-- 1. "journal_audit"      : chaque ajout, modification ou suppression dans
--                           les tables importantes est noté automatiquement :
--                           qui, quand, quel rôle, quelle entité, quoi
--                           exactement (avant / après).
-- 2. "journal_connexions" : chaque tentative de connexion, réussie ou non,
--                           avec le poste utilisé. Une connexion réussie en
--                           ligne met à jour la date utilisée par la règle
--                           des 7 jours hors-ligne.
-- 3. Les deux journaux sont INALTÉRABLES : personne, pas même
--    l'administrateur, ne peut les modifier ni les effacer.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LE JOURNAL D'AUDIT
-- ---------------------------------------------------------------------
create table public.journal_audit (
  id                  bigint generated always as identity primary key,
  horodatage          timestamptz not null default now(),
  utilisateur_id      uuid,                       -- personne connectée (vide si opération technique)
  role                public.role_utilisateur,    -- son rôle au moment de l'opération
  entite_id           uuid,                       -- entité concernée par l'enregistrement
  table_nom           text not null,
  operation           text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  enregistrement_id   text,                       -- identifiant technique de la ligne
  reference           text,                       -- repère lisible : ID d'acte, n° de reçu, nom d'utilisateur…
  champs_modifies     text[],                     -- pour une modification : les colonnes changées
  anciennes_valeurs   jsonb,
  nouvelles_valeurs   jsonb
);

comment on table public.journal_audit is
  'Trace inaltérable de toutes les opérations sur les tables importantes : qui, quand, quoi, avant et après.';

create index journal_audit_horodatage_idx on public.journal_audit (horodatage desc);
create index journal_audit_entite_idx     on public.journal_audit (entite_id, horodatage desc);
create index journal_audit_utilisateur_idx on public.journal_audit (utilisateur_id, horodatage desc);
create index journal_audit_reference_idx  on public.journal_audit (reference);

alter table public.journal_audit enable row level security;


-- La fonction qui écrit dans le journal
create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancien    jsonb;
  v_nouveau   jsonb;
  v_ligne     jsonb;
  v_modifies  text[];
  v_entite    uuid;
  -- Colonnes techniques dont le seul changement ne mérite pas d'être noté
  v_ignorees  constant text[] := array['modifie_le', 'derniere_connexion_en_ligne'];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_ancien  := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_nouveau := to_jsonb(new); end if;
  v_ligne := coalesce(v_nouveau, v_ancien);

  -- Colonnes réellement modifiées
  if tg_op = 'UPDATE' then
    select array_agg(cle order by cle) into v_modifies
    from jsonb_object_keys(v_nouveau) as cle
    where v_nouveau -> cle is distinct from v_ancien -> cle;

    -- Rien de significatif n'a changé : on ne note rien
    if v_modifies is null or v_modifies <@ v_ignorees then
      return null;
    end if;
  end if;

  -- Entité concernée
  v_entite := case
    when tg_table_name = 'entites' then (v_ligne ->> 'id')::uuid
    when v_ligne ? 'entite_id'     then (v_ligne ->> 'entite_id')::uuid
    when v_ligne ? 'acte_id'       then (select a.entite_id from public.actes a
                                         where a.id = (v_ligne ->> 'acte_id')::uuid)
  end;

  insert into public.journal_audit (
    utilisateur_id, role, entite_id, table_nom, operation,
    enregistrement_id, reference, champs_modifies, anciennes_valeurs, nouvelles_valeurs
  ) values (
    auth.uid(),
    public.role_courant(),
    v_entite,
    tg_table_name,
    tg_op,
    coalesce(v_ligne ->> 'id', v_ligne ->> 'acte_id'),
    coalesce(v_ligne ->> 'identifiant', v_ligne ->> 'numero_recu', v_ligne ->> 'nom_utilisateur',
             v_ligne ->> 'chemin_stockage', v_ligne ->> 'code',
             (select a.identifiant from public.actes a where a.id = (v_ligne ->> 'acte_id')::uuid)),
    v_modifies,
    v_ancien,
    v_nouveau
  );

  return null;
end;
$$;

comment on function public.journaliser() is
  'Déclencheur : note chaque opération dans le journal d''audit (qui, quand, quoi, avant/après).';

-- Branchement du journal sur toutes les tables importantes
do $$
declare
  t text;
begin
  foreach t in array array[
    'entites', 'utilisateurs',
    'types_actes', 'tarifs_communs', 'tarifs_entites', 'taux_change',
    'actes', 'details_naissance', 'details_mariage', 'details_deces',
    'recus', 'exonerations', 'clotures_caisse',
    'lots_import', 'documents_scannes'
  ] loop
    execute format(
      'create trigger zz_journal_audit after insert or update or delete on public.%I
         for each row execute function public.journaliser()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. LE JOURNAL DES CONNEXIONS
-- ---------------------------------------------------------------------
create table public.journal_connexions (
  id                     bigint generated always as identity primary key,
  horodatage             timestamptz not null default now(),
  nom_utilisateur_saisi  text not null,           -- ce que la personne a tapé
  utilisateur_id         uuid,                    -- compte reconnu (vide si nom inconnu)
  entite_id              uuid,
  succes                 boolean not null,
  motif_echec            text,                    -- ex. « mot de passe incorrect », « compte désactivé »
  hors_ligne             boolean not null default false,
  poste                  text,                    -- nom ou identifiant de l'ordinateur
  adresse_ip             inet,
  navigateur             text,
  enregistre_le          timestamptz not null default now(),  -- arrivée dans la base (après synchronisation)

  constraint connexions_echec_motive check (succes or motif_echec is not null)
);

comment on table public.journal_connexions is
  'Toutes les tentatives de connexion, réussies ou non : qui, quand, sur quel poste. Inaltérable.';

create index journal_connexions_horodatage_idx on public.journal_connexions (horodatage desc);
create index journal_connexions_utilisateur_idx on public.journal_connexions (utilisateur_id, horodatage desc);

alter table public.journal_connexions enable row level security;


-- Fonction appelée par l'application à chaque tentative de connexion
--   - un ÉCHEC peut être noté sans être connecté (la personne n'a pas pu entrer) ;
--   - une RÉUSSITE n'est acceptée que si la personne est réellement connectée,
--     et c'est son compte réel qui est noté, quoi qu'elle ait tapé ;
--   - une connexion faite hors-ligne peut être transmise plus tard
--     (au plus 7 jours après), avec son heure réelle.
create or replace function public.journaliser_connexion(
  p_nom_utilisateur  text,
  p_succes           boolean,
  p_motif_echec      text default null,
  p_poste            text default null,
  p_navigateur       text default null,
  p_hors_ligne       boolean default false,
  p_horodatage       timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moment   timestamptz := coalesce(p_horodatage, now());
  v_compte   public.utilisateurs%rowtype;
  v_id       bigint;
  v_ip       inet;
begin
  if v_moment > now() + interval '5 minutes' then
    raise exception 'Heure de connexion dans le futur : refusée.' using errcode = 'P0001';
  end if;
  if v_moment < now() - interval '7 days' then
    raise exception 'Connexion de plus de 7 jours : trop ancienne pour être enregistrée.' using errcode = 'P0001';
  end if;

  if p_succes then
    if auth.uid() is null then
      raise exception 'Une connexion réussie ne peut être notée que par la personne connectée.' using errcode = 'P0001';
    end if;
    select * into v_compte from public.utilisateurs u where u.id = auth.uid();
  else
    select * into v_compte from public.utilisateurs u
    where u.nom_utilisateur = lower(btrim(coalesce(p_nom_utilisateur, '')));
  end if;

  -- Adresse IP transmise par Supabase (en-tête de la requête), si disponible
  begin
    v_ip := nullif(split_part(
              coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''),
              ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.journal_connexions (
    horodatage, nom_utilisateur_saisi, utilisateur_id, entite_id, succes, motif_echec,
    hors_ligne, poste, adresse_ip, navigateur
  ) values (
    v_moment,
    coalesce(nullif(btrim(p_nom_utilisateur), ''), '(vide)'),
    v_compte.id,
    v_compte.entite_id,
    p_succes,
    case when p_succes then null else coalesce(nullif(btrim(p_motif_echec), ''), 'non précisé') end,
    p_hors_ligne,
    p_poste,
    v_ip,
    p_navigateur
  )
  returning id into v_id;

  -- Connexion réussie EN LIGNE : relance le compteur des 7 jours hors-ligne
  if p_succes and not p_hors_ligne then
    update public.utilisateurs
       set derniere_connexion_en_ligne = greatest(coalesce(derniere_connexion_en_ligne, v_moment), v_moment)
     where id = v_compte.id;
  end if;

  return v_id;
end;
$$;

comment on function public.journaliser_connexion(text, boolean, text, text, text, boolean, timestamptz) is
  'Note une tentative de connexion. Une réussite en ligne met à jour la date de dernière connexion en ligne.';


-- ---------------------------------------------------------------------
-- 3. JOURNAUX INALTÉRABLES
-- ---------------------------------------------------------------------
create trigger journal_audit_inalterable_maj before update on public.journal_audit
  for each row execute function public.interdire_modification();
create trigger journal_audit_inalterable_sup before delete on public.journal_audit
  for each row execute function public.interdire_modification();
create trigger journal_connexions_inalterable_maj before update on public.journal_connexions
  for each row execute function public.interdire_modification();
create trigger journal_connexions_inalterable_sup before delete on public.journal_connexions
  for each row execute function public.interdire_modification();

-- Empêche aussi le vidage complet d'un journal (TRUNCATE)
create or replace function public.interdire_vidage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Vidage interdit sur « % » : ce journal est inaltérable.', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger journal_audit_pas_de_vidage before truncate on public.journal_audit
  for each statement execute function public.interdire_vidage();
create trigger journal_connexions_pas_de_vidage before truncate on public.journal_connexions
  for each statement execute function public.interdire_vidage();


-- ---------------------------------------------------------------------
-- 4. VUE LISIBLE DU JOURNAL D'AUDIT (pour l'admin)
-- ---------------------------------------------------------------------
create or replace view public.vue_journal_audit
with (security_invoker = true)
as
select
  j.id,
  j.horodatage,
  coalesce(u.nom_utilisateur, '(système)') as utilisateur,
  u.nom_complet,
  j.role,
  e.code                                  as entite_code,
  j.table_nom,
  case j.operation when 'INSERT' then 'Ajout'
                   when 'UPDATE' then 'Modification'
                   when 'DELETE' then 'Suppression' end as operation,
  j.reference,
  j.champs_modifies,
  j.anciennes_valeurs,
  j.nouvelles_valeurs
from public.journal_audit j
left join public.utilisateurs u on u.id = j.utilisateur_id
left join public.entites e      on e.id = j.entite_id;

comment on view public.vue_journal_audit is 'Journal d''audit lisible : noms d''utilisateurs, entités et opérations en français.';
