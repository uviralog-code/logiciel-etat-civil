// Fichier 25 — écran « Tarifs de l'entité » : tableau, ajustement, retour à la grille, annulation
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableauTarifsEntite } from "@/components/tableau-tarifs-entite";
import { ajustementsProgrammes, lignesTarifsEntite, type ResultatAjustement, type SaisieAjustement } from "@/lib/tarifs-entite";
import type { DonneesTarifaires, LigneTarifCommun, LigneTarifEntite, TypeActe } from "@/lib/tarifs";
import { AjustementsProgrammes } from "./ajustements-programmes";
import { FormulaireAjustement } from "./formulaire-ajustement";

const programmer = vi.fn<(s: SaisieAjustement) => Promise<ResultatAjustement>>();
const annuler = vi.fn<(id: string) => Promise<{ ok: true } | { ok: false; message: string }>>();
vi.mock("./actions", () => ({
  programmer: (s: SaisieAjustement) => programmer(s),
  annuler: (id: string) => annuler(id),
}));
beforeEach(() => {
  programmer.mockReset();
  annuler.mockReset();
});
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const MUL = { id: "mul", code: "MUL", nom: "Commune de Mulongwe" };
const acte = (id: string, numero: number, code: string, libelle: string, etranger = false): TypeActe => ({
  id, numero, code, libelle, famille: "attestation", tarif_distinct_etranger: etranger, couleur: null, actif: true,
});
const ATRES = acte("atres", 5, "ATRES", "Attestation de résidence", true);
const VEUV = acte("veuv", 16, "ATVEUV", "Attestation de veuvage");
const EXNAIS = acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance");
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});
const local = (type: string, depuis: string, montant: number): LigneTarifEntite => ({
  id: `e${++k}`, entite_id: "mul", type_acte_id: type, categorie: "national", suit_grille_commune: false, montant, devise: "CDF",
  en_vigueur_depuis: depuis, motif: "Décision du Bourgmestre n° 12",
});
const DONNEES: DonneesTarifaires = {
  actes: [EXNAIS, ATRES, VEUV],
  communs: [
    commun("atres", 18000, "CDF", "2026-01-01"),
    commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
    commun("veuv", 5000, "CDF", "2026-01-01"),
    commun("exnais", 30, "USD", "2026-01-01"),
  ],
  ajustements: [local("atres", "2026-11-12", 20000), local("veuv", "2026-09-01", 4000)],
};

describe("Tableau (comme la maquette)", () => {
  it("prix de la grille commune et prix appliqué ; ajusté en bleu, à venir en jaune", () => {
    render(<TableauTarifsEntite lignes={lignesTarifsEntite(DONNEES, "mul", AUJOURDHUI)} nomEntite="Commune de Mulongwe" />);
    expect(screen.getByRole("columnheader", { name: "Tarif appliqué à Mulongwe" })).toBeTruthy();
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes.map((l) => within(l).getAllByRole("cell").map((c) => n(c.textContent)))).toEqual([
      ["05", "Attestation de résidence (national)", "18 000 FC", "18 000 FC20 000 FC à partir du 12/11/2026"],
      ["05", "Attestation de résidence (étranger)", "39 000 FC", "39 000 FC"],
      ["16", "Attestation de veuvage", "5 000 FC", "4 000 FCAjusté depuis le 01/09/2026"],
      ["22", "Extrait d'acte de naissance", "30 $", "30 $"],
    ]);
    expect(lignes.map((l) => l.className ?? "")).toEqual(["bg-[#fff8e6]", "", "bg-[#eef3fb]", ""]);
  });
});

describe("Ajuster un tarif", () => {
  const remplir = (v: { acte?: string; categorie?: string; montant?: string; date?: string; motif?: string }) => {
    if (v.acte) fireEvent.change(screen.getByLabelText("Acte"), { target: { value: v.acte } });
    if (v.categorie) fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: v.categorie } });
    if (v.montant !== undefined) fireEvent.change(screen.getByLabelText("Nouveau montant"), { target: { value: v.montant } });
    if (v.date !== undefined) fireEvent.change(screen.getByLabelText("À partir du"), { target: { value: v.date } });
    if (v.motif !== undefined) fireEvent.change(screen.getByLabelText("Motif (décision de l'autorité)"), { target: { value: v.motif } });
  };
  const afficher = () => render(<FormulaireAjustement donnees={DONNEES} entite={MUL} aujourdhui={AUJOURDHUI} />);

  it("prix appliqué aujourd'hui, catégorie seulement pour les actes à deux tarifs", () => {
    afficher();
    expect(n(screen.getByTestId("prix-applique").textContent)).toBe("Prix appliqué aujourd'hui à Mulongwe : 18 000 FC (grille commune)");
    remplir({ categorie: "etranger" });
    expect(n(screen.getByTestId("prix-applique").textContent)).toContain("39 000 FC (grille commune)");
    remplir({ acte: "veuv" });
    expect(screen.queryByLabelText("Catégorie")).toBeNull();
    expect(n(screen.getByTestId("prix-applique").textContent)).toContain(": 4 000 FC");
    expect((screen.getByLabelText("À partir du") as HTMLInputElement).min).toBe("2026-10-15");
  });

  it("ajustement : aperçu « avant → après », puis envoi au serveur", async () => {
    programmer.mockResolvedValue({ ok: true, texte: "ATVEUV : 4 500 FC à partir du 01/12/2026, pour Mulongwe." });
    afficher();
    remplir({ acte: "veuv", montant: "4 500", date: "2026-12-01", motif: "Décision n° 14" });
    fireEvent.click(screen.getByRole("button", { name: "Programmer l'ajustement" }));
    const fenetre = screen.getByRole("dialog", { name: "Confirmer l'ajustement" });
    expect(n(within(fenetre).getByTestId("apercu-ajustement").textContent)).toContain("4 000 FC→4 500 FCà Mulongwe, à partir du 01/12/2026");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(programmer).toHaveBeenCalled());
    expect(programmer.mock.calls[0][0]).toEqual({ mode: "prix", acteId: "veuv", categorie: "national", montant: "4 500", devise: "CDF", date: "2026-12-01", motif: "Décision n° 14" });
    expect((await screen.findByRole("status")).textContent).toContain("ATVEUV : 4 500 FC à partir du 01/12/2026, pour Mulongwe.");
  });

  it("retour à la grille commune : sans montant, « 4 000 FC → 5 000 FC (grille commune) »", async () => {
    programmer.mockResolvedValue({ ok: true, texte: "ok" });
    afficher();
    remplir({ acte: "veuv", date: "2026-12-01", motif: "Décision n° 15" });
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la grille commune" }));
    const fenetre = screen.getByRole("dialog", { name: "Confirmer le retour à la grille commune" });
    expect(n(fenetre.textContent)).toContain("4 000 FC→5 000 FC (grille commune)");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(programmer.mock.calls[0]?.[0]).toMatchObject({ mode: "grille", acteId: "veuv", montant: "" }));
  });

  it("refus clairs : déjà sur la grille, même date qu'un ajustement programmé, date d'aujourd'hui", () => {
    afficher();
    remplir({ acte: "exnais", date: "2026-12-01", motif: "Décision" });
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la grille commune" }));
    expect(screen.getByRole("alert").textContent).toContain("suit déjà la grille commune");
    remplir({ acte: "atres", montant: "21 000", date: "2026-11-12" });
    fireEvent.click(screen.getByRole("button", { name: "Programmer l'ajustement" }));
    expect(screen.getByRole("alert").textContent).toContain("déjà programmé pour ce tarif à cette date");
    remplir({ date: AUJOURDHUI });
    fireEvent.click(screen.getByRole("button", { name: "Programmer l'ajustement" }));
    expect(screen.getByRole("alert").textContent).toContain("au plus tôt demain");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(programmer).not.toHaveBeenCalled();
  });
});

describe("Ajustements programmés", () => {
  it("liste, confirmation d'annulation, envoi au serveur", async () => {
    annuler.mockResolvedValue({ ok: true });
    render(<AjustementsProgrammes ajustements={ajustementsProgrammes(DONNEES, "mul", AUJOURDHUI)} />);
    const ligne = screen.getAllByRole("row")[1];
    expect(within(ligne).getAllByRole("cell").slice(0, 4).map((c) => n(c.textContent))).toEqual([
      "12/11/2026", "05 · Attestation de résidence (national)", "18 000 FC (grille commune) → 20 000 FC", "Décision du Bourgmestre n° 12",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Annuler l'ajustement ATRES du 12/11/2026" }));
    expect(n(screen.getByRole("dialog").textContent)).toContain("Le prix de 18 000 FC (grille commune) restera appliqué.");
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler cet ajustement" }));
    expect((await screen.findByRole("status")).textContent).toBe("Ajustement annulé : ATRES, prévu le 12/11/2026.");
    expect(annuler).toHaveBeenCalledWith(DONNEES.ajustements[0].id);
  });

  it("aucun : phrase courte", () => {
    render(<AjustementsProgrammes ajustements={[]} />);
    expect(screen.getByText("Aucun ajustement programmé.")).toBeTruthy();
  });
});
