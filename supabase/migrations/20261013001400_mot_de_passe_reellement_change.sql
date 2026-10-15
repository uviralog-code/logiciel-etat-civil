-- =====================================================================
-- MIGRATION 14 : L'OBLIGATION DE CHANGER LE MOT DE PASSE NE SE LÈVE
--                QUE SI LE MOT DE PASSE A RÉELLEMENT CHANGÉ
-- ---------------------------------------------------------------------
-- Faiblesse corrigée : jusqu'ici, un agent averti pouvait appeler
-- directement mot_de_passe_change() et garder le mot de passe provisoire,
-- que l'administrateur connaît.
--
-- Principe :
--   - quand l'obligation est posée (création du compte, réinitialisation),
--     la base note une EMPREINTE du mot de passe provisoire ;
--   - mot_de_passe_change() compare cette empreinte au mot de passe actuel
--     et refuse s'ils sont identiques.
--
-- L'empreinte est un condensé (SHA-256) du mot de passe déjà chiffré par
-- Supabase : elle ne permet en aucun cas de retrouver le mot de passe.
-- Elle est rangée dans une table que personne ne peut lire par l'API.
--
-- Ordre à respecter par l'administrateur (fichier 22) : changer d'abord le
-- mot de passe dans Supabase, PUIS poser l'obligation.
-- =====================================================================

create table public.mots_de_passe_provisoires (
  utilisateur_id uuid primary key references public.utilisateurs (id) on delete cascade,
  empreinte      text not null,
  pose_le        timestamptz not null default now()
);

comment on table public.mots_de_passe_provisoires is
  'Empreinte du mot de passe provisoire en cours (illisible par l''API) : sert à vérifier qu''il a bien été remplacé.';

-- Personne n'y accède par l'API : seules les fonctions de la base s'en servent
alter table public.mots_de_passe_provisoires enable row level security;
revoke all on public.mots_de_passe_provisoires from anon, authenticated, service_role;


-- Empreinte du mot de passe actuel d'un compte
create or replace function public.empreinte_mot_de_passe(utilisateur uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(u.encrypted_password, ''), 'sha256'), 'hex')
  from auth.users u
  where u.id = utilisateur
$$;
revoke execute on function public.empreinte_mot_de_passe(uuid) from public, anon, authenticated, service_role;


-- Pose (ou repose) l'empreinte quand l'obligation est posée ; l'efface quand elle est levée.
-- Se déclenche dès que la colonne figure dans la modification, même avec la même valeur :
-- une nouvelle réinitialisation note donc toujours le NOUVEAU mot de passe provisoire.
create or replace function public.suivre_mot_de_passe_provisoire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.doit_changer_mot_de_passe then
    insert into public.mots_de_passe_provisoires (utilisateur_id, empreinte)
    values (new.id, public.empreinte_mot_de_passe(new.id))
    on conflict (utilisateur_id)
      do update set empreinte = excluded.empreinte, pose_le = now();
  else
    delete from public.mots_de_passe_provisoires where utilisateur_id = new.id;
  end if;
  return null;
end;
$$;

create trigger utilisateurs_suivi_mot_de_passe_provisoire
  after insert or update of doit_changer_mot_de_passe on public.utilisateurs
  for each row execute function public.suivre_mot_de_passe_provisoire();


-- Comptes déjà soumis à l'obligation : leur mot de passe actuel est le provisoire
insert into public.mots_de_passe_provisoires (utilisateur_id, empreinte)
select u.id, public.empreinte_mot_de_passe(u.id)
from public.utilisateurs u
where u.doit_changer_mot_de_passe
on conflict (utilisateur_id) do nothing;


-- Nouvelle version : refuse si le mot de passe est toujours le provisoire
create or replace function public.mot_de_passe_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Réservé à la personne connectée.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.mots_de_passe_provisoires p
    where p.utilisateur_id = auth.uid()
      and p.empreinte = public.empreinte_mot_de_passe(auth.uid())
  ) then
    raise exception 'Le mot de passe provisoire n''a pas été remplacé : choisissez d''abord un nouveau mot de passe.'
      using errcode = 'P0001';
  end if;

  update public.utilisateurs
     set doit_changer_mot_de_passe = false
   where id = auth.uid() and actif;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
-- ---------------------------------------------------------------------
revoke execute on function public.suivre_mot_de_passe_provisoire() from public, anon, authenticated;
revoke execute on function public.mot_de_passe_change() from public, anon;
grant  execute on function public.mot_de_passe_change() to authenticated;
