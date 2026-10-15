// Fichier 40 — fenêtre « Annuler le reçu » : choix de la suite, motif libre, annonce
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResultatAnnulation } from "@/lib/recus-du-jour";
import { Annonces } from "./actualisation";
import { BoutonAnnulerRecu } from "./bouton-annuler-recu";

const annulerLeRecu = vi.fn<(id: string, motif: string, suite: string) => Promise<ResultatAnnulation>>();
vi.mock("./actions", () => ({ annulerLeRecu: (i: string, m: string, s: string) => annulerLeRecu(i, m, s) }));
beforeEach(() => annulerLeRecu.mockReset());
afterEach(cleanup);

const recu = { id: "00000000-0000-0000-0000-0000000000r1".replace("r1", "11"), numero: "MUL-REC-2026-000845", montant: "85 500 FC", acte: "MUL-EXNAIS-2026-000124", titulaire: "Mapendo Grace", peutRevenirEnFile: true };
const ouvrir = (r = recu) => {
  render(
    <>
      <Annonces />
      <BoutonAnnulerRecu recu={r} />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: `Annuler le reçu ${r.numero}` }));
  return screen.getByRole("dialog", { name: `Annuler le reçu ${r.numero}` });
};

it("erreur de caisse : acte remis dans la file ; annonce après l'annulation", async () => {
  annulerLeRecu.mockResolvedValue({ ok: true, numero: recu.numero, remis: true, acte: recu.acte });
  const f = ouvrir();
  expect(within(f).getByText(/à rendre à l'usager/).textContent).toContain("85 500 FC à rendre à l'usager");
  fireEvent.click(within(f).getByRole("radio", { name: /Erreur de caisse/ }));
  fireEvent.change(within(f).getByLabelText("Motif de l'annulation"), { target: { value: "L'usager voulait payer en dollars" } });
  fireEvent.click(within(f).getByRole("button", { name: "Annuler le reçu" }));
  await waitFor(() => expect(annulerLeRecu).toHaveBeenCalledWith(recu.id, "L'usager voulait payer en dollars", "remettre"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("status").textContent).toBe("Reçu MUL-REC-2026-000845 annulé. L'acte MUL-EXNAIS-2026-000124 est revenu dans la file « À encaisser ».");
});

it("acte déjà délivré : seule l'annulation de l'acte est possible (déjà choisie)", async () => {
  annulerLeRecu.mockResolvedValue({ ok: false, message: "Indiquez le motif de l'annulation (3 caractères au moins).", champ: "motif" });
  const f = ouvrir({ ...recu, peutRevenirEnFile: false });
  const remettre = within(f).getByRole("radio", { name: /Erreur de caisse/ }) as HTMLInputElement;
  expect(remettre.disabled).toBe(true);
  expect((within(f).getByRole("radio", { name: /Erreur sur l'acte/ }) as HTMLInputElement).checked).toBe(true);
  expect(within(f).getByText("Impossible : l'acte est déjà délivré.")).toBeTruthy();
  fireEvent.click(within(f).getByRole("button", { name: "Annuler le reçu" }));
  expect((await within(f).findByRole("alert")).textContent).toContain("3 caractères au moins");
  expect(within(f).getByLabelText("Motif de l'annulation").getAttribute("aria-invalid")).toBe("true");
});

it("« Garder le reçu » ferme sans rien envoyer", () => {
  const f = ouvrir();
  fireEvent.click(within(f).getByRole("button", { name: "Garder le reçu" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(annulerLeRecu).not.toHaveBeenCalled();
});
