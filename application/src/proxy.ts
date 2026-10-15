import { NextResponse, type NextRequest } from "next/server";
import { adresseConnexion, estProtege } from "@/lib/aiguillage";
import { rafraichirSession } from "@/lib/supabase/session-proxy";

/**
 * Proxy (anciennement « middleware ») : s'exécute avant chaque page.
 *   1. renouvelle la session si besoin ;
 *   2. vérification rapide : sans session, toute page protégée renvoie vers
 *      la connexion, sans même être préparée.
 *
 * Le contrôle complet (rôle, compte actif, mot de passe provisoire, code de
 * vérification) est fait dans chaque page (src/lib/acces.ts), et la base
 * applique ses propres règles : le proxy n'est qu'un premier filtre.
 */
export async function proxy(requete: NextRequest) {
  const { reponse, identite } = await rafraichirSession(requete);

  if (!identite && estProtege(requete.nextUrl.pathname)) {
    // La page demandée est mémorisée : on y revient après la connexion
    const cible = adresseConnexion(requete.nextUrl.pathname, requete.nextUrl.search);
    const redirection = NextResponse.redirect(new URL(cible, requete.url));
    // Les cookies mis à jour (ou effacés) par Supabase accompagnent la redirection
    for (const cookie of reponse.cookies.getAll()) redirection.cookies.set(cookie);
    redirection.headers.set("cache-control", "private, no-store");
    return redirection;
  }
  return reponse;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques (scripts, styles, images, polices)
    // et OpenCV.js, servi tel quel depuis /vendor/
    "/((?!_next/static|_next/image|vendor/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
