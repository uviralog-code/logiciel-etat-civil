"use client";

import { useEffect, useState } from "react";
import { CapturePhoto } from "@/components/capture-photo";
import { useEcranTactile } from "@/lib/ecran-tactile";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import { envoyerPage, tempsRestant, terminerEnvoi, type ActeDuTransfert, type PagePhoto } from "@/lib/transfert-photo";

/**
 * Sur le téléphone (fichier 34) : photographier chaque page de l'acte, la
 * recadrer, l'envoyer à l'ordinateur ; puis « J'ai terminé ».
 */
export function EnvoiTelephone({ secret, acte }: { secret: string; acte: ActeDuTransfert }) {
  const tactile = useEcranTactile();
  const [envoyees, setEnvoyees] = useState(acte.pages);
  const [termine, setTermine] = useState(acte.termine);
  const [erreur, setErreur] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const restant = tempsRestant(acte.expireLe, maintenant);

  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(Date.now()), 15000);
    return () => clearInterval(minuterie);
  }, []);

  async function envoyer(page: PagePhoto) {
    const r = await envoyerPage(creerClientNavigateur(), secret, page);
    if (!r.ok) throw new Error(r.message);
    setEnvoyees(r.numero);
  }

  async function terminer() {
    setErreur(null);
    const r = await terminerEnvoi(creerClientNavigateur(), secret);
    if (r.ok) setTermine(true);
    else setErreur(r.message);
  }

  if (termine) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[10px] border border-[#a7d3b1] bg-succes-fond p-5 text-succes-texte" data-testid="envoi-termine">
        <strong className="text-xl">C&apos;est envoyé : {envoyees} page{envoyees > 1 ? "s" : ""}.</strong>
        <span className="text-[17px]">Continuez sur l&apos;ordinateur : vérifiez les pages, cochez les 3 vérifications et validez l&apos;archivage.</span>
      </div>
    );
  }
  if (restant.expire) {
    return (
      <p role="alert" className="rounded-lg bg-attention-fond px-4 py-3 text-[17px] font-semibold text-attention-texte">
        Ce lien a expiré (il dure 10 minutes). Affichez un nouveau QR code sur l&apos;ordinateur.
        {envoyees > 0 && ` Les ${envoyees} page(s) déjà envoyée(s) sont sur l'ordinateur.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[17px]">
        Photographiez <strong>chaque page</strong> de l&apos;acte signé et cacheté, bien à plat, sur un fond sombre si possible.
      </p>
      <CapturePhoto tactile={tactile} libelleAjout="Redresser et envoyer la page" surPage={envoyer} />
      {envoyees > 0 && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-4">
          <p role="status" className="font-semibold text-succes-texte" data-testid="pages-envoyees">
            ✓ {envoyees} page{envoyees > 1 ? "s" : ""} envoyée{envoyees > 1 ? "s" : ""} à l&apos;ordinateur
          </p>
          <span className="text-[15px] text-texte-doux">Une autre page ? Prenez-la en photo. Sinon :</span>
          <button type="button" onClick={terminer} className="h-12 rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce">
            J&apos;ai terminé
          </button>
        </div>
      )}
      {erreur && (
        <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
          {erreur}
        </p>
      )}
      <p className="text-sm text-texte-doux" data-testid="validite-lien">
        Lien valable {restant.texte}, pour cet acte seulement.
      </p>
    </div>
  );
}
