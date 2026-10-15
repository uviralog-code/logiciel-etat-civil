import type { Metadata } from "next";
import { Suspense } from "react";
import { LisereDrapeau } from "@/components/lisere-drapeau";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lireTransfert, secretValide } from "@/lib/transfert-photo";
import { EnvoiTelephone } from "./envoi-telephone";

// Le lien contient un secret : il ne doit être ni indexé, ni transmis à d'autres sites
export const metadata: Metadata = { title: "Photo d'un acte", referrer: "no-referrer", robots: { index: false, follow: false } };

/**
 * Page du TÉLÉPHONE ouverte par le QR code de l'écran « Scan de l'acte »
 * (fichier 34) : sans mot de passe, pour un seul acte, pendant 10 minutes.
 * Elle ne permet que de photographier l'acte et d'envoyer les pages à l'ordinateur.
 */
export default function Page({ params }: PageProps<"/photo/[jeton]">) {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <header className="flex flex-col gap-0.5 bg-bleu-etat px-5 py-4 text-white">
        <span className="font-serif text-xl font-bold">État civil · Uvira</span>
        <span className="text-[15px] text-[#d6e2f7]">Photo d&apos;un acte pour l&apos;ordinateur de l&apos;Officier</span>
      </header>
      <Suspense fallback={<p className="p-5">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </div>
  );
}

async function Contenu({ params }: { params: PageProps<"/photo/[jeton]">["params"] }) {
  const { jeton } = await params;
  const r = secretValide(jeton) ? await lireTransfert(await creerClientServeur(), jeton) : ({ ok: false, message: "Ce lien n'est pas valable." } as const);

  if (!r.ok) {
    return (
      <main className="flex flex-col gap-4 p-5">
        <p role="alert" className="rounded-lg bg-attention-fond px-4 py-3 text-[17px] font-semibold text-attention-texte">
          {r.message}
        </p>
        <p className="text-[17px]">Sur l&apos;ordinateur, dans « Scan de l&apos;acte », choisissez « Photo par téléphone » : un nouveau QR code s&apos;affiche.</p>
      </main>
    );
  }
  const { acte } = r;
  return (
    <main className="flex flex-col">
      <div className="flex flex-col gap-1 px-5 py-4 text-white" style={{ background: acte.couleur ?? "#0d47a1" }} data-testid="bandeau-type">
        <span className="text-lg leading-tight font-bold uppercase">{acte.typeLibelle}</span>
        <span>
          Titulaire : <strong>{acte.titulaire}</strong>
        </span>
        <span className="self-start rounded-md bg-white px-2.5 py-1 font-mono font-semibold break-all" style={{ color: acte.couleur ?? "#0d47a1" }}>
          {acte.identifiant}
        </span>
      </div>
      <div className="p-4">
        <EnvoiTelephone key={crypto.randomUUID()} secret={jeton} acte={acte} />
      </div>
    </main>
  );
}
