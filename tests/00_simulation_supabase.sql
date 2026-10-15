-- =====================================================================
-- OUTIL DE TEST — Simulation minimale de l'environnement Supabase
-- ---------------------------------------------------------------------
-- Ce fichier N'EST PAS déployé sur Supabase. Il sert uniquement à tester
-- les migrations sur un PostgreSQL local, en recréant ce que Supabase
-- fournit déjà : les rôles de connexion, le schéma "auth" et la
-- fonction auth.uid() qui renvoie l'utilisateur connecté.
-- =====================================================================

-- Rôles utilisés par Supabase
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Droits par défaut du schéma public, identiques à Supabase :
-- les rôles de l'API peuvent tout tenter, et ce sont les règles de
-- sécurité par ligne (RLS) qui décident ensuite ce qui est permis.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Schéma "extensions" (Supabase y installe les extensions)
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Schéma "auth" avec la table des comptes et la fonction auth.uid()
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  encrypted_password  text,          -- mot de passe chiffré (bcrypt), comme dans Supabase
  created_at          timestamptz not null default now()
);

-- auth.uid() lit l'identifiant de l'utilisateur "connecté" dans une
-- variable de session, comme le fait Supabase avec le jeton JWT.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Schéma "storage" : l'espace de stockage des fichiers de Supabase
-- (seules les colonnes utiles au logiciel sont reproduites)
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null unique,
  public              boolean default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text not null,
  owner       uuid,
  created_at  timestamptz default now(),
  metadata    jsonb,                       -- taille (size) et format (mimetype) du fichier
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- =====================================================================
-- Petits outils d'assertion pour les tests
-- =====================================================================
create schema if not exists test;

-- Vérifie une condition : affiche "OK" ou arrête tout avec "ÉCHEC"
create or replace function test.verifier(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'ÉCHEC : %', message;
  end if;
  raise notice 'OK     : %', message;
end $$;

-- Vérifie qu'une instruction SQL est REFUSÉE (erreur attendue)
create or replace function test.doit_echouer(instruction text, message text)
returns void language plpgsql as $$
begin
  begin
    execute instruction;
  exception when others then
    raise notice 'OK     : % (refusé : %)', message, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC : % — l''instruction aurait dû être refusée', message;
end $$;

-- Variante plus stricte : vérifie aussi que le refus a la BONNE raison
-- (le message d'erreur doit contenir le texte attendu)
create or replace function test.doit_echouer(instruction text, message text, raison_attendue text)
returns void language plpgsql as $$
begin
  begin
    execute instruction;
  exception when others then
    if position(lower(raison_attendue) in lower(sqlerrm)) = 0 then
      raise exception 'ÉCHEC : % — refusé, mais pour une autre raison : %', message, sqlerrm;
    end if;
    raise notice 'OK     : % (refusé : %)', message, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC : % — l''instruction aurait dû être refusée', message;
end $$;

-- Simule la connexion d'un utilisateur (comme le ferait Supabase).
-- niveau : « aal2 » (mot de passe + code à 6 chiffres, par défaut) ou « aal1 » (mot de passe seul)
create or replace function test.se_connecter(utilisateur uuid, niveau text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', utilisateur::text, false);
  perform set_config('request.jwt.claims',
    json_build_object('sub', utilisateur, 'role', 'authenticated', 'aal', niveau)::text, false);
  execute 'set role authenticated';
end $$;

-- Revient à l'administrateur technique de la base
create or replace function test.se_deconnecter()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

grant usage on schema test to anon, authenticated, service_role;
grant execute on all functions in schema test to anon, authenticated, service_role;
