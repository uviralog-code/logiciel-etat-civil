"use client";

import { useEffect, useId, useState } from "react";
import { formaterTaille } from "@/lib/archivage";
import { lireFichierDossier, listerDossier, scanner, type EtatPont, type FichierDossier } from "@/lib/pont-scanner";
import { heureUvira } from "@/lib/taux";

/** Intervalle de lecture du dossier surveillé pendant que le panneau est ouvert. */
export const SUIVI_DOSSIER_MS = 4000;

const boutonPrincipal = "h-12 rounded-lg bg-bleu-etat px-6 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:opacity-50";
const boutonSecondaire = "h-11 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair disabled:opacity-50";

/**
 * « Scanner » (fichier 35) : le scanner du bureau, commandé par le pont
 * (EtatCivilScanner.exe + NAPS2), et les fichiers du dossier surveillé
 * (C:\EtatCivil\Scans) déposés par NAPS2 ou par le bouton du scanner.
 */
export function ScannerBureau({
  etat,
  reessayer,
  occupe,
  joints,
  surDocuments,
}: {
  etat: EtatPont | null;
  reessayer: () => void;
  occupe: boolean;
  /** Fichiers du dossier déjà joints à ce document. */
  joints: string[];
  /** Fichiers à ajouter au document ; `nomDossier` : fichier venu du dossier surveillé. */
  surDocuments: (fichiers: File[], nomDossier?: string) => Promise<void>;
}) {
  const ids = useId();
  const [scanEnCours, setScanEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dossier, setDossier] = useState<{ chemin: string; fichiers: FichierDossier[] } | null>(null);
  const [lecture, setLecture] = useState<string | null>(null);
  const pontOk = etat?.etat === "ok";

  // Le dossier surveillé, relu régulièrement
  useEffect(() => {
    if (!pontOk) return;
    let fini = false;
    const lire = () =>
      listerDossier()
        .then((d) => !fini && setDossier({ chemin: d.dossier, fichiers: d.fichiers }))
        .catch(() => {});
    lire();
    const minuterie = setInterval(lire, SUIVI_DOSSIER_MS);
    return () => {
      fini = true;
      clearInterval(minuterie);
    };
  }, [pontOk]);

  async function lancerScan() {
    setErreur(null);
    setScanEnCours(true);
    try {
      const r = await scanner();
      const heure = new Date().toTimeString().slice(0, 8).replace(/:/g, "h");
      await surDocuments([new File([r.pdf as Uint8Array<ArrayBuffer>], `scan-${heure}.pdf`, { type: "application/pdf" })]);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setScanEnCours(false);
    }
  }

  async function joindre(f: FichierDossier) {
    setErreur(null);
    setLecture(f.nom);
    try {
      await surDocuments([await lireFichierDossier(f)], f.nom);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setLecture(null);
    }
  }

  return (
    <section aria-labelledby={`${ids}-titre`} className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5" data-testid="scanner-bureau">
      <h3 id={`${ids}-titre`} className="text-xl font-bold">
        Scanner du bureau
      </h3>

      {!etat && <p role="status">Recherche du scanner…</p>}

      {etat?.etat === "absent" && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-attention-texte" data-testid="pont-absent">
          <p className="font-semibold">Le pont scanner ne répond pas sur cet ordinateur.</p>
          <ul className="list-disc pl-5 text-[15px]">
            <li>Vérifiez que NAPS2 et le pont scanner sont installés (guide d&apos;installation du scanner).</li>
            <li>
              Si le navigateur demande d&apos;<strong>autoriser l&apos;accès aux appareils du réseau local</strong>, répondez «
              Autoriser ».
            </li>
            <li>Redémarrer l&apos;ordinateur relance le pont.</li>
          </ul>
          <p className="text-[15px]">En attendant, scannez avec NAPS2 et utilisez « Importer un fichier ».</p>
          <button type="button" className={`${boutonSecondaire} self-start`} onClick={reessayer}>
            Réessayer
          </button>
        </div>
      )}

      {etat?.etat === "refuse" && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-attention-texte" data-testid="pont-refuse">
          <p className="font-semibold">{etat.message}</p>
          <p className="text-[15px]">Sur cet ordinateur, lancez une fois (voir le guide d&apos;installation) :</p>
          <code className="rounded bg-surface px-2 py-1 font-mono text-sm break-all text-encre" data-testid="commande-installation">
            {`C:\\EtatCivil\\EtatCivilScanner.exe --installer --origine ${typeof window === "undefined" ? "" : window.location.origin}`}
          </code>
          <button type="button" className={`${boutonSecondaire} self-start`} onClick={reessayer}>
            Réessayer
          </button>
        </div>
      )}

      {etat?.etat === "ok" && (
        <>
          {etat.pret && etat.scanner ? (
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className={boutonPrincipal} onClick={lancerScan} disabled={occupe || scanEnCours || etat.scanEnCours}>
                {scanEnCours ? "Scan en cours…" : "Scanner la page"}
              </button>
              <span className="text-[15px] text-texte-doux">
                {scanEnCours ? "Ne soulevez pas le capot pendant le scan." : `${etat.scanner} — posez l'acte face contre la vitre. Une page par scan.`}
              </span>
            </div>
          ) : (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-attention-texte">
              <p className="font-semibold">{etat.message}</p>
              <button type="button" className={`${boutonSecondaire} self-start`} onClick={reessayer}>
                Réessayer
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2" data-testid="dossier-surveille">
            <span className="text-[15px] font-semibold">
              Fichiers du dossier <span className="font-mono">{dossier?.chemin ?? etat.dossier}</span>
            </span>
            {!dossier || dossier.fichiers.length === 0 ? (
              <p className="text-[15px] text-texte-doux">
                Aucun fichier récent. Un fichier scanné avec NAPS2 (ou le bouton du scanner) dans ce dossier apparaîtra ici.
              </p>
            ) : (
              <ul className="flex flex-col">
                {dossier.fichiers.map((f) => {
                  const joint = joints.includes(f.nom);
                  return (
                    <li key={f.nom} data-fichier={f.nom} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] py-2">
                      <span className="min-w-0 break-all">
                        <span className="font-mono text-[15px]">{f.nom}</span>
                        <span className="text-sm text-texte-doux"> · {heureUvira(f.modifie)} · {formaterTaille(f.taille)}</span>
                      </span>
                      {joint ? (
                        <span className="font-semibold text-succes-texte">✓ Joint</span>
                      ) : (
                        <button type="button" className={boutonSecondaire} onClick={() => joindre(f)} disabled={occupe || lecture !== null}>
                          {lecture === f.nom ? "Lecture…" : "Joindre"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {erreur && (
        <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="erreur-scanner">
          {erreur}
        </p>
      )}
    </section>
  );
}
