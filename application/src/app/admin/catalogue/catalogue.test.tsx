// Fichier 27 — écran « Catalogue des actes » : tableau, retirer/remettre, modifier, ajouter
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lignesCatalogue, type ModeleFiche, type ResultatCatalogue, type SaisieCorrection, type SaisieTypeActe } from "@/lib/catalogue";
import type { LigneTarifCommun, TypeActe } from "@/lib/tarifs";
import { FormulaireType } from "./formulaire-type";
import { TableauCatalogue } from "./tableau-catalogue";

const ajouter = vi.fn<(s: SaisieTypeActe) => Promise<ResultatCatalogue>>();
const corriger = vi.fn<(id: string, s: SaisieCorrection) => Promise<ResultatCatalogue>>();
const changer = vi.fn<(id: string, actif: boolean) => Promise<ResultatCatalogue>>();
vi.mock("./actions", () => ({
  ajouter: (s: SaisieTypeActe) => ajouter(s),
  corriger: (id: string, s: SaisieCorrection) => corriger(id, s),
  changerPresenceAuCatalogue: (id: string, actif: boolean) => changer(id, actif),
}));
beforeEach(() => {
  ajouter.mockReset();
  corriger.mockReset();
  changer.mockReset();
});
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, libelle: string, o: Partial<TypeActe & { modele_fiche: ModeleFiche }> = {}) => ({
  id, numero, code, libelle, famille: "attestation" as const, tarif_distinct_etranger: false, couleur: "#1565C0", actif: true,
  modele_fiche: "generique" as ModeleFiche, ...o,
});
const ATRES = acte("atres", 5, "ATRES", "Attestation de résidence", { tarif_distinct_etranger: true });
const EXNAIS = acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance", { famille: "extrait", modele_fiche: "naissance", couleur: "#2E7D32" });
const CVIE = acte("cvie", 26, "CVIE", "Certificat de vie", { famille: "certificat", actif: false, couleur: "#00727C" });
const NEUF = acte("neuf", 27, "ATBVM", "Attestation de bonne vie et mœurs");
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});
const COMMUNS = [
  commun("atres", 18000, "CDF", "2026-01-01"), commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
  commun("exnais", 30, "USD", "2026-01-01"), commun("cvie", 18000, "CDF", "2026-01-01"), commun("neuf", 12000, "CDF", "2026-10-15"),
];
const afficherTableau = () => render(<TableauCatalogue lignes={lignesCatalogue([EXNAIS, ATRES, CVIE, NEUF], COMMUNS, AUJOURDHUI)} />);
const ligne = (code: string) => screen.getAllByRole("row").find((r) => r.getAttribute("data-type") === code)!;

describe("Tableau du catalogue", () => {
  it("numéro, code, acte et famille, fiche, prix du jour, état ; retiré en grisé ; tout neuf : « Disponible le »", () => {
    afficherTableau();
    const cellules = (code: string) => within(ligne(code)).getAllByRole("cell").slice(0, 6).map((c) => n(c.textContent));
    expect(cellules("ATRES")).toEqual(["05", "ATRES", "Attestation de résidenceAttestations", "Simple", "National : 18 000 FCÉtranger : 39 000 FC", "Au catalogue"]);
    expect(cellules("EXNAIS")).toEqual(["22", "EXNAIS", "Extrait d'acte de naissanceExtraits", "Naissance", "30 $", "Au catalogue"]);
    expect(cellules("CVIE")).toEqual(["26", "CVIE", "Certificat de vieCertificats", "Simple", "18 000 FC", "Retiré"]);
    expect(cellules("ATBVM")[4]).toBe("Disponible le 15/10/2026");
    expect(ligne("CVIE").getAttribute("data-etat")).toBe("retire");
  });

  it("« Retirer… » : explication, puis envoi au serveur", async () => {
    changer.mockResolvedValue({ ok: true, texte: "EXNAIS — Extrait d'acte de naissance : retiré du catalogue." });
    afficherTableau();
    fireEvent.click(screen.getByRole("button", { name: "Retirer EXNAIS" }));
    const fenetre = screen.getByRole("dialog", { name: "Retirer ce type d'acte du catalogue ?" });
    expect(n(fenetre.textContent)).toContain("Les actes déjà enregistrés, leurs reçus et l'historique des prix restent intacts.");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Oui, retirer du catalogue" }));
    await waitFor(() => expect(changer).toHaveBeenCalledWith("exnais", false));
    expect((await screen.findByRole("status")).textContent).toContain("retiré du catalogue");
  });

  it("« Remettre » : directement", async () => {
    changer.mockResolvedValue({ ok: true, texte: "CVIE — Certificat de vie : remis au catalogue." });
    afficherTableau();
    expect(within(ligne("CVIE")).queryByRole("button", { name: /Retirer/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remettre CVIE au catalogue" }));
    await waitFor(() => expect(changer).toHaveBeenCalledWith("cvie", true));
  });

  it("« Modifier… » : libellé, famille, couleur ; un refus s'affiche dans la fenêtre", async () => {
    corriger.mockResolvedValueOnce({ ok: false, message: "Un acte porte déjà ce nom : « Certificat de vie ».", champ: "libelle" });
    corriger.mockResolvedValueOnce({ ok: true, texte: "EXNAIS : corrigé." });
    afficherTableau();
    fireEvent.click(screen.getByRole("button", { name: "Modifier EXNAIS" }));
    const fenetre = screen.getByRole("dialog", { name: "Modifier EXNAIS" });
    expect(n(fenetre.textContent)).toContain("Le code, le numéro, la fiche de détails et le tarif Étrangers sont fixés à la création.");
    fireEvent.change(within(fenetre).getByLabelText("Nom de l'acte"), { target: { value: "Certificat de vie" } });
    fireEvent.click(within(fenetre).getByRole("button", { name: "Enregistrer" }));
    expect((await within(fenetre).findByRole("alert")).textContent).toContain("Un acte porte déjà ce nom");
    fireEvent.change(within(fenetre).getByLabelText("Nom de l'acte"), { target: { value: "Extrait d'acte de naissance (copie intégrale)" } });
    fireEvent.change(within(fenetre).getByLabelText("Famille"), { target: { value: "acte_etat_civil" } });
    fireEvent.click(within(fenetre).getByLabelText("Gris (extraits)"));
    fireEvent.click(within(fenetre).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(corriger).toHaveBeenLastCalledWith("exnais", { libelle: "Extrait d'acte de naissance (copie intégrale)", famille: "acte_etat_civil", couleur: "#374151" }));
    expect((await screen.findByRole("status")).textContent).toBe("EXNAIS : corrigé.");
  });
});

describe("Ajouter un type d'acte", () => {
  const actes = [EXNAIS, ATRES, CVIE, NEUF];
  const afficher = () => render(<FormulaireType actes={actes} aujourdhui={AUJOURDHUI} />);
  const remplir = (v: Record<string, string>) => {
    for (const [label, valeur] of Object.entries(v)) fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } });
  };

  it("propositions : numéro suivant, code en majuscules, couleur selon la famille et la fiche", () => {
    afficher();
    expect((screen.getByLabelText("N° sur la fiche officielle") as HTMLInputElement).value).toBe("28");
    remplir({ Code: "at-sép" });
    expect((screen.getByLabelText("Code") as HTMLInputElement).value).toBe("ATSEP");
    expect((screen.getByLabelText("Bleu (attestations)") as HTMLInputElement).checked).toBe(true);
    remplir({ "Fiche de détails à remplir": "mariage" });
    expect((screen.getByLabelText("Violet (mariage)") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Orange (autorisations)"));
    remplir({ Famille: "certificat" }); // couleur choisie à la main : elle ne bouge plus
    expect((screen.getByLabelText("Orange (autorisations)") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Tarif Étranger")).toBeNull();
    fireEvent.click(screen.getByLabelText("Les étrangers paient un tarif différent"));
    expect(screen.getByLabelText("Tarif Étranger")).toBeTruthy();
  });

  it("refus clairs avant tout envoi : code déjà pris, prix manquant", () => {
    afficher();
    remplir({ Code: "EXNAIS", "Nom de l'acte": "Attestation de séparation" });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au catalogue" }));
    expect(screen.getByRole("alert").textContent).toContain("Le code EXNAIS est déjà celui de « Extrait d'acte de naissance »");
    expect(screen.getByLabelText("Code").getAttribute("aria-invalid")).toBe("true");
    remplir({ Code: "ATSEP" });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au catalogue" }));
    expect(screen.getByLabelText("Tarif").getAttribute("aria-invalid")).toBe("true");
    expect(ajouter).not.toHaveBeenCalled();
  });

  it("aperçu avec mise en garde (champs figés), puis envoi ; réussite annoncée, formulaire vidé", async () => {
    ajouter.mockResolvedValue({ ok: true, texte: "ATSEP — Attestation de séparation : ajouté au catalogue, disponible dès demain." });
    afficher();
    remplir({ Code: "ATSEP", "Nom de l'acte": "Attestation de séparation", Tarif: "10 000", "Disponible à partir du": "2026-10-15", "Texte de référence": "Arrêté n° 3/2026" });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au catalogue" }));
    const fenetre = screen.getByRole("dialog", { name: "Confirmer le nouveau type d'acte" });
    expect(n(within(fenetre).getByTestId("apercu-type").textContent)).toBe(
      "Acte28 · Attestation de séparationCodeATSEP (Bleu (attestations))FamilleAttestationsFicheSimple (nom, demandeur, observations)Prix10 000 FCDisponible le15/10/2026RéférenceArrêté n° 3/2026",
    );
    expect(n(fenetre.textContent)).toContain("ils ne pourront plus être modifiés");
    fireEvent.click(within(fenetre).getByRole("button", { name: "Confirmer l'ajout" }));
    await waitFor(() => expect(ajouter).toHaveBeenCalled());
    expect(ajouter.mock.calls[0][0]).toMatchObject({ numero: "28", code: "ATSEP", montantNational: "10 000", deviseNational: "CDF", distinctEtranger: false });
    expect((await screen.findByRole("status")).textContent).toContain("disponible dès demain");
    expect((screen.getByLabelText("Code") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("N° sur la fiche officielle") as HTMLInputElement).value).toBe("29");
  });
});
