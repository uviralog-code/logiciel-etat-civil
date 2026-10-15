/**
 * Crée le PREMIER compte administrateur (une seule fois, à l'installation).
 * Les autres comptes se créent ensuite dans le logiciel (« Comptes »).
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL,
 *             DOMAINE_COMPTES (par défaut agents.etatcivil-uvira.local),
 *             NOM_UTILISATEUR (ex. cdjp.admin), NOM_COMPLET, MOT_DE_PASSE_PROVISOIRE.
 * À la première connexion, l'administrateur choisit son mot de passe et relie
 * son téléphone (double vérification).
 */
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const e = (cle, defaut) => {
  const v = (process.env[cle] ?? defaut ?? "").trim();
  if (!v) throw new Error(`Variable manquante : ${cle}`);
  return v;
};
const nom = e("NOM_UTILISATEUR").toLowerCase();
const nomComplet = e("NOM_COMPLET");
const motDePasse = e("MOT_DE_PASSE_PROVISOIRE");
if (!/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(nom)) throw new Error("Nom d'utilisateur invalide : lettres minuscules, chiffres et points (ex. cdjp.admin).");
if (motDePasse.length < 10) throw new Error("Le mot de passe provisoire doit compter au moins 10 caractères.");

const sql = (requete) => execFileSync("psql", [e("SUPABASE_DB_URL"), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", requete], { encoding: "utf8" }).trim();
const litteral = (t) => `'${String(t).replace(/'/g, "''")}'`;

if (sql("select count(*) from public.utilisateurs where role = 'admin' and actif") !== "0") {
  console.log("Un administrateur existe déjà : rien n'est fait. Créez les autres comptes dans le logiciel (menu « Comptes »).");
  process.exit(0);
}
const service = createClient(e("SUPABASE_URL"), e("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await service.auth.admin.createUser({
  email: `${nom}@${e("DOMAINE_COMPTES", "agents.etatcivil-uvira.local")}`,
  password: motDePasse,
  email_confirm: true,
});
if (error) throw new Error(`Création du compte de connexion impossible : ${error.message}`);
sql(`insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, actif, doit_changer_mot_de_passe, double_verification)
     values (${litteral(data.user.id)}, ${litteral(nom)}, ${litteral(nomComplet)}, 'admin', null, true, true, true)`);
console.log(`Administrateur « ${nom} » (${nomComplet}) créé. À la première connexion : nouveau mot de passe, puis liaison du téléphone.`);
