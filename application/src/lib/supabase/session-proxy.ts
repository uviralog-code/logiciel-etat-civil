import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configurationSupabase } from "./configuration";
import { optionsCookies } from "./cookies";

/**
 * Renouvelle la session de la personne connectée à chaque requête (appelé par
 * le proxy). Si son jeton d'accès a expiré, un nouveau jeton est obtenu grâce
 * au jeton de renouvellement, et les cookies sont mis à jour à la fois pour la
 * page demandée et pour le navigateur.
 *
 * Renvoie la réponse à transmettre, et l'identité vérifiée (ou vide si personne
 * n'est connecté). Le contrôle des accès par rôle viendra au fichier 19.
 */
export async function rafraichirSession(requete: NextRequest) {
  const { url, clePublique } = configurationSupabase();
  let reponse = NextResponse.next({ request: requete });

  const protocole = requete.headers.get("x-forwarded-proto") ?? requete.nextUrl.protocol;

  const supabase = createServerClient(url, clePublique, {
    cookieOptions: optionsCookies(protocole),
    cookies: {
      getAll() {
        return requete.cookies.getAll();
      },
      setAll(aEcrire, entetes) {
        // 1. pour la page qui va être affichée
        for (const { name, value } of aEcrire) requete.cookies.set(name, value);
        reponse = NextResponse.next({ request: requete });
        // 2. pour le navigateur
        for (const { name, value, options } of aEcrire) reponse.cookies.set(name, value, options);
        // 3. en-têtes anti-cache fournis par Supabase (une réponse contenant une session ne doit pas être mise en cache)
        for (const [cle, valeur] of Object.entries(entetes ?? {})) reponse.headers.set(cle, valeur);
      },
    },
  });

  // Rien ne doit s'intercaler ici : getClaims() vérifie le jeton et le renouvelle si besoin.
  const { data } = await supabase.auth.getClaims();

  return { reponse, identite: data?.claims ?? null };
}
