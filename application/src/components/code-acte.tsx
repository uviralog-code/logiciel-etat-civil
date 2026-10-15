import { FAMILLES } from "@/lib/charte";
import type { TypeActe } from "@/lib/tarifs";

/** Pastille colorée du code de l'acte (couleur de la base, sinon celle de sa famille). */
export function CodeActe({ acte }: { acte: Pick<TypeActe, "code" | "couleur" | "famille"> }) {
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 font-mono text-[13px] font-semibold tracking-[0.03em] whitespace-nowrap text-white"
      style={{ background: acte.couleur ?? FAMILLES[acte.famille]?.couleur ?? "#374151" }}
    >
      {acte.code}
    </span>
  );
}
