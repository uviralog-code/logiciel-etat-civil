import Link from "next/link";
import { formaterNombreTaux, type EtatTaux } from "@/lib/taux";

const bouton = "inline-flex h-11 items-center rounded-lg px-[18px] font-bold whitespace-nowrap";

/**
 * Bande « Taux du jour » de l'accueil du caissier (maquette « Caissier — Accueil ») :
 * bleue quand le taux du jour est saisi, rouge sinon.
 */
export function BandeauTaux({ etat }: { etat: EtatTaux }) {
  if (etat.type === "du-jour") {
    return (
      <div
        data-testid="bandeau-taux"
        className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c5d4ee] bg-bleu-clair px-6 py-4 sm:px-10"
      >
        <span className="text-lg">
          Taux du jour : <strong className="text-[22px]">{formaterNombreTaux(etat.taux)} FC pour 1 $</strong>{" "}
          <span className="text-texte-doux">· saisi à {etat.heure}</span>
        </span>
        <Link href="/caissier/taux" className={`${bouton} border border-bleu-etat bg-surface text-bleu-etat hover:bg-white/70`}>
          Mettre à jour le taux
        </Link>
      </div>
    );
  }
  return (
    <div
      role="alert"
      data-testid="bandeau-taux"
      className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8a3a3] bg-erreur-fond px-6 py-4 text-erreur-texte sm:px-10"
    >
      <span className="text-lg">
        <strong>Aucun taux saisi aujourd&apos;hui.</strong>{" "}
        {etat.type === "ancien"
          ? `Le dernier taux (${formaterNombreTaux(etat.taux)} FC pour 1 $, saisi le ${etat.date}) s'applique encore aux actes en dollars.`
          : "Les actes en dollars ne peuvent pas être encaissés."}
      </span>
      <Link href="/caissier/taux" className={`${bouton} bg-erreur-texte text-white hover:opacity-90`}>
        Saisir le taux du jour
      </Link>
    </div>
  );
}
