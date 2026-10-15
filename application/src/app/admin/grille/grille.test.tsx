// Fichier 24 — écran « Grille commune » : tableau, formulaire, confirmation, annulation
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangementProgramme, ResultatAnnulation, ResultatProgrammation, SaisieTarif } from "@/lib/grille-commune";
import type { DonneesTarifaires, LigneTarifCommun, LigneTarifEntite, TypeActe } from "@/lib/tarifs";
import { ChangementsProgrammes } from "./changements-programmes";
import { FormulaireTarif } from "./formulaire-tarif";
import { TableauGrille } from "./tableau-grille";

const programmer = vi.fn<(s: SaisieTarif) => Promise<ResultatProgrammation>>();
const annuler = vi.fn<(id: string) => Promise<ResultatAnnulation>>();
vi.mock("./actions", () => ({
  programmer: (s: SaisieTarif) => programmer(s),
  annuler: (id: string) => annuler(id),
}));
beforeEach(() => {
  programmer.mockReset();
  annuler.mockReset();
});
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, libelle: string, etranger = false): TypeActe => ({
  id, numero, code, libelle, famille: "attestation", tarif_distinct_etranger: etranger, couleur: "#1565C0", actif: true,
});
const ATRES = acte("atres", 5, "ATRES", "Attestation de résidence", true);
const VEUV = acte("veuv", 16, "ATVEUV", "Attestation de veuvage");
const EXNAIS = acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance");
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: "Arrêté 2026",
});
const local = (entite: string, type: string, depuis: string, montant: number, devise: "USD" | "CDF"): LigneTarifEntite => ({
  id: `e${++k}`, entite_id: entite, type_acte_id: type, categorie: "national", suit_grille_commune: false, montant, devise,
  en_vigueur_depuis: depuis, motif: null,
});
const ENTITES = [
  { id: "mul", code: "MUL", nom: "Commune de Mulongwe" },
  { id: "kav", code: "KAV", nom: "Commune de Kavimvira" },
  { id: "kal", code: "KAL", nom: "Commune de Kalundu" },
  { id: "bav", code: "BAV", nom: "Chefferie des Bavira" },
];
const DONNEES: DonneesTarifaires = {
  actes: [EXNAIS, ATRES, VEUV],
  communs: [
    commun("atres", 18000, "CDF", "2026-01-01"),
    commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
    commun("veuv", 5000, "CDF", "2026-01-01"),
    commun("exnais", 30, "USD", "2026-01-01"),
    commun("exnais", 35, "USD", "2027-01-01"),
  ],
  ajustements: [local("mul", "atres", "2026-11-12", 20000, "CDF"), local("mul", "veuv", "2026-09-01", 4000, "CDF")],
};

describe("Tableau de la grille", () => {
  it("comme la maquette : prix National / Étranger, écarts des entités en jaune, changement programmé annoncé", () => {
    render(<TableauGrille donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes.map((l) => l.getAttribute("data-acte"))).toEqual(["ATRES", "ATVEUV", "EXNAIS"]);
    const cellules = (code: string) => within(lignes.find((l) => l.getAttribute("data-acte") === code)!).getAllByRole("cell").map((c) => n(c.textContent));
    expect(cellules("ATRES")).toEqual(["05", "ATRES", "Attestation de résidence", "18 000 FC", "39 000 FC", "MUL : 20 000 FC dès le 12/11"]);
    expect(cellules("ATVEUV")).toEqual(["16", "ATVEUV", "Attestation de veuvage", "5 000 FC", "—", "MUL : 4 000 FC depuis le 01/09"]);
    expect(cellules("EXNAIS")).toEqual(["22", "EXNAIS", "Extrait d'acte de naissance", "30 $→ 35 $ dès le 01/01/2027", "—", ""]);
    expect(lignes[0].className).toContain("bg-[#fff8e6]");
    expect(lignes[2].className).not.toContain("bg-[#fff8e6]");
  });
});

describe("Programmer un nouveau tarif commun", () => {
  const remplir = (v: { acte?: string; montant?: string; devise?: string; date?: string; motif?: string }) => {
    if (v.acte) fireEvent.change(screen.getByLabelText("Acte"), { target: { value: v.acte } });
    if (v.montant !== undefined) fireEvent.change(screen.getByLabelText("Nouveau montant"), { target: { value: v.montant } });
    if (v.devise) fireEvent.change(screen.getByLabelText("Monnaie"), { target: { value: v.devise } });
    if (v.date !== undefined) fireEvent.change(screen.getByLabelText("En vigueur à partir du"), { target: { value: v.date } });
    if (v.motif !== undefined) fireEvent.change(screen.getByLabelText("Texte de référence"), { target: { value: v.motif } });
  };
  const envoyer = () => fireEvent.click(screen.getByRole("button", { name: "Programmer pour les 4 entités" }));

  it("actes dans l'ordre des numéros ; prix actuel et monnaie suivent l'acte choisi ; date au plus tôt demain", () => {
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    const options = [...(screen.getByLabelText("Acte") as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options).toEqual(["05 · Attestation de résidence", "16 · Attestation de veuvage", "22 · Extrait d'acte de naissance"]);
    expect(n(screen.getByTestId("prix-actuel").textContent)).toBe("Prix actuel (National) : 18 000 FC");
    expect((screen.getByLabelText("Monnaie") as HTMLSelectElement).value).toBe("CDF");
    fireEvent.click(screen.getByLabelText("Étranger"));
    expect(n(screen.getByTestId("prix-actuel").textContent)).toBe("Prix actuel (Étranger) : 39 000 FC");
    remplir({ acte: "exnais" });
    expect(screen.queryByText("Catégorie")).toBeNull(); // un seul tarif pour cet acte
    expect(n(screen.getByTestId("prix-actuel").textContent)).toBe("Prix actuel : 30 $");
    expect((screen.getByLabelText("Monnaie") as HTMLSelectElement).value).toBe("USD");
    const date = screen.getByLabelText("En vigueur à partir du") as HTMLInputElement;
    expect([date.min, date.max]).toEqual(["2026-10-15", "2028-10-14"]);
    expect(screen.getByText(/Au plus tôt demain, le 15\/10\/2026/)).toBeTruthy();
  });

  it("saisie incomplète : message clair, champ signalé, rien n'est envoyé", () => {
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ montant: "20 000", date: "2026-10-14", motif: "Arrêté" });
    envoyer();
    expect(screen.getByRole("alert").textContent).toContain("au plus tôt demain (le 15/10/2026)");
    expect(screen.getByLabelText("En vigueur à partir du").getAttribute("aria-invalid")).toBe("true");
    remplir({ montant: "1500,5", date: "2026-12-01" });
    envoyer();
    expect(screen.getByRole("alert").textContent).toBe("Les francs congolais s'écrivent sans centimes.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(programmer).not.toHaveBeenCalled();
  });

  it("même date qu'un changement déjà programmé : refus avant même la confirmation", () => {
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ acte: "exnais", montant: "40", date: "2027-01-01", motif: "Arrêté" });
    envoyer();
    expect(screen.getByRole("alert").textContent).toContain("déjà programmé pour cet acte à cette date");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aperçu : ancien → nouveau prix, date, entités qui gardent leur prix ; « Modifier » ne change rien", () => {
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ acte: "veuv", montant: "6 000", date: "2027-02-01", motif: "Arrêté n° 7/2027" });
    envoyer();
    const fenetre = screen.getByRole("dialog", { name: "Confirmer le nouveau tarif" });
    const texte = n(within(fenetre).getByTestId("apercu-tarif").textContent);
    expect(texte).toContain("16 · Attestation de veuvage");
    expect(texte).toContain("5 000 FC→6 000 FCà partir du 01/02/2027");
    expect(texte).toContain("Gardent leur propre prix à cette date : MUL (4 000 FC).");
    expect(texte).toContain("Texte de référence : Arrêté n° 7/2027");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Modifier" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(programmer).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Nouveau montant") as HTMLInputElement).value).toBe("6 000");
  });

  it("aperçu : un autre changement déjà programmé avant cette date est signalé", () => {
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ acte: "exnais", montant: "35", date: "2027-06-01", motif: "Arrêté" });
    envoyer();
    const texte = n(screen.getByTestId("apercu-tarif").textContent);
    expect(texte).toContain("35 $→35 $");
    expect(texte).toContain("Prix d'aujourd'hui : 30 $");
    expect(texte).toContain("ce changement ne modifiera rien");
    expect(texte).toContain("S'applique aux 4 entités.");
  });

  it("confirmation : la saisie part au serveur ; réussite annoncée, formulaire vidé", async () => {
    programmer.mockResolvedValue({ ok: true, texte: "EXNAIS : 40 $ à partir du 01/03/2027, pour les 4 entités." });
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ acte: "exnais", montant: "40", date: "2027-03-01", motif: "Arrêté n° 9" });
    envoyer();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(programmer).toHaveBeenCalled());
    expect(programmer.mock.calls[0][0]).toEqual({ acteId: "exnais", categorie: "national", montant: "40", devise: "USD", date: "2027-03-01", motif: "Arrêté n° 9" });
    expect((await screen.findByRole("status")).textContent).toBe("Tarif programmé — EXNAIS : 40 $ à partir du 01/03/2027, pour les 4 entités.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Nouveau montant") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Texte de référence") as HTMLTextAreaElement).value).toBe("");
  });

  it("refus du serveur : message affiché, saisie conservée", async () => {
    programmer.mockResolvedValue({ ok: false, message: "Action réservée à l'administrateur connecté avec son code de vérification." });
    render(<FormulaireTarif donnees={DONNEES} entites={ENTITES} aujourdhui={AUJOURDHUI} />);
    remplir({ acte: "exnais", montant: "40", date: "2027-03-01", motif: "Arrêté n° 9" });
    envoyer();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Action réservée");
    expect((screen.getByLabelText("Nouveau montant") as HTMLInputElement).value).toBe("40");
  });
});

describe("Changements programmés", () => {
  const CHANGEMENT: ChangementProgramme = {
    ligne: { id: "c99", type_acte_id: "exnais", categorie: "national", montant: 35, devise: "USD", en_vigueur_depuis: "2027-01-01", motif: "Arrêté n° 4" },
    acte: EXNAIS,
    avant: { montant: 30, devise: "USD" },
  };

  it("aucun : phrase d'explication", () => {
    render(<ChangementsProgrammes changements={[]} />);
    expect(screen.getByText(/Aucun changement programmé/)).toBeTruthy();
  });

  it("liste ; « Annuler… » demande confirmation ; « Garder » ne fait rien", () => {
    render(<ChangementsProgrammes changements={[CHANGEMENT]} />);
    const ligne = screen.getAllByRole("row")[1];
    expect(within(ligne).getAllByRole("cell").slice(0, 5).map((c) => n(c.textContent))).toEqual([
      "01/01/2027", "22 · Extrait d'acte de naissance", "—", "30 $ → 35 $", "Arrêté n° 4",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Annuler le changement EXNAIS du 01/01/2027" }));
    const fenetre = screen.getByRole("dialog", { name: "Annuler ce changement ?" });
    expect(n(fenetre.textContent)).toContain("Le prix de 30 $ restera en vigueur.");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Garder" }));
    expect(annuler).not.toHaveBeenCalled();
  });

  it("annulation confirmée : envoyée au serveur, puis annoncée ; refus affiché dans la fenêtre", async () => {
    annuler.mockResolvedValueOnce({ ok: false, message: "Ce changement est déjà entré en vigueur, ou il a déjà été annulé : il ne peut plus être annulé." });
    annuler.mockResolvedValueOnce({ ok: true });
    render(<ChangementsProgrammes changements={[CHANGEMENT]} />);
    fireEvent.click(screen.getByRole("button", { name: /Annuler le changement/ }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler ce changement" }));
    expect((await screen.findByRole("alert")).textContent).toContain("déjà entré en vigueur");
    // Le bouton redevient actif une fois la première demande terminée (sinon le 2e clic serait ignoré)
    await waitFor(() => expect((screen.getByRole("button", { name: "Oui, annuler ce changement" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler ce changement" }));
    expect((await screen.findByRole("status")).textContent).toBe("Changement annulé : EXNAIS, prévu le 01/01/2027.");
    expect(annuler).toHaveBeenCalledWith("c99");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
