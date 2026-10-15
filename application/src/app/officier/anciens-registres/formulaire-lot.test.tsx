// Fichier 36 — « Ouvrir un lot »
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FormulaireLot } from "./formulaire-lot";

const ouvrirLot = vi.hoisted(() => vi.fn(async (): Promise<unknown> => ({ ok: false, message: "Année du registre invalide (de 1900 à 2026).", champ: "annee" })));
vi.mock("./actions", () => ({ ouvrirLot }));
afterEach(cleanup);

it("type (types actifs, numérotés), année, description ; le refus est affiché sur le bon champ", async () => {
  render(<FormulaireLot types={[{ id: "t1", numero: 22, libelle: "Extrait d'acte de naissance" }]} anneeEnCours={2026} />);
  expect([...(screen.getByLabelText("Type d'acte du registre") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Choisir…", "22 · Extrait d'acte de naissance"]);
  fireEvent.change(screen.getByLabelText("Type d'acte du registre"), { target: { value: "t1" } });
  fireEvent.change(screen.getByLabelText("Année du registre"), { target: { value: "2031" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Registre des naissances 2031" } });
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le lot" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Année du registre invalide (de 1900 à 2026)."));
  expect(ouvrirLot).toHaveBeenCalledWith({ typeActeId: "t1", annee: "2031", description: "Registre des naissances 2031" });
  expect(screen.getByLabelText("Année du registre").getAttribute("aria-invalid")).toBe("true");
});
