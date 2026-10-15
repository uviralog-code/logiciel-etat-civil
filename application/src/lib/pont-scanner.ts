/**
 * LE PONT SCANNER (fichier 35), vu depuis le navigateur.
 *
 * EtatCivilScanner.exe tourne sur l'ordinateur de l'Officier (dossier
 * pont-scanner/) et n'écoute que l'ordinateur lui-même (127.0.0.1). Il
 * commande le scanner par NAPS2 et surveille le dossier C:\EtatCivil\Scans.
 * Il ne répond qu'aux pages du logiciel (adresses autorisées à l'installation).
 */

/** Adresse du pont sur l'ordinateur (réglable pour les essais). */
export const ADRESSE_PONT = process.env.NEXT_PUBLIC_PONT_SCANNER ?? "http://127.0.0.1:47820";

export interface EtatPontOk {
  etat: "ok";
  version: string;
  naps2: boolean;
  scanners: string[];
  scanner: string | null;
  dossier: string;
  pret: boolean;
  scanEnCours: boolean;
  message: string;
}
export type EtatPont =
  | EtatPontOk
  /** Le pont ne répond pas : pas installé, pas démarré, ou accès refusé par le navigateur. */
  | { etat: "absent" }
  /** Le pont répond mais n'autorise pas l'adresse de ce logiciel. */
  | { etat: "refuse"; message: string };

export interface FichierDossier {
  nom: string;
  taille: number;
  modifie: string;
}

async function appeler(chemin: string, init: RequestInit = {}, delaiMs = 5000): Promise<Response> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), delaiMs);
  try {
    return await fetch(`${ADRESSE_PONT}${chemin}`, { ...init, signal: controle.signal, cache: "no-store" });
  } finally {
    clearTimeout(minuterie);
  }
}

async function messageErreur(r: Response, defaut: string): Promise<string> {
  try {
    const corps = (await r.json()) as { erreur?: string };
    return corps.erreur ?? defaut;
  } catch {
    return defaut;
  }
}

/** État du pont et du scanner (« Scanner HP du bureau · prêt »). */
export async function lireEtatPont(rafraichir = false): Promise<EtatPont> {
  let r: Response;
  try {
    r = await appeler(`/api/etat${rafraichir ? "?rafraichir=1" : ""}`, {}, rafraichir ? 35000 : 8000);
  } catch {
    return { etat: "absent" };
  }
  if (r.status === 403) return { etat: "refuse", message: await messageErreur(r, "Le pont n'autorise pas cette adresse.") };
  if (!r.ok) return { etat: "absent" };
  return { etat: "ok", ...((await r.json()) as Omit<EtatPontOk, "etat">) };
}

/** Lance un scan ; renvoie le PDF (quelques secondes à quelques minutes avec le chargeur). */
export async function scanner(): Promise<{ pdf: Uint8Array; scanner: string }> {
  let r: Response;
  try {
    r = await appeler("/api/scanner", { method: "POST" }, 4 * 60 * 1000);
  } catch {
    throw new Error("Le pont scanner ne répond plus. Vérifiez que l'ordinateur n'a pas été redémarré, puis réessayez.");
  }
  if (!r.ok) throw new Error(await messageErreur(r, "Le scan a échoué."));
  return { pdf: new Uint8Array(await r.arrayBuffer()), scanner: r.headers.get("X-Scanner") ?? "" };
}

/** Fichiers récents du dossier surveillé (les plus récents d'abord). */
export async function listerDossier(): Promise<{ dossier: string; fichiers: FichierDossier[] }> {
  const r = await appeler("/api/dossier");
  if (!r.ok) throw new Error(await messageErreur(r, "Dossier surveillé illisible."));
  return (await r.json()) as { dossier: string; fichiers: FichierDossier[] };
}

/** Un fichier du dossier, prêt à être joint comme un fichier importé. */
export async function lireFichierDossier(f: FichierDossier): Promise<File> {
  const r = await appeler(`/api/dossier/fichier?nom=${encodeURIComponent(f.nom)}`, {}, 30000);
  if (!r.ok) throw new Error(await messageErreur(r, `« ${f.nom} » est introuvable.`));
  return new File([await r.arrayBuffer()], f.nom, { type: r.headers.get("Content-Type") ?? "" });
}

/** Après l'archivage : les fichiers joints vont dans « Joints\AAAA-MM » (rien n'est effacé). */
export async function rangerFichiers(noms: string[]): Promise<void> {
  if (noms.length === 0) return;
  await appeler("/api/dossier/ranger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noms }) }).catch(() => {});
}

/** Texte de la carte « Scanner » (maquette : « Scanner HP du bureau · prêt »). */
export function texteCarteScanner(e: EtatPont | null): { texte: string; pret: boolean } {
  if (!e) return { texte: "Recherche du scanner…", pret: false };
  if (e.etat === "absent") return { texte: "Pont scanner non démarré sur cet ordinateur", pret: false };
  if (e.etat === "refuse") return { texte: "Pont scanner à régler (adresse non autorisée)", pret: false };
  if (e.scanEnCours) return { texte: `${e.scanner ?? "Scanner"} · scan en cours`, pret: false };
  return e.pret && e.scanner ? { texte: `${e.scanner} · prêt`, pret: true } : { texte: e.message, pret: false };
}
