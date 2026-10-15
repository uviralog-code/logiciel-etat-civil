-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 25 : REÇUS IMPRIMÉS (étape 7, fichier 39)
-- ---------------------------------------------------------------------
-- Décisions validées pour le reçu A5 :
--
-- 1. Chaque impression (ou téléchargement en PDF) d'un reçu est comptée :
--    la 1re est l'original, les suivantes portent « DUPLICATA n° N ».
--    Chaque impression est inscrite au journal d'audit.
-- 2. Chaque reçu porte un QR code menant à une page publique de
--    vérification : n° du reçu, montant, date, entité, type d'acte et
--    « Valide » ou « ANNULÉ » — jamais le nom d'une personne. Le lien
--    contient un jeton secret (impossible à deviner), pas l'ID du reçu.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. JETON DE VÉRIFICATION DU REÇU
-- ---------------------------------------------------------------------
-- 128 bits aléatoires : aucun moyen de deviner le lien d'un autre reçu.
alter table public.recus
  add column jeton_verification text not null default encode(extensions.gen_random_bytes(16), 'hex');

alter table public.recus
  add constraint recus_jeton_unique unique (jeton_verification);

comment on column public.recus.jeton_verification is
  'Secret du QR code de vérification imprimé sur le reçu (page publique /verifier/<jeton>).';

-- Le jeton ne se modifie jamais : la préparation du reçu le fixe à
-- l'émission, et une annulation garde tout le reste du reçu (fichier 05).
create or replace function public.figer_jeton_recu()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.jeton_verification := encode(extensions.gen_random_bytes(16), 'hex');
  elsif new.jeton_verification is distinct from old.jeton_verification then
    raise exception 'Le jeton de vérification d''un reçu ne peut pas être changé.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- « zz » : après la préparation du reçu (recus_preparer)
create trigger recus_zz_jeton
  before insert or update on public.recus
  for each row execute function public.figer_jeton_recu();


-- ---------------------------------------------------------------------
-- 2. IMPRESSIONS : ORIGINAL PUIS DUPLICATAS
-- ---------------------------------------------------------------------
create table public.impressions_recus (
  id           uuid primary key default extensions.gen_random_uuid(),
  recu_id      uuid not null references public.recus (id) on delete restrict,
  entite_id    uuid not null references public.entites (id) on delete restrict,
  numero       integer not null,                 -- 1 = original, 2 et plus = duplicata
  forme        text not null,                    -- 'impression' ou 'pdf'
  imprime_par  uuid references public.utilisateurs (id) default auth.uid(),
  imprime_le   timestamptz not null default now(),
  constraint impressions_numero_unique unique (recu_id, numero),
  constraint impressions_numero_positif check (numero >= 1),
  constraint impressions_forme_valide check (forme in ('impression', 'pdf'))
);

comment on table public.impressions_recus is
  'Chaque impression ou téléchargement d''un reçu : la 1re est l''original, les suivantes des duplicatas.';

alter table public.impressions_recus enable row level security;

create policy impressions_lecture on public.impressions_recus
  for select to authenticated using (public.peut_voir_entite(entite_id));
-- Pas d'écriture directe : seulement par enregistrer_impression()

-- Une impression ne se modifie ni ne s'efface
create trigger impressions_pas_de_modification
  before update on public.impressions_recus
  for each row execute function public.interdire_modification();
create trigger impressions_pas_de_suppression
  before delete on public.impressions_recus
  for each row execute function public.interdire_modification();

-- Au journal d'audit, comme les autres tables (fichier 07)
create trigger zz_journal_audit after insert or update or delete on public.impressions_recus
  for each row execute function public.journaliser();

-- Inscrit une impression et renvoie son numéro (1 = original).
-- Le Caissier de l'entité ou l'administrateur seulement.
create or replace function public.enregistrer_impression(p_recu uuid, p_forme text default 'impression')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recu   public.recus%rowtype;
  v_numero integer;
begin
  if coalesce(p_forme, '') not in ('impression', 'pdf') then
    raise exception 'Forme d''impression inconnue.' using errcode = 'P0001';
  end if;
  -- Verrou sur le reçu : deux impressions simultanées ne prennent pas le même numéro
  select * into v_recu from public.recus where id = p_recu for update;
  if not found or not (public.est_admin() or (public.est_caissier() and public.est_de_mon_entite(v_recu.entite_id))) then
    raise exception 'Reçu introuvable.' using errcode = 'P0001';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.impressions_recus where recu_id = p_recu;
  insert into public.impressions_recus (recu_id, entite_id, numero, forme, imprime_par)
  values (p_recu, v_recu.entite_id, v_numero, p_forme, auth.uid());
  return v_numero;
end;
$$;

comment on function public.enregistrer_impression(uuid, text) is
  'Compte une impression (ou un PDF) d''un reçu et renvoie son numéro : 1 = original, ensuite duplicata.';

revoke execute on function public.enregistrer_impression(uuid, text) from public, anon;
grant  execute on function public.enregistrer_impression(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. VÉRIFICATION PUBLIQUE D'UN REÇU (QR code)
-- ---------------------------------------------------------------------
-- Accessible sans connexion. Ne montre AUCUN nom de personne.
create or replace function public.verifier_recu(p_jeton text)
returns table (
  numero_recu   text,
  entite        text,
  type_acte     text,
  encaisse_le   timestamptz,
  journee       date,
  montant_recu  numeric,
  devise_recue  public.devise,
  statut        public.statut_recu,
  annule_le     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.numero_recu, e.nom, t.libelle, r.encaisse_le, r.journee, r.montant_recu, r.devise_recue, r.statut, r.annule_le
  from public.recus r
  join public.entites e on e.id = r.entite_id
  join public.actes a on a.id = r.acte_id
  join public.types_actes t on t.id = a.type_acte_id
  where p_jeton ~ '^[0-9a-f]{32}$'
    and r.jeton_verification = p_jeton
$$;

comment on function public.verifier_recu(text) is
  'Page publique du QR code : authenticité d''un reçu (numéro, montant, date, entité, statut), sans nom de personne.';

revoke execute on function public.verifier_recu(text) from public;
grant  execute on function public.verifier_recu(text) to anon, authenticated;
