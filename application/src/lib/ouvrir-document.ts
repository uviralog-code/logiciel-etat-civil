import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { regleAcces } from "./aiguillage";
import type { RoleUtilisateur } from "./charte";
import { lienConsultation } from "./scans";
import { lireAgentConnecte } from "./session";
import { creerClientServeur } from "./supabase/serveur";

/**
 * « Voir le document » (fichier 33) : ouvre le PDF d'un acte par un lien
 * valable 5 minutes. L'espace de stockage est privé : le lien n'est donné qu'à
 * une personne qui a le droit de voir l'acte (Officier et Caissier de
 * l'entité, administrateur). Par défaut, la version qui fait foi.
 */
export async function ouvrirDocument(role: RoleUtilisateur, requete: NextRequest, acteId: string): Promise<NextResponse> {
  const decision = regleAcces(await lireAgentConnecte(), role);
  if (!decision.autorise) return NextResponse.redirect(new URL(decision.redirection, requete.url), 303);

  const version = requete.nextUrl.searchParams.get("version");
  const supabase = await creerClientServeur();
  let demande = supabase.from("documents_scannes").select("chemin_stockage").eq("acte_id", acteId);
  if (version && /^\d{1,3}$/.test(version)) demande = demande.eq("version", Number(version));
  const { data } = await demande.order("version", { ascending: false }).limit(1).maybeSingle<{ chemin_stockage: string }>();

  const lien = data ? await lienConsultation(supabase, data.chemin_stockage) : null;
  if (!lien) {
    return new NextResponse("Document introuvable : cet acte n'a pas de scan, ou vous n'avez pas le droit de le voir.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }
  const reponse = NextResponse.redirect(lien, 303);
  reponse.headers.set("cache-control", "private, no-store");
  return reponse;
}
