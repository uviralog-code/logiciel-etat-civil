-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 02 : ENTITÉS ET UTILISATEURS
-- ---------------------------------------------------------------------
-- 1. Table "entites"      : les 4 entités (3 communes + 1 chefferie).
-- 2. Table "utilisateurs" : le profil de chaque compte (rôle, entité…),
--    relié au compte de connexion géré par Supabase (auth.users).
-- 3. Règles : 1 seul admin, 1 officier + 1 caissier actifs par entité.
-- 4. Fonctions "qui est connecté ?", utilisées plus tard par la sécurité.
--
-- Sécurité : la protection par ligne (RLS) est activée dès maintenant.
-- Sans règle d'accès, PERSONNE ne peut lire ces tables via l'application ;
-- les règles d'accès précises seront ajoutées au fichier 08.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LES ENTITÉS
-- ---------------------------------------------------------------------
create table public.entites (
  id          uuid primary key default extensions.gen_random_uuid(),
  code        text not null unique,              -- MUL, KAV, KAL, BAV : préfixe des ID d'actes
  nom         text not null unique,              -- ex. "Commune de Mulongwe"
  type        public.type_entite not null,
  ville       text not null default 'Uvira',
  province    text not null default 'Sud-Kivu',
  active      boolean not null default true,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),

  -- Le code fait exactement 3 lettres majuscules : il apparaît dans chaque ID d'acte
  constraint entites_code_format check (code ~ '^[A-Z]{3}$')
);

comment on table  public.entites      is 'Les entités administratives servies par le logiciel (communes et chefferie).';
comment on column public.entites.code is 'Code à 3 lettres, préfixe de tous les ID d''actes de l''entité (ex. MUL-NAIS-2026-000123).';

create trigger entites_maj_date
  before update on public.entites
  for each row execute function public.maj_date_modification();

alter table public.entites enable row level security;


-- ---------------------------------------------------------------------
-- 2. LES UTILISATEURS
-- ---------------------------------------------------------------------
-- Chaque ligne complète un compte de connexion Supabase (auth.users)
-- avec les informations propres au logiciel.
create table public.utilisateurs (
  id                          uuid primary key
                              references auth.users (id) on delete cascade,
  nom_utilisateur             text not null unique,     -- ex. "mulongwe.officier"
  nom_complet                 text not null,
  role                        public.role_utilisateur not null,
  entite_id                   uuid references public.entites (id) on delete restrict,
  actif                       boolean not null default true,

  -- Sécurité de connexion
  doit_changer_mot_de_passe   boolean not null default true,   -- après création ou réinitialisation par l'admin
  double_verification         boolean not null default false,  -- code à 6 chiffres sur téléphone
  derniere_connexion_en_ligne timestamptz,                     -- sert à la règle des 7 jours hors-ligne

  cree_le                     timestamptz not null default now(),
  modifie_le                  timestamptz not null default now(),

  -- L'admin n'appartient à aucune entité ; les autres appartiennent à une seule
  constraint utilisateurs_entite_selon_role check (
    (role = 'admin' and entite_id is null)
    or (role <> 'admin' and entite_id is not null)
  ),

  -- L'admin est obligatoirement protégé par la double vérification
  constraint utilisateurs_admin_double_verification check (
    role <> 'admin' or double_verification
  ),

  -- Format du nom d'utilisateur : minuscules, chiffres, points (ex. kalundu.caissier)
  constraint utilisateurs_nom_format check (
    nom_utilisateur ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
    and length(nom_utilisateur) between 3 and 50
  ),

  constraint utilisateurs_nom_complet_rempli check (btrim(nom_complet) <> '')
);

comment on table  public.utilisateurs is 'Profil de chaque compte : rôle, entité de rattachement, état et sécurité de connexion.';
comment on column public.utilisateurs.derniere_connexion_en_ligne is
  'Date de la dernière connexion avec internet. Au-delà de 7 jours, le travail hors-ligne est bloqué.';

-- Un seul administrateur actif dans tout le système
create unique index utilisateurs_un_seul_admin
  on public.utilisateurs (role)
  where role = 'admin' and actif;

-- Un seul officier actif et un seul caissier actif par entité.
-- (Un ancien compte désactivé reste conservé pour l'historique.)
create unique index utilisateurs_un_par_role_et_entite
  on public.utilisateurs (entite_id, role)
  where role <> 'admin' and actif;

create index utilisateurs_entite_idx on public.utilisateurs (entite_id);

-- Le nom d'utilisateur est toujours enregistré en minuscules, sans espaces
create or replace function public.normaliser_nom_utilisateur()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nom_utilisateur := lower(btrim(new.nom_utilisateur));
  new.nom_complet     := btrim(regexp_replace(new.nom_complet, '\s+', ' ', 'g'));
  return new;
end;
$$;

create trigger utilisateurs_normaliser
  before insert or update of nom_utilisateur, nom_complet on public.utilisateurs
  for each row execute function public.normaliser_nom_utilisateur();

create trigger utilisateurs_maj_date
  before update on public.utilisateurs
  for each row execute function public.maj_date_modification();

alter table public.utilisateurs enable row level security;


-- ---------------------------------------------------------------------
-- 3. QUI EST CONNECTÉ ?
-- ---------------------------------------------------------------------
-- Ces fonctions lisent le profil de l'utilisateur connecté. Elles seront
-- utilisées par toutes les règles de sécurité (fichier 08).
-- "security definer" : elles lisent la table utilisateurs même si la
-- personne connectée n'a pas le droit de la lire directement.
-- Un compte désactivé est traité comme s'il n'existait pas.

create or replace function public.role_courant()
returns public.role_utilisateur
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.utilisateurs u
  where u.id = auth.uid() and u.actif
$$;

create or replace function public.entite_courante()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.entite_id
  from public.utilisateurs u
  where u.id = auth.uid() and u.actif
$$;

create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.role_courant() = 'admin', false)
$$;

comment on function public.role_courant()    is 'Rôle de l''utilisateur connecté (vide si compte inexistant ou désactivé).';
comment on function public.entite_courante() is 'Entité de l''utilisateur connecté (vide pour l''admin).';
comment on function public.est_admin()       is 'Vrai si l''utilisateur connecté est l''administrateur principal actif.';


-- ---------------------------------------------------------------------
-- 4. RÈGLE DES 7 JOURS HORS-LIGNE
-- ---------------------------------------------------------------------
-- Vrai si le compte s'est connecté en ligne il y a moins de 7 jours.
-- L'application l'interroge avant d'autoriser le travail sans internet.
create or replace function public.hors_ligne_autorise(utilisateur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.actif
            and u.derniere_connexion_en_ligne is not null
            and u.derniere_connexion_en_ligne > now() - interval '7 days'
     from public.utilisateurs u
     where u.id = utilisateur),
    false
  )
$$;

comment on function public.hors_ligne_autorise(uuid) is
  'Vrai si le compte est actif et s''est connecté en ligne dans les 7 derniers jours.';
