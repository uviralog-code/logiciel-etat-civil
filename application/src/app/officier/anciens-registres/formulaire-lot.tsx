"use client";

import { useId, useState, useTransition } from "react";
import type { SaisieLot } from "@/lib/anciens-registres";
import { ouvrirLot } from "./actions";

const classeChamp = "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3 text-[17px] text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";

/** « Ouvrir un lot » : type d'acte, année du registre, description. */
export function FormulaireLot({ types, anneeEnCours }: { types: { id: string; numero: number; libelle: string }[]; anneeEnCours: number }) {
  const ids = useId();
  const [s, setS] = useState<SaisieLot>({ typeActeId: "", annee: "", description: "" });
  const [erreur, setErreur] = useState<{ message: string; champ?: keyof SaisieLot } | null>(null);
  const [enCours, demarrer] = useTransition();
  const changer = (champ: keyof SaisieLot) => (e: { target: { value: string } }) => setS((x) => ({ ...x, [champ]: e.target.value }));

  return (
    <section aria-labelledby={`${ids}-titre`} className="flex min-w-0 flex-[1_1_360px] flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5">
      <h2 id={`${ids}-titre`} className="text-xl font-bold">
        Ouvrir un lot
      </h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErreur(null);
          demarrer(async () => {
            const r = await ouvrirLot(s);
            if (!r.ok) setErreur({ message: r.message, champ: r.champ });
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-type`} className="font-semibold">
            Type d&apos;acte du registre
          </label>
          <select id={`${ids}-type`} value={s.typeActeId} onChange={changer("typeActeId")} className={classeChamp} aria-invalid={erreur?.champ === "typeActeId" || undefined}>
            <option value="">Choisir…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {String(t.numero).padStart(2, "0")} · {t.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-annee`} className="font-semibold">
            Année du registre
          </label>
          <input
            id={`${ids}-annee`}
            inputMode="numeric"
            maxLength={4}
            placeholder={`ex. ${anneeEnCours - 7}`}
            value={s.annee}
            onChange={changer("annee")}
            className={classeChamp}
            aria-invalid={erreur?.champ === "annee" || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-description`} className="font-semibold">
            Description
          </label>
          <input
            id={`${ids}-description`}
            maxLength={120}
            placeholder="ex. Registre des naissances 2019, volume 1"
            value={s.description}
            onChange={changer("description")}
            className={classeChamp}
            aria-invalid={erreur?.champ === "description" || undefined}
          />
        </div>
        {erreur && (
          <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
            {erreur.message}
          </p>
        )}
        <button type="submit" disabled={enCours} className="h-12 rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:opacity-50">
          {enCours ? "Ouverture…" : "Ouvrir le lot"}
        </button>
      </form>
    </section>
  );
}
