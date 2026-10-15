-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 21 : ARCHIVER UN ACTE PAR FICHIER (étape 6, fichier 33)
-- ---------------------------------------------------------------------
-- Décision : l'archive d'un acte est TOUJOURS un seul PDF (les photos et
-- les pages sont réunies en un PDF dans le navigateur, avant l'envoi).
--
-- 1. L'espace « archives » n'accepte plus que des PDF.
-- 2. Un fichier ne peut être déposé QU'À l'emplacement prévu pour le
--    prochain scan d'un acte payé, exonéré ou délivré de son entité
--    (ex. MUL/2026/MUL-EXNAIS-2026-000123.pdf, puis …-v2.pdf).
-- 3. Un envoi interrompu (fichier déposé mais pas enregistré) peut être
--    repris : l'emplacement prévu peut être réécrit tant qu'aucun scan
--    ne s'y rapporte. Un fichier archivé, lui, ne change plus jamais.
-- 4. Taille et format du scan : lus dans l'espace de stockage (le fichier
--    réellement déposé), plus dans ce que l'application déclare.
-- 5. Même fichier déjà déposé : message clair, sans rien révéler des
--    actes d'une autre entité ; vérification possible AVANT l'envoi.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PDF SEULEMENT
-- ---------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['application/pdf']
 where id = 'archives';


-- ---------------------------------------------------------------------
-- 2. DÉPÔT : SEULEMENT À L'EMPLACEMENT PRÉVU
-- ---------------------------------------------------------------------
-- Le nom du fichier contient l'ID de l'acte : on retrouve l'acte, on
-- vérifie qu'il est de l'entité de l'Officier connecté et qu'il a été
-- établi (payé, exonéré, délivré), puis que le nom est EXACTEMENT celui
-- du prochain scan (version suivante). Tout autre nom est refusé.
create or replace function public.depot_archive_autorise(p_nom text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_identifiant text;
  v_acte        public.actes%rowtype;
begin
  if not public.est_officier() then
    return false;
  end if;

  v_identifiant := substring(
    p_nom from '^[A-Z]{2,6}/[0-9]{4}/([A-Z]{2,6}-[A-Z0-9]+-[0-9]{4}-[0-9]{6})(?:-v[0-9]+)?\.pdf$');
  if v_identifiant is null then
    return false;
  end if;

  select * into v_acte from public.actes where identifiant = v_identifiant;
  if not found
     or not public.est_de_mon_entite(v_acte.entite_id)
     or v_acte.statut in ('enregistre', 'en_attente_paiement', 'annule') then
    return false;
  end if;

  return p_nom = public.chemin_archive(v_acte.id, 'application/pdf');
end;
$$;

comment on function public.depot_archive_autorise(text) is
  'Vrai si l''Officier connecté peut déposer ce fichier : emplacement exact du prochain scan d''un acte établi de son entité.';

revoke execute on function public.depot_archive_autorise(text) from public, anon;
grant  execute on function public.depot_archive_autorise(text) to authenticated;

drop policy if exists archives_depot on storage.objects;
create policy archives_depot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archives' and public.depot_archive_autorise(name));

-- Reprise d'un envoi interrompu : l'emplacement du PROCHAIN scan peut être
-- réécrit (aucun scan ne s'y rapporte encore). Dès que le scan est
-- enregistré, le prochain emplacement devient « …-v2.pdf » : le fichier
-- archivé ne correspond plus et ne peut donc plus être touché.
drop policy if exists archives_reprise on storage.objects;
create policy archives_reprise on storage.objects
  for update to authenticated
  using      (bucket_id = 'archives' and public.depot_archive_autorise(name))
  with check (bucket_id = 'archives' and public.depot_archive_autorise(name));


-- ---------------------------------------------------------------------
-- 3. MÊME FICHIER DÉJÀ DÉPOSÉ ?
-- ---------------------------------------------------------------------
-- Message commun au contrôle avant l'envoi et à l'enregistrement. Pour un
-- acte d'une autre entité, l'ID n'est pas révélé.
create or replace function public.message_scan_en_double(p_acte uuid, p_empreinte text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entite uuid;
  v_autre  record;
begin
  select entite_id into v_entite from public.actes where id = p_acte;

  select d.acte_id, d.version, a.identifiant, a.entite_id
    into v_autre
  from public.documents_scannes d
  join public.actes a on a.id = d.acte_id
  where d.empreinte_sha256 = lower(btrim(p_empreinte))
  order by (d.acte_id = p_acte) desc, d.importe_le
  limit 1;

  if v_autre.acte_id is null then
    return null;
  elsif v_autre.acte_id = p_acte then
    return format('Ce fichier est identique au scan déjà archivé pour cet acte (version %s) : il n''y a rien à remplacer.',
                  v_autre.version);
  elsif v_autre.entite_id = v_entite then
    return format('Ce fichier est déjà enregistré pour l''acte %s. Vérifiez que vous avez scanné le bon document.',
                  v_autre.identifiant);
  else
    return 'Ce fichier est déjà enregistré pour un acte d''une autre entité. Vérifiez que vous avez scanné le bon document.';
  end if;
end;
$$;

revoke execute on function public.message_scan_en_double(uuid, text) from public, anon, authenticated;

-- Contrôle AVANT l'envoi (l'application calcule l'empreinte dans le
-- navigateur et prévient l'Officier avant de déposer quoi que ce soit)
create or replace function public.verifier_empreinte_scan(p_acte uuid, p_empreinte text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.actes a where a.id = p_acte and public.peut_voir_entite(a.entite_id)) then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  if coalesce(p_empreinte, '') !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Empreinte invalide.' using errcode = 'P0001';
  end if;
  return public.message_scan_en_double(p_acte, p_empreinte);
end;
$$;

comment on function public.verifier_empreinte_scan(uuid, text) is
  'Avant l''envoi : message si ce fichier (même empreinte SHA-256) est déjà archivé, sinon vide.';

revoke execute on function public.verifier_empreinte_scan(uuid, text) from public, anon;
grant  execute on function public.verifier_empreinte_scan(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. ENREGISTREMENT D'UN SCAN : CONTRÔLES (remplace la version du fichier 06)
-- ---------------------------------------------------------------------
create or replace function public.preparer_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acte    public.actes%rowtype;
  v_lot     public.lots_import%rowtype;
  v_doublon text;
  v_objet   jsonb;
begin
  select * into v_acte from public.actes where id = new.acte_id for update;
  if not found then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;

  -- L'acte doit être dans un état où son document existe
  if v_acte.statut = 'annule' then
    raise exception 'Cet acte est annulé : on ne peut plus y joindre de scan.' using errcode = 'P0001';
  end if;
  if v_acte.statut in ('enregistre', 'en_attente_paiement') then
    raise exception 'L''acte % n''est pas encore payé ni exonéré : le scan se fait après l''établissement de l''acte signé.',
      v_acte.identifiant using errcode = 'P0001';
  end if;

  -- Toujours un seul PDF
  if new.type_mime is distinct from 'application/pdf' then
    raise exception 'Le scan d''un acte doit être un fichier PDF.' using errcode = 'P0001';
  end if;

  -- Lot d'import : même entité, même type d'acte, lot encore ouvert
  if new.lot_id is not null then
    select * into v_lot from public.lots_import where id = new.lot_id;
    if v_lot.statut = 'ferme' then
      raise exception 'Ce lot est fermé : il n''accepte plus de documents.' using errcode = 'P0001';
    end if;
    if v_lot.entite_id <> v_acte.entite_id or v_lot.type_acte_id <> v_acte.type_acte_id then
      raise exception 'Cet acte (%) ne correspond pas au lot (autre type d''acte ou autre entité).',
        v_acte.identifiant using errcode = 'P0001';
    end if;
  end if;

  -- Même fichier déjà déposé ? (même empreinte)
  new.empreinte_sha256 := lower(btrim(new.empreinte_sha256));
  v_doublon := public.message_scan_en_double(new.acte_id, new.empreinte_sha256);
  if v_doublon is not null then
    raise exception '%', v_doublon using errcode = 'P0001';
  end if;

  -- Entité, version et emplacement : fixés par la base
  new.entite_id       := v_acte.entite_id;
  new.chemin_stockage := public.chemin_archive(new.acte_id, new.type_mime);
  select coalesce(max(d.version), 0) + 1 into new.version
  from public.documents_scannes d where d.acte_id = new.acte_id;
  new.importe_le      := now();
  new.importe_par     := coalesce(auth.uid(), new.importe_par);
  new.motif_remplacement := nullif(btrim(coalesce(new.motif_remplacement, '')), '');

  -- Le fichier doit déjà être déposé à l'emplacement prévu…
  select coalesce(o.metadata, '{}'::jsonb) into v_objet
  from storage.objects o
  where o.bucket_id = 'archives' and o.name = new.chemin_stockage;
  if not found then
    raise exception 'Aucun fichier trouvé à l''emplacement prévu (%). Déposez d''abord le fichier, puis enregistrez-le.',
      new.chemin_stockage using errcode = 'P0001';
  end if;

  -- … et sa taille et son format sont ceux du fichier réellement déposé
  if v_objet ? 'mimetype' and v_objet ->> 'mimetype' <> 'application/pdf' then
    raise exception 'Le fichier déposé n''est pas un PDF.' using errcode = 'P0001';
  end if;
  new.taille_octets := coalesce((v_objet ->> 'size')::bigint, new.taille_octets);

  return new;
end;
$$;
