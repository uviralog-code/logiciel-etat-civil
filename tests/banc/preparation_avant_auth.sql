-- =====================================================================
-- BANC D'ESSAI SUPABASE LOCAL — 1/2 : avant le service de connexion
-- ---------------------------------------------------------------------
-- Ce fichier N'EST PAS déployé. Il recrée dans une base vide ce que
-- Supabase prépare avant d'y installer son service de connexion
-- (« Auth ») et son accès aux données (« PostgREST ») :
--   - les rôles de l'API (anon, authenticated, service_role) ;
--   - le rôle « authenticator » utilisé par PostgREST pour se connecter ;
--   - le rôle « supabase_auth_admin » propriétaire du schéma auth ;
--   - le schéma extensions.
-- Le schéma auth est créé ensuite par le VRAI service Auth, et le schéma
-- storage par le VRAI service de stockage des fichiers (« Storage »,
-- fichier 33), avec leurs propres migrations.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- Droits par défaut du schéma public, identiques à Supabase
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Schéma auth : créé vide, rempli par les migrations du service Auth
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;

-- Schéma storage : créé vide avec les droits que Supabase y donne aux rôles
-- de l'API ; ses tables sont créées par les migrations du service Storage
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
alter default privileges in schema storage grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema storage grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema storage grant all on functions to anon, authenticated, service_role;
