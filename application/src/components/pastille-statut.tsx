import { STATUTS, type StatutActe } from "@/lib/charte";

/** Pastille colorée indiquant le statut d'un acte (« Payé », « Délivré »…). */
export function PastilleStatut({ statut }: { statut: StatutActe }) {
  const s = STATUTS[statut];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold"
      style={{ backgroundColor: s.fond, color: s.texte }}
    >
      {s.libelle}
    </span>
  );
}
