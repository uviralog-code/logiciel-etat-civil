import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configurationSupabase } from "@/lib/supabase/configuration";
import { optionsCookies } from "@/lib/supabase/cookies";

/** Explications acceptées pour l'écran de connexion (rien d'autre ne passe). */
const MOTIFS = ["desactive"] as const;

/**
 * Ferme la session de ce poste puis renvoie vers la connexion.
 * Utilisé quand un compte est désactivé alors que l'agent était connecté :
 * la session est fermée et l'écran de connexion explique pourquoi.
 */
export async function GET(requete: NextRequest) {
  const motif = requete.nextUrl.searchParams.get("motif");
  const cible = new URL("/connexion", requete.url);
  if (motif && (MOTIFS as readonly string[]).includes(motif)) cible.searchParams.set("motif", motif);

  const reponse = NextResponse.redirect(cible, { status: 303 });
  reponse.headers.set("cache-control", "private, no-store");

  const { url, clePublique } = configurationSupabase();
  const supabase = createServerClient(url, clePublique, {
    cookieOptions: optionsCookies(requete.headers.get("x-forwarded-proto") ?? requete.nextUrl.protocol),
    cookies: {
      getAll: () => requete.cookies.getAll(),
      setAll: (aEcrire) => {
        for (const { name, value, options } of aEcrire) reponse.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.signOut({ scope: "local" });
  return reponse;
}
