import { Icone } from "./icone";

const ETAPES = ["Type d'acte", "Fiche", "Transmission au Caissier"];

/** Les 3 étapes de la saisie d'un acte (en-tête des maquettes « Nouvel acte ») ; 4 = toutes faites. */
export function EtapesSaisie({ courante }: { courante: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Étapes de la saisie" className="flex flex-wrap items-center gap-3">
      {ETAPES.map((libelle, i) => {
        const n = i + 1;
        const etat = n < courante ? "faite" : n === courante ? "courante" : "a-venir";
        return (
          <li key={libelle} className="flex items-center gap-3" aria-current={etat === "courante" ? "step" : undefined}>
            {i > 0 && (
              <span aria-hidden="true" className="text-[#8a94a6]">
                ›
              </span>
            )}
            <span
              className={`flex items-center gap-2 ${
                etat === "courante" ? "font-bold text-bleu-etat" : etat === "faite" ? "font-semibold text-succes-texte" : "text-texte-doux"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${
                  etat === "courante"
                    ? "bg-bleu-etat text-white"
                    : etat === "faite"
                      ? "bg-[#2e7d32] text-white"
                      : "border-2 border-bordure-champ"
                }`}
              >
                {etat === "faite" ? <Icone nom="coche" taille={16} /> : n}
              </span>
              {libelle}
              {etat === "faite" && <span className="sr-only"> (fait)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
