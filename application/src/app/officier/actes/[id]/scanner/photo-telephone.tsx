"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CapturePhoto } from "@/components/capture-photo";
import { useEcranTactile } from "@/lib/ecran-tactile";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import { adresseTelephone, creerTransfert, recupererPages, tempsRestant, type PagePhoto, type Transfert } from "@/lib/transfert-photo";

/** Intervalle de vérification, sur l'ordinateur, des pages envoyées par le téléphone. */
export const SUIVI_MS = 3000;

type Lien = { transfert: Transfert; qr: string; adresse: string };

/** Crée le lien secret (10 minutes) et son QR code. */
async function creerLien(acteId: string): Promise<Lien | { erreur: string }> {
  const r = await creerTransfert(creerClientNavigateur(), acteId);
  if (!r.ok) return { erreur: r.message };
  const adresse = adresseTelephone(window.location.origin, r.transfert.secret);
  try {
    const qr = await QRCode.toDataURL(adresse, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    return { transfert: r.transfert, qr, adresse };
  } catch {
    return { erreur: "Le QR code n'a pas pu être dessiné." };
  }
}

/**
 * « Photo par téléphone » (fichier 34).
 * - Ordinateur : un QR code ouvre, SANS mot de passe, une page réservée à CET
 *   acte (10 minutes). Les pages photographiées et recadrées sur le téléphone
 *   arrivent ici, dans l'aperçu ; l'Officier vérifie puis valide l'archivage.
 *   Une photo déjà enregistrée sur l'ordinateur peut aussi être recadrée ici.
 * - Téléphone ou tablette où l'Officier est connecté : l'appareil photo, directement.
 */
export function PhotoTelephone({ acteId, occupe, surPage }: { acteId: string; occupe: boolean; surPage: (page: PagePhoto) => void }) {
  const ids = useId();
  const tactile = useEcranTactile();
  const [lien, setLien] = useState<Lien | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recues, setRecues] = useState(0);
  const [termine, setTermine] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const surPageRef = useRef(surPage);
  useEffect(() => {
    surPageRef.current = surPage;
  });

  const appliquerLien = useCallback((r: Lien | { erreur: string }) => {
    if ("erreur" in r) {
      setErreur(r.erreur);
      return;
    }
    setErreur(null);
    setTermine(false);
    setMaintenant(Date.now());
    setLien(r);
  }, []);
  const nouveauLien = () => creerLien(acteId).then(appliquerLien);

  // Ordinateur : un QR code dès l'ouverture
  useEffect(() => {
    if (tactile) return;
    let annule = false;
    creerLien(acteId).then((r) => !annule && appliquerLien(r));
    return () => {
      annule = true;
    };
  }, [tactile, acteId, appliquerLien]);

  const restant = lien ? tempsRestant(lien.transfert.expireLe, maintenant) : null;
  const actif = Boolean(lien && !termine && restant && !restant.expire);

  // Ordinateur : reprendre les pages arrivées, et faire avancer le compte à rebours
  useEffect(() => {
    if (!lien || !actif) return;
    const minuterie = setInterval(async () => {
      setMaintenant(Date.now());
      try {
        const r = await recupererPages(creerClientNavigateur(), lien.transfert.id);
        for (const p of r.pages) surPageRef.current({ jpeg: p.jpeg, largeur: p.largeur, hauteur: p.hauteur });
        if (r.pages.length) setRecues((n) => n + r.pages.length);
        if (r.termine) setTermine(true);
      } catch {
        // Réseau coupé : on réessaie au tour suivant
      }
    }, SUIVI_MS);
    return () => clearInterval(minuterie);
  }, [lien, actif]);

  return (
    <section aria-labelledby={`${ids}-titre`} className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5" data-testid="photo-telephone">
      <h3 id={`${ids}-titre`} className="text-xl font-bold">
        Photo par téléphone
      </h3>

      {tactile ? (
        <CapturePhoto tactile occupe={occupe} surPage={surPage} />
      ) : (
        <>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
              {erreur}
            </p>
          )}
          {lien && (
            <div className="flex flex-wrap items-start gap-5" data-testid="qr-telephone">
              {actif ? (
                // eslint-disable-next-line @next/next/no-img-element -- image produite dans le navigateur
                <img src={lien.qr} width={200} height={200} alt="QR code : ouvrir la page photo de cet acte sur le téléphone" className="rounded-lg border border-bordure" />
              ) : (
                <div className="flex size-[200px] items-center justify-center rounded-lg border border-dashed border-bordure-champ p-4 text-center text-texte-doux">
                  {termine ? "Envoi terminé par le téléphone" : "QR code expiré"}
                </div>
              )}
              <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[17px]">
                  <li>Visez ce code avec l&apos;appareil photo du téléphone et ouvrez le lien (aucun mot de passe).</li>
                  <li>Photographiez chaque page de l&apos;acte signé et cacheté, vérifiez les coins, envoyez.</li>
                  <li>Les pages arrivent ici, dans l&apos;aperçu : faites les vérifications, puis validez l&apos;archivage.</li>
                </ol>
                <p role="status" className="font-semibold" data-testid="etat-telephone">
                  {recues > 0 ? `${recues} page${recues > 1 ? "s" : ""} reçue${recues > 1 ? "s" : ""} du téléphone. ` : ""}
                  {termine
                    ? "Le téléphone a terminé l'envoi."
                    : restant?.expire
                      ? "Ce QR code a expiré."
                      : `QR code valable ${restant?.texte}, pour cet acte seulement.`}
                </p>
                {(termine || restant?.expire) && (
                  <button
                    type="button"
                    onClick={nouveauLien}
                    className="h-11 self-start rounded-lg border border-bleu-etat px-4 font-bold text-bleu-etat hover:bg-bleu-clair"
                  >
                    Nouveau QR code
                  </button>
                )}
              </div>
            </div>
          )}
          <details className="text-[17px]">
            <summary className="cursor-pointer font-semibold">La photo est déjà sur cet ordinateur ?</summary>
            <div className="mt-3">
              <CapturePhoto tactile={false} occupe={occupe} surPage={surPage} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
