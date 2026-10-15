// Fichier 17 — comportement de l'écran « Choisissez votre mot de passe »
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatChangement } from "@/lib/mot-de-passe";
import { FormulaireMotDePasse } from "./formulaire-mot-de-passe";

const remplacer = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: remplacer }) }));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({ client: "supabase" }) }));
const changerMotDePasse = vi.fn<(...args: unknown[]) => Promise<ResultatChangement>>();
vi.mock("@/lib/mot-de-passe", async (original) => ({
  ...(await original<typeof import("@/lib/mot-de-passe")>()),
  changerMotDePasse: (...args: unknown[]) => changerMotDePasse(...args),
}));

beforeEach(() => {
  remplacer.mockReset();
  changerMotDePasse.mockReset();
});
afterEach(cleanup);

const afficher = () => render(<FormulaireMotDePasse nomUtilisateur="kalundu.officier" destination="/officier" />);
const nouveau = () => screen.getByLabelText("Nouveau mot de passe") as HTMLInputElement;
const confirmation = () => screen.getByLabelText("Confirmez le mot de passe") as HTMLInputElement;
const regle = (id: string) => document.querySelector(`[data-regle="${id}"]`)!;
function taper(n: string, c: string) {
  fireEvent.change(nouveau(), { target: { value: n } });
  fireEvent.change(confirmation(), { target: { value: c } });
}
const envoyer = () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));

describe("Affichage", () => {
  it("reprend la maquette et rappelle le compte concerné", () => {
    afficher();
    expect(screen.getByText("Première connexion")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Choisissez votre mot de passe" })).toBeTruthy();
    expect(screen.getByText(/Le mot de passe provisoire donné par l'administrateur doit être remplacé/)).toBeTruthy();
    expect(screen.getByText("kalundu.officier")).toBeTruthy();
    expect(nouveau().autocomplete).toBe("new-password");
    expect(confirmation().type).toBe("password");
  });

  it("chaque champ a son propre bouton « Afficher »", () => {
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Afficher la confirmation" }));
    expect(confirmation().type).toBe("text");
    expect(nouveau().type).toBe("password");
  });
});

describe("Règles cochées pendant la saisie", () => {
  it("au départ, aucune règle n'est cochée", () => {
    afficher();
    expect(regle("longueur").getAttribute("data-respectee")).toBe("false");
    expect(regle("identiques").getAttribute("data-respectee")).toBe("false");
    expect(regle("longueur").textContent).toContain("pas encore respectée");
  });
  it("10 caractères : la longueur se coche ; confirmation identique : la seconde aussi", () => {
    afficher();
    taper("Kalundu-20", "");
    expect(regle("longueur").getAttribute("data-respectee")).toBe("true");
    expect(regle("identiques").getAttribute("data-respectee")).toBe("false");
    taper("Kalundu-20", "Kalundu-20");
    expect(regle("identiques").getAttribute("data-respectee")).toBe("true");
    expect(regle("identiques").textContent).toContain(": respectée");
  });
});

describe("Enregistrement", () => {
  it("réussi : direction la page suivante", async () => {
    changerMotDePasse.mockResolvedValue({ ok: true });
    afficher();
    taper("Kalundu-Uvira-2026", "Kalundu-Uvira-2026");
    envoyer();
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/officier"));
    expect(changerMotDePasse.mock.calls[0][1]).toEqual({ nouveau: "Kalundu-Uvira-2026", confirmation: "Kalundu-Uvira-2026" });
  });

  it("pendant l'enregistrement : bouton « Enregistrement… » désactivé", async () => {
    let terminer!: (r: ResultatChangement) => void;
    changerMotDePasse.mockReturnValue(new Promise((r) => (terminer = r)));
    afficher();
    taper("Kalundu-Uvira-2026", "Kalundu-Uvira-2026");
    envoyer();
    expect(((await screen.findByRole("button", { name: "Enregistrement…" })) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => terminer({ ok: true }));
  });

  it("refusé : message, champs vidés, règles décochées, curseur dans « Nouveau mot de passe »", async () => {
    changerMotDePasse.mockResolvedValue({
      ok: false, message: "Le nouveau mot de passe doit être différent du mot de passe provisoire.", champ: "nouveau",
    });
    afficher();
    taper("Provisoire-7K4PX9", "Provisoire-7K4PX9");
    envoyer();
    expect((await screen.findByRole("alert")).textContent).toContain("différent du mot de passe provisoire");
    await waitFor(() => expect(nouveau().value).toBe(""));
    expect(regle("identiques").getAttribute("data-respectee")).toBe("false");
    expect(nouveau().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(nouveau()));
    expect(remplacer).not.toHaveBeenCalled();
  });

  it("session expirée : plus de champs, un bouton « Retour à la connexion »", async () => {
    changerMotDePasse.mockResolvedValue({ ok: false, message: "Votre session a expiré.", reconnexion: true });
    afficher();
    taper("Kalundu-Uvira-2026", "Kalundu-Uvira-2026");
    envoyer();
    const lien = await screen.findByRole("link", { name: "Retour à la connexion" });
    expect(lien.getAttribute("href")).toBe("/connexion");
    expect(screen.queryByLabelText("Nouveau mot de passe")).toBeNull();
  });

  it("mot de passe changé mais fin interrompue : un bouton « Terminer » refait seulement la fin", async () => {
    changerMotDePasse
      .mockResolvedValueOnce({ ok: false, message: "Votre nouveau mot de passe est bien enregistré…", motDePasseEnregistre: true })
      .mockResolvedValueOnce({ ok: true });
    afficher();
    taper("Kalundu-Uvira-2026", "Kalundu-Uvira-2026");
    envoyer();
    const terminer = await screen.findByRole("button", { name: "Terminer l'enregistrement" });
    expect(screen.queryByLabelText("Nouveau mot de passe")).toBeNull();
    fireEvent.click(terminer);
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/officier"));
    expect(changerMotDePasse.mock.calls[1][2]).toEqual({ motDePasseDejaEnregistre: true });
  });
});
