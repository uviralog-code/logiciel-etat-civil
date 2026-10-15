// Fichier 41 — formulaire de clôture : aide au comptage, écarts, explication, confirmation
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResultatCloture, SaisieCloture } from "@/lib/cloture";
import { FormulaireCloture } from "./formulaire-cloture";

const cloturer = vi.fn<(s: SaisieCloture) => Promise<ResultatCloture>>();
vi.mock("../actions", () => ({ cloturer: (s: SaisieCloture) => cloturer(s) }));
beforeEach(() => cloturer.mockReset());
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").trim();
const afficher = () => render(<FormulaireCloture attenduUsd={60} attenduCdf={223500} dateCourte="13/10/2026" />);
const billet = (libelle: string, nombre: string) => fireEvent.change(screen.getByLabelText(libelle), { target: { value: nombre } });

it("l'aide au comptage remplit le compté ; l'écart apparaît ; l'explication devient obligatoire", async () => {
  cloturer.mockResolvedValue({ ok: true });
  afficher();
  expect(n(screen.getByTestId("attendu-CDF").textContent)).toContain("223 500 FC");
  billet("Billets de 20 000 FC", "8");
  billet("Billets de 10 000 FC", "4");
  billet("Billets de 5 000 FC", "3");
  billet("Billets de 1 000 FC", "3");
  billet("Billets de 500 FC", "1");
  expect(n(screen.getByTestId("total-CDF").textContent)).toBe("218 500 FC");
  expect(n((screen.getByLabelText("Francs comptés") as HTMLInputElement).value)).toBe("218 500");
  expect(n(screen.getByTestId("ecart-CDF").textContent)).toBe("− 5 000 FC · manque");
  billet("Billets de 20 $", "2");
  billet("Billets de 10 $", "1");
  billet("Billets de 5 $", "2");
  expect(screen.getByTestId("ecart-USD").textContent).toBe("0 $ · juste");

  fireEvent.click(screen.getByRole("button", { name: "Clôturer la journée du 13/10/2026" }));
  expect(screen.getByRole("alert").textContent).toContain("expliquez-le");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.change(screen.getByLabelText("Expliquez l'écart (obligatoire)"), { target: { value: "Billet de 5 000 FC rendu par erreur" } });
  fireEvent.click(screen.getByRole("button", { name: "Clôturer la journée du 13/10/2026" }));
  const f = screen.getByRole("dialog", { name: "Clôturer la journée du 13/10/2026 ?" });
  expect(n(within(f).getByTestId("resume-cloture").textContent)).toContain("− 5 000 FC · manque");
  fireEvent.click(within(f).getByRole("button", { name: "Oui, clôturer" }));
  await waitFor(() =>
    expect(cloturer).toHaveBeenCalledWith({
      compteUsd: expect.stringMatching(/^60$/), compteCdf: expect.stringMatching(/^218.500$/), explication: "Billet de 5 000 FC rendu par erreur", attenduUsd: 60, attenduCdf: 223500,
    }),
  );
});

it("compte juste saisi à la main : pas d'explication ; refus de la base affiché", async () => {
  cloturer.mockResolvedValue({ ok: false, message: "Cette journée est déjà clôturée." });
  afficher();
  fireEvent.change(screen.getByLabelText("Dollars comptés"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Francs comptés"), { target: { value: "223500" } });
  expect(screen.queryByLabelText("Expliquez l'écart (obligatoire)")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clôturer la journée du 13/10/2026" }));
  fireEvent.click(screen.getByRole("button", { name: "Oui, clôturer" }));
  expect((await screen.findByTestId("erreur-cloture")).textContent).toBe("Cette journée est déjà clôturée.");
});

it("montant manquant : signalé avant la confirmation ; « Recompter » ferme la fenêtre", () => {
  afficher();
  fireEvent.click(screen.getByRole("button", { name: "Clôturer la journée du 13/10/2026" }));
  expect(screen.getByRole("alert").textContent).toContain("dollars comptés");
  fireEvent.change(screen.getByLabelText("Dollars comptés"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Francs comptés"), { target: { value: "223 500" } });
  fireEvent.click(screen.getByRole("button", { name: "Clôturer la journée du 13/10/2026" }));
  fireEvent.click(screen.getByRole("button", { name: "Recompter" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(cloturer).not.toHaveBeenCalled();
});
