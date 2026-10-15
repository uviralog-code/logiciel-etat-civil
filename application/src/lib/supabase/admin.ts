import "server-only";
import { createClient } from "@supabase/supabase-js";
import { configurationSupabase } from "./configuration";

/**
 * Client « administrateur technique » : utilise la clé de service, qui ignore
 * les règles d'accès. Réservé au serveur, et seulement pour les opérations
 * sur les comptes de connexion (création, mot de passe, renommage).
 *
 * Toute action qui l'utilise doit d'abord vérifier que la personne connectée
 * est bien l'administrateur principal.
 */
export function creerClientAdmin() {
  const { url } = configurationSupabase();
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cleService) {
    throw new Error(
      "Configuration manquante : SUPABASE_SERVICE_ROLE_KEY (clé de service, à garder secrète). Voir le fichier .env.example.",
    );
  }
  return createClient(url, cleService, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
