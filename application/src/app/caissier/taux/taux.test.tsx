// Fichier 26 — « Taux du jour » : saisie, confirmation d'un gros écart, bande de l'accueil
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauTaux } from "@/components/bandeau-taux";
import type { ResultatTaux } from "@/lib/taux";
import { FormulaireTaux } from "./formulaire-taux";

const enregistrer = vi.fn<(t: string) => Promise<ResultatTaux>>();
vi.mock("./actions", () => ({ enregistrer: (t: string) => enregistrer(t) }));
beforeEach(() => enregistrer.mockReset());
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const champ = () => screen.getByLabelText("Francs congolais pour 1 dollar") as HTMLInputElement;
const taper = (v: string) => fireEvent.change(champ(), { target: { value: v } });
const envoyer = () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer le taux" }));

describe("Saisir le taux du jour", () => {
  it("aide : limites, puis exemple de conversion pendant la frappe", () => {
    render(<FormulaireTaux precedent={2850} />);
    expect(n(screen.getByTestId("aide-taux").textContent)).toBe("Entre 500 et 20 000 FC.");
    expect(champ().placeholder).toBe("2 850");
    taper("2 900");
    expect(n(screen.getByTestId("aide-taux").textContent)).toBe("Exemple : 10 $ = 29 000 FC.");
  });

  it("écart faible : enregistré directement ; réussite annoncée, champ vidé", async () => {
    enregistrer.mockResolvedValue({ ok: true, taux: 2900, heure: "08 h 12" });
    render(<FormulaireTaux precedent={2850} />);
    taper("2 900");
    envoyer();
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("2900"));
    expect(n((await screen.findByRole("status")).textContent)).toBe("Taux enregistré : 2 900 FC pour 1 $, à 08 h 12. Il s'applique dès maintenant.");
    expect(champ().value).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("garde-fou : un chiffre de trop est refusé avant tout envoi", () => {
    render(<FormulaireTaux precedent={2850} />);
    taper("28500");
    envoyer();
    expect(n(screen.getByRole("alert").textContent)).toContain("Taux invraisemblable : 28 500 FC pour 1 $");
    expect(champ().getAttribute("aria-invalid")).toBe("true");
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it("écart de plus de 10 % : confirmation ; « Corriger » n'envoie rien", () => {
    render(<FormulaireTaux precedent={2850} />);
    taper("3400");
    envoyer();
    const fenetre = screen.getByRole("dialog", { name: "Vérifiez le taux" });
    expect(n(within(fenetre).getByTestId("confirmation-taux").textContent)).toContain("2 850 FC→3 400 FCLe taux change de +19,3 % par rapport au taux précédent.");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Corriger" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(enregistrer).not.toHaveBeenCalled();
    expect(champ().value).toBe("3400");
  });

  it("écart confirmé : enregistré", async () => {
    enregistrer.mockResolvedValue({ ok: true, taux: 2500, heure: "08 h 15" });
    render(<FormulaireTaux precedent={2850} />);
    taper("2500");
    envoyer();
    fireEvent.click(screen.getByRole("button", { name: "Oui, enregistrer ce taux" }));
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("2500"));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("premier taux de l'entité : pas de comparaison, pas de confirmation", async () => {
    enregistrer.mockResolvedValue({ ok: false, message: "Action réservée au caissier de l'entité." });
    render(<FormulaireTaux precedent={null} />);
    taper("2850");
    envoyer();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toBe("Action réservée au caissier de l'entité.");
  });
});

describe("Bande de l'accueil du caissier (maquette)", () => {
  it("taux du jour saisi : bande bleue « Taux du jour : 2 850 FC pour 1 $ · saisi à 07 h 58 »", () => {
    render(<BandeauTaux etat={{ type: "du-jour", taux: 2850, heure: "07 h 58" }} />);
    const bande = screen.getByTestId("bandeau-taux");
    expect(n(bande.textContent)).toBe("Taux du jour : 2 850 FC pour 1 $ · saisi à 07 h 58Mettre à jour le taux");
    expect(bande.getAttribute("role")).toBeNull();
    expect(screen.getByRole("link", { name: "Mettre à jour le taux" }).getAttribute("href")).toBe("/caissier/taux");
  });

  it("aucun taux aujourd'hui, mais celui d'hier : rappel rouge, l'ancien taux s'applique encore", () => {
    render(<BandeauTaux etat={{ type: "ancien", taux: 2800, date: "13/10/2026" }} />);
    expect(n(screen.getByRole("alert").textContent)).toBe(
      "Aucun taux saisi aujourd'hui. Le dernier taux (2 800 FC pour 1 $, saisi le 13/10/2026) s'applique encore aux actes en dollars.Saisir le taux du jour",
    );
  });

  it("aucun taux du tout : les actes en dollars ne peuvent pas être encaissés (comme la maquette)", () => {
    render(<BandeauTaux etat={{ type: "aucun" }} />);
    expect(n(screen.getByRole("alert").textContent)).toBe(
      "Aucun taux saisi aujourd'hui. Les actes en dollars ne peuvent pas être encaissés.Saisir le taux du jour",
    );
  });
});
