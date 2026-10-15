// Fichier 18 — comportement de l'écran « Code de vérification »
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaisieCode } from "@/components/saisie-code";
import type { ResultatMiseEnPlace, ResultatVerification } from "@/lib/verification";
import { FormulaireVerification } from "./formulaire-verification";

const remplacer = vi.fn();
const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: remplacer, refresh: rafraichir }) }));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({ client: "supabase" }) }));
const verifierCode = vi.fn<(...a: unknown[]) => Promise<ResultatVerification>>();
const commencerMiseEnPlace = vi.fn<(...a: unknown[]) => Promise<ResultatMiseEnPlace>>();
vi.mock("@/lib/verification", async (original) => ({
  ...(await original<typeof import("@/lib/verification")>()),
  verifierCode: (...a: unknown[]) => verifierCode(...a),
  commencerMiseEnPlace: (...a: unknown[]) => commencerMiseEnPlace(...a),
}));

beforeEach(() => {
  remplacer.mockReset();
  verifierCode.mockReset();
  commencerMiseEnPlace.mockReset();
});
afterEach(cleanup);

const cases = () => screen.getAllByLabelText(/^Chiffre \d$/) as HTMLInputElement[];
const valeur = () => (document.querySelector('input[name="code"]') as HTMLInputElement).value;

describe("Saisie du code, une case par chiffre", () => {
  const afficher = () => render(<form><SaisieCode name="code" /></form>);

  it("6 cases ; le curseur avance tout seul ; la valeur complète est envoyée", () => {
    afficher();
    expect(cases()).toHaveLength(6);
    "482913".split("").forEach((c, i) => {
      fireEvent.change(cases()[i], { target: { value: c } });
      if (i < 5) expect(document.activeElement).toBe(cases()[i + 1]);
    });
    expect(valeur()).toBe("482913");
  });

  it("un code collé (ou proposé par le téléphone) remplit toutes les cases", () => {
    afficher();
    fireEvent.change(cases()[0], { target: { value: "482 913" } });
    expect(cases().map((c) => c.value)).toEqual(["4", "8", "2", "9", "1", "3"]);
    expect(valeur()).toBe("482913");
  });

  it("les lettres sont ignorées", () => {
    afficher();
    fireEvent.change(cases()[0], { target: { value: "a" } });
    expect(cases()[0].value).toBe("");
  });

  it("« Retour arrière » sur une case vide efface la précédente et y revient", () => {
    afficher();
    fireEvent.change(cases()[0], { target: { value: "4" } });
    fireEvent.change(cases()[1], { target: { value: "8" } });
    fireEvent.keyDown(cases()[2], { key: "Backspace" });
    expect(cases()[1].value).toBe("");
    expect(document.activeElement).toBe(cases()[1]);
  });

  it("la première case accepte le code proposé automatiquement par le téléphone", () => {
    afficher();
    expect(cases()[0].autocomplete).toBe("one-time-code");
    expect(cases()[0].inputMode).toBe("numeric");
  });
});

describe("Écran de vérification (connexions suivantes)", () => {
  const afficher = () =>
    render(<FormulaireVerification mode="verification" nomUtilisateur="cdjp.admin" administrateur destination="/admin" />);

  it("reprend la maquette", () => {
    afficher();
    expect(screen.getByText("Administrateur seulement")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Code de vérification" })).toBeTruthy();
    expect(screen.getByText(/tapez le code à 6 chiffres affiché pour « État civil Uvira »/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Code à 6 chiffres" })).toBeTruthy();
    expect(screen.getByText(/Téléphone perdu \? Contactez le service technique de la CDJP/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeTruthy();
  });

  it("bon code : direction l'espace de l'administrateur", async () => {
    verifierCode.mockResolvedValue({ ok: true });
    afficher();
    fireEvent.change(cases()[0], { target: { value: "482913" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/admin"));
    expect(verifierCode.mock.calls[0][1]).toEqual({ code: "482913", idFacteur: undefined });
    expect(verifierCode.mock.calls[0][2]).toMatchObject({ nomUtilisateur: "cdjp.admin" });
  });

  it("code refusé : message, cases vidées, curseur dans la première case", async () => {
    verifierCode.mockResolvedValue({ ok: false, message: "Code incorrect. Tapez le code affiché en ce moment sur le téléphone." });
    afficher();
    fireEvent.change(cases()[0], { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Code incorrect");
    await waitFor(() => expect(cases().every((c) => c.value === "")).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(cases()[0]));
    expect(cases()[0].getAttribute("aria-invalid")).toBe("true");
  });

  it("aucun téléphone relié : bouton pour recharger la page", async () => {
    verifierCode.mockResolvedValue({ ok: false, message: "Aucun téléphone…", recommencer: true });
    afficher();
    fireEvent.change(cases()[0], { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recharger la page" }));
    expect(rafraichir).toHaveBeenCalled();
  });
});

describe("Mise en place du téléphone (première fois)", () => {
  const afficher = () =>
    render(<FormulaireVerification mode="mise-en-place" nomUtilisateur="cdjp.admin" administrateur destination="/admin" />);

  it("explique les étapes avant de commencer, sans demander de code", () => {
    afficher();
    expect(screen.getByRole("heading", { level: 1, name: "Reliez votre téléphone" })).toBeTruthy();
    expect(screen.getByText(/Google Authenticator/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Code à 6 chiffres" })).toBeNull();
  });

  it("« Commencer » : QR code, clé de secours, puis « Activer et continuer » avec le nouveau téléphone", async () => {
    commencerMiseEnPlace.mockResolvedValue({
      ok: true,
      miseEnPlace: { idFacteur: "nouveau-f", qrCode: "data:image/svg+xml;utf-8,<svg/>", cle: "5MC4BF6N36U7LA5YREEJH7WCGU43FO4D" },
    });
    verifierCode.mockResolvedValue({ ok: true });
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Commencer" }));
    const qr = (await screen.findByAltText("QR code à scanner avec l'application d'authentification")) as HTMLImageElement;
    expect(qr.src).toContain("data:image/svg+xml");
    expect(screen.getByTestId("cle-secrete").textContent).toBe("5MC4 BF6N 36U7 LA5Y REEJ H7WC GU43 FO4D");
    fireEvent.change(cases()[0], { target: { value: "482913" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer et continuer" }));
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/admin"));
    expect(verifierCode.mock.calls[0][1]).toEqual({ code: "482913", idFacteur: "nouveau-f" });
  });

  it("échec de la préparation : message, on peut réessayer", async () => {
    commencerMiseEnPlace.mockResolvedValue({ ok: false, message: "Le serveur est injoignable." });
    afficher();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Commencer" })));
    expect((await screen.findByRole("alert")).textContent).toContain("injoignable");
    expect(screen.getByRole("button", { name: "Commencer" })).toBeTruthy();
  });
});
