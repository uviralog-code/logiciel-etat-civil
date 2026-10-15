import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { configurationSupabase } from "./configuration";
import { optionsCookies } from "./cookies";

/**
 * Client Supabase côté serveur (pages, actions), au nom de la personne connectée.
 * Toutes les règles d'accès de la base (fichier 08) s'appliquent à ses requêtes.
 *
 * Avec le mode « Cache Components » de Next.js 16, la lecture des cookies doit se
 * faire dans une zone d'affichage différé (<Suspense>) : à respecter dans les pages.
 */
export async function creerClientServeur() {
  // Lire d'abord la requête : lors de la préparation des pages à l'avance (build),
  // Next.js s'arrête ici et laisse cette partie pour le moment de la visite.
  // connection() : le client Supabase lit l'heure (validité de la session) ; cette partie
  // ne doit pas être préparée à l'avance par Next.js, seulement au moment de la visite.
  await connection();
  const magasin = await cookies();
  const protocole = (await headers()).get("x-forwarded-proto");
  const { url, clePublique } = configurationSupabase();

  return createServerClient(url, clePublique, {
    cookieOptions: optionsCookies(protocole),
    cookies: {
      getAll() {
        return magasin.getAll();
      },
      setAll(aEcrire) {
        try {
          for (const { name, value, options } of aEcrire) {
            magasin.set(name, value, options);
          }
        } catch {
          // Appelé depuis l'affichage d'une page, où l'écriture de cookies est
          // impossible : sans gravité, le proxy renouvelle la session à chaque requête.
        }
      },
    },
  });
}
