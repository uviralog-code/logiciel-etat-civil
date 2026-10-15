/**
 * ENVOI REPRENABLE D'UN SCAN (fichier 33)
 *
 * Le PDF est envoyé à l'espace de stockage de Supabase par morceaux de 6 Mo
 * (protocole « tus », tus-js-client). Si la connexion coupe, l'envoi
 * reprend tout seul là où il s'était arrêté ; si la page est rechargée, il
 * reprend aussi (le navigateur garde la trace des envois commencés).
 *
 * La base n'accepte le fichier qu'à l'emplacement prévu pour le prochain
 * scan de l'acte (migration 21) ; un envoi raté peut y être recommencé.
 */
import { DetailedError, Upload } from "tus-js-client";

/** Taille des morceaux exigée par Supabase pour l'envoi reprenable. */
export const TAILLE_MORCEAU = 6 * 1024 * 1024;
/** Nouvel essai automatique après une coupure : tout de suite, puis 1, 3, 5, 10 et 20 secondes. */
export const ATTENTES_NOUVEL_ESSAI = [0, 1000, 3000, 5000, 10000, 20000];

export interface EnvoiScan {
  /** Adresse du projet Supabase. */
  url: string;
  clePublique: string;
  /** Jeton de session de l'Officier connecté (les règles d'accès s'appliquent). */
  jeton: string;
  /** Emplacement prévu par la base, ex. MUL/2026/MUL-EXNAIS-2026-000123.pdf */
  chemin: string;
  octets: Uint8Array;
  /** Empreinte du PDF : sert à reconnaître un envoi commencé à reprendre. */
  empreinte: string;
  surProgression?: (envoye: number, total: number) => void;
}

/** Message clair à partir d'une erreur d'envoi. */
export function messageErreurEnvoi(erreur: unknown): string {
  const statut = erreur instanceof DetailedError ? erreur.originalResponse?.getStatus() : undefined;
  if (statut === 401) return "Votre session a expiré : reconnectez-vous, puis recommencez l'envoi.";
  if (statut === 403) {
    return "Le dépôt a été refusé : l'acte doit être payé ou exonéré, et de votre entité. Rechargez la page et réessayez.";
  }
  if (statut === 413) return "Le fichier dépasse 15 Mo : il ne peut pas être envoyé.";
  if (statut === 415) return "Seuls les PDF sont acceptés.";
  if (statut === undefined || statut === 0 || statut >= 500) {
    return "La connexion a été coupée pendant l'envoi. Vérifiez la connexion puis réessayez : l'envoi reprendra là où il s'était arrêté.";
  }
  return `L'envoi a échoué (code ${statut}). Réessayez.`;
}

/** Envoie le PDF ; la promesse se termine quand le fichier est entièrement déposé. */
export function envoyerScan(e: EnvoiScan): Promise<void> {
  // Navigateur : un Blob ; serveur et tests : un Buffer
  const source = typeof window === "undefined" ? Buffer.from(e.octets) : new Blob([e.octets as Uint8Array<ArrayBuffer>], { type: "application/pdf" });

  return new Promise((resoudre, rejeter) => {
    const envoi = new Upload(source, {
      endpoint: `${e.url}/storage/v1/upload/resumable`,
      chunkSize: TAILLE_MORCEAU,
      retryDelays: ATTENTES_NOUVEL_ESSAI,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Un envoi commencé n'est repris que pour le même emplacement ET le même contenu
      fingerprint: async () => `etat-civil:${e.chemin}:${e.empreinte}`,
      headers: {
        authorization: `Bearer ${e.jeton}`,
        apikey: e.clePublique,
        // Réécrire l'emplacement prévu si un envoi précédent s'y est arrêté
        // (la base n'autorise que l'emplacement du prochain scan, jamais un scan archivé)
        "x-upsert": "true",
      },
      metadata: { bucketName: "archives", objectName: e.chemin, contentType: "application/pdf", cacheControl: "3600" },
      onProgress: (envoye, total) => e.surProgression?.(envoye, total),
      onError: (erreur) => rejeter(new Error(messageErreurEnvoi(erreur))),
      onSuccess: () => resoudre(),
    });
    envoi
      .findPreviousUploads()
      .then((precedents) => {
        if (precedents.length > 0) envoi.resumeFromPreviousUpload(precedents[0]);
        envoi.start();
      })
      .catch(() => envoi.start());
  });
}
