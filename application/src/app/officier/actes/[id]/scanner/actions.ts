"use server";

import { regleAcces } from "@/lib/aiguillage";
import { enregistrerScan, type ResultatScan } from "@/lib/scans";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";

/**
 * Après l'envoi du PDF : le serveur relit le fichier réellement déposé et
 * l'enregistre comme scan de l'acte (fichier 33). Le droit d'agir est revérifié.
 * En cas de réussite, l'écran range les fichiers joints du dossier surveillé
 * (fichier 35), puis ouvre la fiche de l'acte.
 */
export async function archiver(acteId: string, motif: string | null, mode: "fichier" | "photo" | "scanner" = "fichier"): Promise<ResultatScan> {
  if (!regleAcces(await lireAgentConnecte(), "officier").autorise) {
    return { ok: false, message: "Seul l'Officier de l'entité peut archiver le scan d'un acte. Reconnectez-vous." };
  }
  const id = String(acteId);
  const r = await enregistrerScan(await creerClientServeur(), {
    acteId: id,
    motif: motif == null ? null : String(motif),
    mode: mode === "photo" || mode === "scanner" ? mode : "fichier",
  });
  return r;
}
