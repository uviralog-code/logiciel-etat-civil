import type { NextRequest } from "next/server";
import { ouvrirDocument } from "@/lib/ouvrir-document";

/** « Voir le document » : le PDF de l'acte, par un lien valable 5 minutes (fichier 33). */
export async function GET(requete: NextRequest, { params }: RouteContext<"/admin/actes/[id]/document">) {
  return ouvrirDocument("admin", requete, (await params).id);
}
