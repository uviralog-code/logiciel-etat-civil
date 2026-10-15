-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 22 : PHOTOS PAR TÉLÉPHONE (étape 6, fichier 34)
-- ---------------------------------------------------------------------
-- En secours (scanner en panne), l'Officier photographie l'acte avec un
-- téléphone. Sur l'ordinateur, l'écran du scan affiche un QR code : le
-- téléphone l'ouvre SANS mot de passe, sur une page réservée à CET acte.
-- Les pages photographiées (déjà recadrées sur le téléphone) arrivent sur
-- l'ordinateur, où l'Officier fait les vérifications et valide l'archivage
-- comme d'habitude (fichier 21). Le téléphone n'archive rien lui-même.
--
-- Le lien du QR code :
--   - contient un secret tiré au hasard (256 bits) ; la base n'en garde
--     que l'empreinte : le lien ne peut pas être retrouvé dans la base ;
--   - n'est valable que 10 minutes, pour un seul acte, de l'entité de
--     l'Officier, et seulement s'il est payé, exonéré ou délivré ;
--   - ne sert plus dès que le téléphone a terminé l'envoi ;
--   - ne permet que de DÉPOSER des pages (10 au plus, 3 Mo chacune).
-- Les pages sont effacées dès que l'ordinateur les a reprises, et les
-- transferts expirés sont effacés à la création d'un nouveau transfert.
-- =====================================================================

create table public.transferts_photo (
  id                uuid primary key default extensions.gen_random_uuid(),
  acte_id           uuid not null references public.actes (id) on delete restrict,
  entite_id         uuid not null references public.entites (id) on delete restrict,
  empreinte_secret  text not null unique check (empreinte_secret ~ '^[0-9a-f]{64}$'),
  cree_par          uuid not null references public.utilisateurs (id),
  cree_le           timestamptz not null default now(),
  expire_le         timestamptz not null,
  termine_le        timestamptz,
  nb_pages          smallint not null default 0 check (nb_pages between 0 and 10)
);

comment on table public.transferts_photo is
  'Lien temporaire (QR code) par lequel un téléphone dépose les photos d''un acte pour l''ordinateur de l''Officier.';

create table public.pages_photo (
  transfert_id  uuid not null references public.transferts_photo (id) on delete cascade,
  numero        smallint not null check (numero between 1 and 10),
  jpeg          bytea not null,
  largeur       integer not null check (largeur between 50 and 4000),
  hauteur       integer not null check (hauteur between 50 and 4000),
  recu_le       timestamptz not null default now(),
  primary key (transfert_id, numero),
  constraint pages_photo_taille check (octet_length(jpeg) between 100 and 3145728)
);

comment on table public.pages_photo is
  'Pages photographiées en attente d''être reprises par l''ordinateur (effacées aussitôt reprises).';

-- Aucun accès direct : tout passe par les fonctions ci-dessous
alter table public.transferts_photo enable row level security;
alter table public.pages_photo enable row level security;
revoke all on public.transferts_photo, public.pages_photo from anon, authenticated;

create or replace function public.empreinte_secret_photo(p_secret text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') $$;

-- Le transfert d'un secret, s'il est encore valable (verrouillé pour mise à jour)
create or replace function public.transfert_valable(p_secret text)
returns public.transferts_photo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.transferts_photo%rowtype;
begin
  select * into v from public.transferts_photo
  where empreinte_secret = public.empreinte_secret_photo(p_secret)
  for update;
  if not found or v.expire_le < now() then
    raise exception 'Ce lien n''est plus valable (il dure 10 minutes). Affichez un nouveau QR code sur l''ordinateur.'
      using errcode = 'P0001';
  end if;
  return v;
end;
$$;

revoke execute on function public.transfert_valable(text) from public, anon, authenticated;
revoke execute on function public.empreinte_secret_photo(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. ORDINATEUR : créer le lien (QR code)
-- ---------------------------------------------------------------------
create or replace function public.creer_transfert_photo(p_acte uuid)
returns table (id uuid, secret text, expire_le timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acte    public.actes%rowtype;
  v_secret  text;
  v_id      uuid;
  v_expire  timestamptz := now() + interval '10 minutes';
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier de l''entité peut photographier un acte.' using errcode = 'P0001';
  end if;
  select * into v_acte from public.actes a where a.id = p_acte;
  if not found or not public.est_de_mon_entite(v_acte.entite_id) then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  if v_acte.statut not in ('paye', 'exonere', 'delivre') then
    raise exception 'L''acte % n''est pas encore payé ni exonéré : le scan se fait après l''établissement de l''acte signé.',
      v_acte.identifiant using errcode = 'P0001';
  end if;

  -- Ménage : les transferts expirés depuis plus d'une heure disparaissent (avec leurs pages)
  delete from public.transferts_photo t where t.expire_le < now() - interval '1 hour';

  -- 32 octets au hasard, écrits sans caractères gênants dans une adresse
  v_secret := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.transferts_photo (acte_id, entite_id, empreinte_secret, cree_par, expire_le)
  values (v_acte.id, v_acte.entite_id, public.empreinte_secret_photo(v_secret), auth.uid(), v_expire)
  returning transferts_photo.id into v_id;

  return query select v_id, v_secret, v_expire;
end;
$$;

revoke execute on function public.creer_transfert_photo(uuid) from public, anon;
grant  execute on function public.creer_transfert_photo(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2. TÉLÉPHONE (sans mot de passe, avec le secret du QR code)
-- ---------------------------------------------------------------------
-- Ce que la page du téléphone affiche : l'acte à photographier
create or replace function public.lire_transfert_photo(p_secret text)
returns table (identifiant text, type_libelle text, couleur text, titulaire text, pages smallint, expire_le timestamptz, termine boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.transferts_photo%rowtype := public.transfert_valable(p_secret);
begin
  return query
  select a.identifiant, t.libelle, t.couleur,
         a.titulaire_nom || coalesce(' et ' || a.titulaire_2_nom, ''),
         v.nb_pages, v.expire_le, v.termine_le is not null
  from public.actes a
  join public.types_actes t on t.id = a.type_acte_id
  where a.id = v.acte_id;
end;
$$;

-- Déposer une page (photo JPEG déjà recadrée, en base64)
create or replace function public.ajouter_page_photo(p_secret text, p_jpeg text, p_largeur integer, p_hauteur integer)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.transferts_photo%rowtype := public.transfert_valable(p_secret);
  v_jpeg  bytea;
begin
  if v.termine_le is not null then
    raise exception 'L''envoi est déjà terminé : continuez sur l''ordinateur.' using errcode = 'P0001';
  end if;
  if v.nb_pages >= 10 then
    raise exception '10 pages au plus par envoi.' using errcode = 'P0001';
  end if;
  begin
    v_jpeg := decode(p_jpeg, 'base64');
  exception when others then
    raise exception 'Photo illisible.' using errcode = 'P0001';
  end;
  if v_jpeg is null or substring(v_jpeg from 1 for 3) <> '\xffd8ff'::bytea then
    raise exception 'Photo illisible : seules les photos JPEG sont acceptées.' using errcode = 'P0001';
  end if;
  if octet_length(v_jpeg) > 3145728 then
    raise exception 'Photo trop lourde (3 Mo au plus).' using errcode = 'P0001';
  end if;
  if p_largeur is null or p_hauteur is null or p_largeur not between 50 and 4000 or p_hauteur not between 50 and 4000 then
    raise exception 'Dimensions de la photo invalides.' using errcode = 'P0001';
  end if;

  update public.transferts_photo set nb_pages = nb_pages + 1 where id = v.id;
  insert into public.pages_photo (transfert_id, numero, jpeg, largeur, hauteur)
  values (v.id, v.nb_pages + 1, v_jpeg, p_largeur, p_hauteur);
  return v.nb_pages + 1;
end;
$$;

-- « J'ai terminé » : le lien ne sert plus
create or replace function public.terminer_transfert_photo(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.transferts_photo%rowtype := public.transfert_valable(p_secret);
begin
  update public.transferts_photo set termine_le = coalesce(termine_le, now()) where id = v.id;
end;
$$;

revoke execute on function public.lire_transfert_photo(text) from public;
revoke execute on function public.ajouter_page_photo(text, text, integer, integer) from public;
revoke execute on function public.terminer_transfert_photo(text) from public;
grant  execute on function public.lire_transfert_photo(text) to anon, authenticated;
grant  execute on function public.ajouter_page_photo(text, text, integer, integer) to anon, authenticated;
grant  execute on function public.terminer_transfert_photo(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. ORDINATEUR : reprendre les pages arrivées (puis elles sont effacées)
-- ---------------------------------------------------------------------
create or replace function public.recuperer_pages_photo(p_transfert uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.transferts_photo%rowtype;
  v_pages jsonb;
begin
  select * into v from public.transferts_photo t where t.id = p_transfert;
  if not found or not public.est_officier() or not public.est_de_mon_entite(v.entite_id) then
    raise exception 'Envoi introuvable.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', p.numero, 'jpeg', encode(p.jpeg, 'base64'), 'largeur', p.largeur, 'hauteur', p.hauteur)
           order by p.numero), '[]'::jsonb)
    into v_pages
  from public.pages_photo p where p.transfert_id = v.id;
  delete from public.pages_photo p where p.transfert_id = v.id;

  return jsonb_build_object(
    'pages', v_pages,
    'termine', v.termine_le is not null,
    'expire', v.expire_le < now(),
    'expire_le', v.expire_le);
end;
$$;

revoke execute on function public.recuperer_pages_photo(uuid) from public, anon;
grant  execute on function public.recuperer_pages_photo(uuid) to authenticated;
