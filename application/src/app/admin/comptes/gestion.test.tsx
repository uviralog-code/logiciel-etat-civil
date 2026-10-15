// Fichier 22 — boutons « Mot de passe… » et « Désactiver » et leurs fenêtres
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatDesactivation, ResultatReinitialisation } from "@/lib/gestion-compte";
import { ActionsCompte } from "./actions-compte";

const reinitialiser = vi.fn<(id: string) => Promise<ResultatReinitialisation>>();
const desactiver = vi.fn<(id: string) => Promise<ResultatDesactivation>>();
vi.mock("./actions", () => ({
  reinitialiser: (id: string) => reinitialiser(id),
  desactiver: (id: string) => desactiver(id),
}));

beforeEach(() => {
  reinitialiser.mockReset();
  desactiver.mockReset();
});
afterEach(cleanup);

const afficher = () =>
  render(<ActionsCompte id="u-42" nomUtilisateur="kalundu.caissier" nomComplet="Pierre Ndoole" poste="Caissier · Commune de Kalundu" />);
const fenetre = () => screen.getByRole("dialog");

describe("Réinitialisation du mot de passe", () => {
  it("la fenêtre explique les conséquences avant d'agir ; « Annuler » ne fait rien", () => {
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Mot de passe de kalundu.caissier" }));
    expect(within(fenetre()).getByRole("heading", { name: "Réinitialiser le mot de passe" })).toBeTruthy();
    expect(fenetre().textContent).toContain("ses sessions ouvertes sont fermées aussitôt");
    fireEvent.click(within(fenetre()).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reinitialiser).not.toHaveBeenCalled();
  });

  it("réussite : nouveau mot de passe affiché une fois, fiche de remise imprimable, la fenêtre ne se ferme pas par erreur", async () => {
    reinitialiser.mockResolvedValue({ ok: true, motDePasse: "Q7M-2KD-9XP", nomUtilisateur: "kalundu.caissier", nomComplet: "Pierre Ndoole" });
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Mot de passe de kalundu.caissier" }));
    fireEvent.click(within(fenetre()).getByRole("button", { name: "Réinitialiser le mot de passe" }));
    expect((await screen.findByTestId("nouveau-mot-de-passe")).textContent).toBe("Q7M-2KD-9XP");
    expect(reinitialiser).toHaveBeenCalledWith("u-42");
    expect(screen.getByTestId("fiche-remise").textContent).toContain("Fiche de remise — mot de passe réinitialisé");
    // « Échap » ne fait pas perdre le mot de passe
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(within(fenetre()).getByRole("button", { name: "J'ai noté le mot de passe" }));
    expect(screen.queryByText("Q7M-2KD-9XP")).toBeNull();
  });

  it("refus : message dans la fenêtre, on peut réessayer", async () => {
    reinitialiser.mockResolvedValue({ ok: false, message: "Action réservée à l'administrateur connecté avec son code de vérification." });
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Mot de passe de kalundu.caissier" }));
    fireEvent.click(within(fenetre()).getByRole("button", { name: "Réinitialiser le mot de passe" }));
    expect((await within(fenetre()).findByRole("alert")).textContent).toContain("réservée à l'administrateur");
    expect(within(fenetre()).getByRole("button", { name: "Réinitialiser le mot de passe" })).toBeTruthy();
  });
});

describe("Désactivation", () => {
  it("la fenêtre prévient que l'opération est définitive ; « Échap » annule", () => {
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Désactiver kalundu.caissier" }));
    expect(fenetre().textContent).toContain("Cette opération ne peut pas être annulée");
    expect(fenetre().textContent).toContain("Caissier · Commune de Kalundu");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(desactiver).not.toHaveBeenCalled();
  });

  it("confirmée : la demande part pour CE compte, la fenêtre se ferme", async () => {
    desactiver.mockResolvedValue({ ok: true, nomArchive: "kalundu.caissier.ancien20261014", nomComplet: "Pierre Ndoole" });
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Désactiver kalundu.caissier" }));
    await act(async () => fireEvent.click(within(fenetre()).getByRole("button", { name: "Désactiver le compte" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(desactiver).toHaveBeenCalledWith("u-42");
  });

  it("le curseur entre dans la fenêtre et revient au bouton d'origine à la fermeture", () => {
    afficher();
    const bouton = screen.getByRole("button", { name: "Désactiver kalundu.caissier" });
    bouton.focus();
    fireEvent.click(bouton);
    expect(fenetre().contains(document.activeElement)).toBe(true);
    fireEvent.click(within(fenetre()).getByRole("button", { name: "Annuler" }));
    expect(document.activeElement).toBe(bouton);
  });
});
