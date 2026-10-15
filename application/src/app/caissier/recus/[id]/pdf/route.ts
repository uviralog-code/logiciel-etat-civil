import { NextResponse, type NextRequest } from "next/server";
import { regleAcces } from "@/lib/aiguillage";
import { adressePublique } from "@/lib/origine";
import { creerRecuPdf } from "@/lib/recu-pdf";
import { adresseVerification, enregistrerImpression, lireRecu, mentionImpression } from "@/lib/recus";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";

const texte = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" } });

/**
 * « Télécharger le PDF » (fichier 39) : le reçu A5 en PDF. Demandé en POST (le
 * téléchargement compte comme une impression : 1re = original, ensuite duplicata).
 */
export async function POST(_requete: NextRequest, { params }: RouteContext<"/caissier/recus/[id]/pdf">) {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return texte("Action réservée au caissier de l'entité.", 403);
  const supabase = await creerClientServeur();
  const recu = await lireRecu(supabase, (await params).id);
  if (!recu) return texte("Reçu introuvable.", 404);
  const impression = await enregistrerImpression(supabase, recu.id, "pdf");
  if (!impression.ok) return texte(impression.message, 400);
  const pdf = await creerRecuPdf(recu, {
    adresseQr: adresseVerification(await adressePublique(), recu.jeton),
    mention: mentionImpression(impression.numero),
  });
  return new NextResponse(pdf as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${recu.numero}${impression.numero > 1 ? `-duplicata-${impression.numero}` : ""}.pdf"`,
      "cache-control": "private, no-store",
      "x-numero-impression": String(impression.numero),
    },
  });
}
