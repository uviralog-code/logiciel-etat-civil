import { createBrowserClient } from "@supabase/ssr";
import { configurationSupabase } from "./configuration";
import { optionsCookies } from "./cookies";

/**
 * Client Supabase utilisé dans le navigateur (composants « client »).
 * La session est gardée dans des cookies, lisibles aussi par le serveur.
 */
export function creerClientNavigateur() {
  const { url, clePublique } = configurationSupabase();
  return createBrowserClient(url, clePublique, {
    cookieOptions: optionsCookies(typeof window === "undefined" ? null : window.location.protocol),
  });
}
