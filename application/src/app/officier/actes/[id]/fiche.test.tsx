// Fichier 31 — boutons de la fiche d'un acte : correction d'un nom, délivré, annulation
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatActe, SaisieNoms } from "@/lib/actes";
import type { ActionsPossibles } from "@/lib/fiche-acte";
import { ActionsFiche } from "./actions-fiche";

const corrigerNom = vi.fn<(id: string, s: SaisieNoms, deux: boolean) => Promise<ResultatActe>>();
const delivrer = vi.fn<(id: string) => Promise<ResultatActe>>();
const annuler = vi.fn<(id: string, motif: string) => Promise<ResultatActe>>();
vi.mock("../actions", () => ({
  corrigerNom: (id: string, s: SaisieNoms, d: boolean) => corrigerNom(id, s, d),
  delivrer: (id: string) => delivrer(id),
  annuler: (id: string, m: string) => annuler(id, m),
}));
beforeEach(() => {
  corrigerNom.mockReset();
  delivrer.mockReset();
  annuler.mockReset();
});
afterEach(cleanup);

const ACTE = {
  id: "a1", identifiant: "MUL-ATCEL-2026-000017", titulaire: "Furaha Neema", titulaire2: null, demandeur: "Mugisho Pierre", deuxEpoux: false, libelleTitulaire: "Titulaire",
};
const AUCUN: ActionsPossibles = {
  corrigerFiche: false, transmettre: false, corrigerNom: false, delivrer: false, annuler: false, annulationParLaCaisse: false, scanner: false, refaireScan: false,
};
const OK: ResultatActe = { ok: true, acte: { id: "a1", identifiant: "MUL-ATCEL-2026-000017", statut: "paye", montant_du: 9000, devise_du: "CDF" } };

describe("Selon le statut, seuls les gestes permis apparaissent", () => {
  it("acte « enregistré » : corriger la fiche (lien) et annuler", () => {
    render(<ActionsFiche acte={ACTE} possibles={{ ...AUCUN, corrigerFiche: true, annuler: true }} />);
    expect(screen.getByRole("link", { name: "Corriger la fiche" }).getAttribute("href")).toBe("/officier/actes/a1/corriger");
    expect(screen.getByRole("button", { name: "Annuler l'acte…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /orthographe/ })).toBeNull();
  });

  it("acte payé : corriger un nom, délivré ; l'annulation passe par la caisse (explication)", () => {
    render(<ActionsFiche acte={ACTE} possibles={{ ...AUCUN, corrigerNom: true, delivrer: true, annulationParLaCaisse: true }} />);
    expect(screen.getByRole("button", { name: "Corriger l'orthographe d'un nom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marquer comme délivré" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annuler l'acte…" })).toBeNull();
    expect(screen.getByText(/le Caissier annule son reçu/)).toBeTruthy();
  });
});

describe("Corriger l'orthographe d'un nom", () => {
  it("noms pré-remplis ; la correction part avec son motif ; un refus reste dans la fenêtre", async () => {
    corrigerNom.mockResolvedValueOnce({ ok: false, message: "Indiquez le motif de la correction (3 caractères au moins) : il est inscrit au journal d'audit.", champ: "motif" });
    corrigerNom.mockResolvedValueOnce(OK);
    render(<ActionsFiche acte={ACTE} possibles={{ ...AUCUN, corrigerNom: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Corriger l'orthographe d'un nom" }));
    const fenetre = screen.getByRole("dialog", { name: "Corriger l'orthographe d'un nom" });
    expect((within(fenetre).getByLabelText("Titulaire") as HTMLInputElement).value).toBe("Furaha Neema");
    expect(within(fenetre).queryByLabelText("Épouse")).toBeNull();
    fireEvent.change(within(fenetre).getByLabelText("Titulaire"), { target: { value: "NEEMA Furaha" } });
    fireEvent.click(within(fenetre).getByRole("button", { name: "Enregistrer la correction" }));
    expect((await within(fenetre).findByRole("alert")).textContent).toContain("motif");
    expect(within(fenetre).getByLabelText("Motif de la correction").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(within(fenetre).getByLabelText("Motif de la correction"), { target: { value: "Carte d'électeur présentée" } });
    fireEvent.click(within(fenetre).getByRole("button", { name: "Enregistrer la correction" }));
    await waitFor(() => expect(corrigerNom).toHaveBeenCalledTimes(2));
    expect(corrigerNom.mock.calls[1]).toEqual(["a1", { titulaire: "NEEMA Furaha", titulaire2: "", demandeur: "Mugisho Pierre", motif: "Carte d'électeur présentée" }, false]);
    expect((await screen.findByRole("status")).textContent).toBe("Correction enregistrée et inscrite au journal.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mariage : le nom de l'épouse aussi", () => {
    render(<ActionsFiche acte={{ ...ACTE, titulaire2: "Mapendo Grace", deuxEpoux: true, libelleTitulaire: "Époux" }} possibles={{ ...AUCUN, corrigerNom: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Corriger l'orthographe d'un nom" }));
    expect((screen.getByLabelText("Épouse") as HTMLInputElement).value).toBe("Mapendo Grace");
    expect(screen.getByLabelText("Époux")).toBeTruthy();
  });
});

describe("Délivré et annulation", () => {
  it("« Marquer comme délivré » demande confirmation", async () => {
    delivrer.mockResolvedValue(OK);
    render(<ActionsFiche acte={ACTE} possibles={{ ...AUCUN, delivrer: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Marquer comme délivré" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, il est délivré" }));
    await waitFor(() => expect(delivrer).toHaveBeenCalledWith("a1"));
    expect((await screen.findByRole("status")).textContent).toBe("Acte marqué « délivré ».");
  });

  it("annulation : définitive, motif envoyé ; « Garder l'acte » ne fait rien", async () => {
    annuler.mockResolvedValue(OK);
    render(<ActionsFiche acte={ACTE} possibles={{ ...AUCUN, annuler: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Annuler l'acte…" }));
    expect(screen.getByRole("dialog").textContent).toContain("définitive");
    fireEvent.click(screen.getByRole("button", { name: "Garder l'acte" }));
    expect(annuler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Annuler l'acte…" }));
    fireEvent.change(screen.getByLabelText("Motif de l'annulation"), { target: { value: "Demande abandonnée" } });
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler définitivement" }));
    await waitFor(() => expect(annuler).toHaveBeenCalledWith("a1", "Demande abandonnée"));
  });
});
