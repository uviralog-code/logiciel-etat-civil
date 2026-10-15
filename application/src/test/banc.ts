import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import { adresseInterne } from "@/lib/identifiants";
import type { RoleUtilisateur } from "@/lib/charte";
import { signer, sql } from "../../../tests/banc/banc.mjs";

export { signer, sql };

/** Met les réglages du banc dans l'environnement, comme le ferait un fichier .env.local. */
export function brancherBanc() {
  const banc = inject("banc");
  process.env.NEXT_PUBLIC_SUPABASE_URL = banc.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = banc.clePublique;
  process.env.SUPABASE_SERVICE_ROLE_KEY = banc.cleService;
  return banc;
}

/** Nom d'utilisateur jamais utilisé, ex. « essai.k3x9q2 ». */
export function nomUnique(prefixe = "essai") {
  return `${prefixe}.${Math.random().toString(36).slice(2, 8)}`;
}

const echapper = (v: string) => v.replace(/'/g, "''");

/** Crée un compte de connexion dans le VRAI service Auth (avec la clé de service). */
export async function creerCompte(nom: string, motDePasse: string) {
  const banc = inject("banc");
  const admin = createClient(banc.url, banc.cleService, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email: adresseInterne(nom),
    password: motDePasse,
    email_confirm: true,
  });
  if (error) throw new Error(`Création du compte ${nom} impossible : ${error.message}`);
  return data.user.id;
}

/**
 * Crée un agent complet : compte de connexion + profil dans le logiciel.
 * L'éventuel agent actif ayant le même rôle dans la même entité est d'abord
 * désactivé (règle « un seul officier et un seul caissier actifs par entité »).
 */
export async function creerAgent(options: {
  nom?: string;
  role: RoleUtilisateur;
  entite?: "MUL" | "KAV" | "KAL" | "BAV";
  motDePasse?: string;
  doitChanger?: boolean;
  actif?: boolean;
  nomComplet?: string;
}) {
  const nom = options.nom ?? nomUnique(options.role);
  const motDePasse = options.motDePasse ?? "MotDePasse-2026";
  const id = await creerCompte(nom, motDePasse);
  const entite = options.role === "admin" ? null : (options.entite ?? "MUL");
  const entiteId = entite ? sql(`select id from public.entites where code = '${entite}'`) : null;

  if (options.actif !== false) {
    sql(
      options.role === "admin"
        ? `update public.utilisateurs set actif = false where role = 'admin' and actif`
        : `update public.utilisateurs set actif = false where role = '${options.role}' and entite_id = '${entiteId}' and actif`,
    );
  }
  sql(`insert into public.utilisateurs
         (id, nom_utilisateur, nom_complet, role, entite_id, actif, doit_changer_mot_de_passe, double_verification)
       values ('${id}', '${nom}', '${echapper(options.nomComplet ?? "Agent d'essai")}', '${options.role}',
               ${entiteId ? `'${entiteId}'` : "null"}, ${options.actif ?? true},
               ${options.doitChanger ?? false}, ${options.role === "admin"})`);
  return { id, nom, motDePasse };
}
