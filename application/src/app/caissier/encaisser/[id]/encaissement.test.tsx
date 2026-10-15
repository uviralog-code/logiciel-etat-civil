// Fichier 38 — écran « Encaissement » : monnaie, montant calculé, rendu de monnaie, confirmation, exonération
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatEncaissement, ResultatExoneration } from "@/lib/encaissement";
import { BoutonExonerer } from "./bouton-exonerer";
import { EcranEncaissement } from "./ecran-encaissement";

const encaisser = vi.fn<(id: string, devise: string, montant: number) => Promise<ResultatEncaissement>>();
const exonerer = vi.fn<(id: string, identifiant: string, motif: string, precision: string) => Promise<ResultatExoneration>>();
vi.mock("../../actions", () => ({
  encaisser: (i: string, d: string, m: number) => encaisser(i, d, m),
  exonerer: (i: string, ident: string, m: string, p: string) => exonerer(i, ident, m, p),
  renvoyer: vi.fn(),
}));
const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: rafraichir, push: vi.fn() }) }));
beforeEach(() => {
  encaisser.mockReset();
  exonerer.mockReset();
  rafraichir.mockReset();
});
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const acte = { id: "00000000-0000-0000-0000-0000000000a1", identifiant: "MUL-EXNAIS-2026-000124", titulaire: "Mapendo Grace" };
const ecran = (props: Partial<Parameters<typeof EcranEncaissement>[0]> = {}) =>
  render(<EcranEncaissement acte={acte} du={{ montant: 30, devise: "USD" }} taux={2850} bloque={null} {...props} />);
const valider = () => screen.getByRole("button", { name: "Valider l'encaissement" });

describe("Encaissement d'un acte en dollars", () => {
  it("payé en $ par défaut ; en FC : 85 500 FC, calcul affiché", () => {
    ecran();
    expect(n(screen.getByTestId("montant-du").textContent)).toBe("30 $");
    expect(n(screen.getByTestId("a-percevoir").textContent)).toBe("À percevoir, en espèces30 $Payé dans la monnaie de l'acte, aucune conversion.");
    fireEvent.click(screen.getByRole("radio", { name: "Francs congolais (FC)" }));
    expect(n(screen.getByTestId("a-percevoir").textContent)).toBe("À percevoir, en espèces85 500 FC30 $ × 2 850 FC = 85 500 FC");
  });

  it("rendu de monnaie ; confirmation ; reçu demandé au montant annoncé", async () => {
    encaisser.mockReturnValue(new Promise(() => {})); // l'action ouvre le reçu (redirection)
    ecran({ taux: 2873 });
    fireEvent.click(screen.getByRole("radio", { name: "Francs congolais (FC)" }));
    const remis = screen.getByLabelText(/Montant remis par l'usager/);
    fireEvent.change(remis, { target: { value: "100 000" } });
    expect(n(screen.getByTestId("monnaie").textContent)).toBe("Monnaie à rendre : 13 800 FC");
    fireEvent.click(valider());
    const f = screen.getByRole("dialog", { name: "Confirmer l'encaissement" });
    expect(n(within(f).getByTestId("texte-confirmation").textContent)).toBe("Vous avez reçu 86 200 FC en espèces pour l'acte MUL-EXNAIS-2026-000124 (Mapendo Grace) ?");
    expect(n(within(f).getByText(/Monnaie à rendre/).textContent)).toBe("Monnaie à rendre : 13 800 FC");
    fireEvent.click(within(f).getByRole("button", { name: "Oui, émettre le reçu" }));
    await waitFor(() => expect(encaisser).toHaveBeenCalledWith(acte.id, "CDF", 86200));
  });

  it("« Corriger » ferme la confirmation sans rien envoyer ; montant insuffisant signalé", () => {
    ecran();
    fireEvent.change(screen.getByLabelText(/Montant remis par l'usager/), { target: { value: "20" } });
    expect(screen.getByTestId("monnaie").textContent).toBe("Il manque 10 $.");
    fireEvent.click(valider());
    const f = screen.getByRole("dialog");
    expect(within(f).getByText(/Attention/).textContent).toBe("Attention : il manque 10 $.");
    fireEvent.click(within(f).getByRole("button", { name: "Corriger" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(encaisser).not.toHaveBeenCalled();
  });

  it("taux changé entre-temps : message de la base, écran relu", async () => {
    encaisser.mockResolvedValue({ ok: false, message: "Le montant à percevoir a changé (nouveau taux du jour) : 86 200 FC au lieu de 85 500 FC." });
    ecran();
    fireEvent.click(screen.getByRole("radio", { name: "Francs congolais (FC)" }));
    fireEvent.click(valider());
    fireEvent.click(screen.getByRole("button", { name: "Oui, émettre le reçu" }));
    expect(n((await screen.findByTestId("erreur-encaissement")).textContent)).toContain("Le montant à percevoir a changé");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rafraichir).toHaveBeenCalled();
  });

  it("sans aucun taux : rien ne s'encaisse, lien vers le taux du jour", () => {
    ecran({ taux: null });
    expect(n(screen.getByRole("alert").textContent)).toContain("enregistrez le taux du jour");
    expect(screen.getByRole("link", { name: "Saisir le taux du jour" }).getAttribute("href")).toBe("/caissier/taux");
    expect((valider() as HTMLButtonElement).disabled).toBe(true);
  });

  it("journée clôturée : bouton désactivé, raison affichée, pas d'aide au rendu", () => {
    ecran({ bloque: "La caisse du 14/10/2026 est clôturée (à 17 h 05) : l'usager paiera demain." });
    expect((valider() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("est clôturée");
    expect(screen.queryByLabelText(/Montant remis/)).toBeNull();
  });
});

it("acte en francs : pas de choix de monnaie, paiement en FC", () => {
  ecran({ du: { montant: 18000, devise: "CDF" }, taux: null });
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByText(/Paiement en francs congolais/)).toBeTruthy();
  expect(n(screen.getByTestId("a-percevoir").textContent)).toContain("18 000 FC");
  expect((valider() as HTMLButtonElement).disabled).toBe(false);
});

describe("Exonérer", () => {
  const ouvrir = () => {
    render(<BoutonExonerer acte={acte} montantNonPercu="30 $" desactive={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Exonérer (motif obligatoire)…" }));
    return screen.getByRole("dialog", { name: "Exonérer l'acte" });
  };
  it("montant non perçu annoncé ; motif + précision envoyés", async () => {
    exonerer.mockReturnValue(new Promise(() => {}));
    const f = ouvrir();
    expect(n(within(f).getByText(/sera délivré gratuitement/).textContent)).toContain("30 $ ne seront pas perçus");
    fireEvent.click(within(f).getByRole("radio", { name: "Indigent (attestation d'indigence)" }));
    const champ = within(f).getByLabelText("Précision (obligatoire)") as HTMLTextAreaElement;
    expect(champ.placeholder).toContain("attestation n°");
    fireEvent.change(champ, { target: { value: "attestation n° 045/2026" } });
    fireEvent.click(within(f).getByRole("button", { name: "Exonérer l'acte" }));
    await waitFor(() => expect(exonerer).toHaveBeenCalledWith(acte.id, acte.identifiant, "Indigent (attestation d'indigence)", "attestation n° 045/2026"));
  });
  it("précision manquante : refus affiché dans la fenêtre, effacé dès la frappe", async () => {
    exonerer.mockResolvedValue({ ok: false, message: "Précisez l'exonération…", champ: "precision" });
    const f = ouvrir();
    fireEvent.click(within(f).getByRole("radio", { name: "Autre motif" }));
    fireEvent.click(within(f).getByRole("button", { name: "Exonérer l'acte" }));
    expect((await within(f).findByRole("alert")).textContent).toBe("Précisez l'exonération…");
    fireEvent.change(within(f).getByLabelText("Précision (obligatoire)"), { target: { value: "x" } });
    expect(within(f).queryByRole("alert")).toBeNull();
  });
  it("journée clôturée : bouton désactivé", () => {
    render(<BoutonExonerer acte={acte} montantNonPercu="30 $" desactive />);
    expect((screen.getByRole("button", { name: /Exonérer/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
