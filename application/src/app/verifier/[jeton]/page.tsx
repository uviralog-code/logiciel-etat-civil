import type { Metadata } from "next";
import { Suspense } from "react";
import { LisereDrapeau } from "@/components/lisere-drapeau";
import { verifierRecu } from "@/lib/recus";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { aujourdhuiUvira, formaterDate, formaterMontant } from "@/lib/tarifs";

// Le lien contient un secret : ni indexé, ni transmis à d'autres sites
export const metadata: Metadata = { title: "Vérification d'un reçu", referrer: "no-referrer", robots: { index: false, follow: false } };

/**
 * Page PUBLIQUE ouverte par le QR code d'un reçu (fichier 39) : sans connexion.
 * Elle dit si le reçu est authentique et valable — sans aucun nom de personne.
 */
export default function Page({ params }: PageProps<"/verifier/[jeton]">) {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <header className="flex flex-col gap-0.5 bg-bleu-etat px-5 py-4 text-white sm:px-10">
        <span className="font-serif text-xl font-bold">État civil · Uvira</span>
        <span className="text-[15px] text-[#d6e2f7]">Vérification d&apos;un reçu de paiement</span>
      </header>
      <main className="flex w-full max-w-xl flex-col gap-4 self-center p-5">
        <Suspense fallback={<p>Vérification…</p>}>
          <Verification params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Verification({ params }: { params: PageProps<"/verifier/[jeton]">["params"] }) {
  const { jeton } = await params;
  const recu = await verifierRecu(await creerClientServeur(), String(jeton));

  if (!recu) {
    return (
      <section role="alert" data-testid="verification" className="flex flex-col gap-2 rounded-[10px] border-2 border-[#b42318] bg-erreur-fond p-5 text-erreur-texte">
        <h1 className="text-2xl font-bold">Reçu introuvable</h1>
        <p className="text-[17px]">
          Ce code ne correspond à aucun reçu émis par les bureaux de l&apos;état civil d&apos;Uvira. Le reçu peut être faux : présentez-le au Bureau de
          l&apos;État-Civil.
        </p>
      </section>
    );
  }
  const valide = recu.statut === "valide";
  return (
    <section
      data-testid="verification"
      className={`flex flex-col gap-4 rounded-[10px] border-2 p-5 ${valide ? "border-[#2e7d32] bg-succes-fond" : "border-[#b42318] bg-erreur-fond"}`}
    >
      <h1 className={`text-2xl font-bold ${valide ? "text-succes-texte" : "text-erreur-texte"}`}>
        {valide ? "Reçu authentique et valable" : "Reçu ANNULÉ : il n'a aucune valeur"}
      </h1>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[17px]">
        <dt className="text-texte-doux">N° du reçu</dt>
        <dd className="font-mono font-semibold break-all">{recu.numero}</dd>
        <dt className="text-texte-doux">Bureau</dt>
        <dd className="font-semibold">{recu.entite}</dd>
        <dt className="text-texte-doux">Acte</dt>
        <dd className="font-semibold">{recu.typeActe}</dd>
        <dt className="text-texte-doux">Payé le</dt>
        <dd className="font-semibold">
          {formaterDate(recu.journee)} à {heureUvira(recu.encaisseLe)}
        </dd>
        <dt className="text-texte-doux">Montant</dt>
        <dd className="text-xl font-bold">{formaterMontant(recu.montant, recu.devise)}</dd>
        {!valide && recu.annuleLe && (
          <>
            <dt className="text-texte-doux">Annulé le</dt>
            <dd className="font-semibold">{formaterDate(aujourdhuiUvira(new Date(recu.annuleLe)))} à {heureUvira(recu.annuleLe)}</dd>
          </>
        )}
      </dl>
      <p className="text-[15px] text-texte-doux">
        Vérifiez que le numéro et le montant sont bien ceux imprimés sur le reçu. Pour toute question : Bureau de l&apos;État-Civil.
      </p>
    </section>
  );
}
