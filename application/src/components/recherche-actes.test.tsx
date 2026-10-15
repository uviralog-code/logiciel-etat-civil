// Fichier 32 — écran « Rechercher » : formulaire, messages, résultats
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CriteresRecherche, ReponseRecherche, ResultatRecherche } from "@/lib/recherche";
import { BarreRecherche, RechercheActes } from "./recherche-actes";

afterEach(cleanup);

const TYPES = [
  { id: "t1", numero: 22, libelle: "Extrait d'acte de naissance", actif: true },
  { id: "t2", numero: 26, libelle: "Certificat de vie", actif: false },
];
const VIDE: CriteresRecherche = { texte: "", typeActeId: null, annee: null, statut: null };
const r = (o: Partial<ResultatRecherche>): ResultatRecherche => ({
  acteId: "a1", identifiant: "MUL-EXNAIS-2026-000123", entiteCode: "MUL", typeCode: "EXNAIS", typeLibelle: "Extrait d'acte de naissance",
  titulaire: "MUGISHO Bahati Jean", titulaire2: null, demandeur: null, numeroRegistre: null, dateActe: "2026-10-13", statut: "delivre",
  scanne: true, correspondance: "nom", ...o,
});
const afficher = (criteres: CriteresRecherche, reponse: ReponseRecherche, avecEntite = false) =>
  render(
    <RechercheActes base="/officier/recherche" lienFiche="/officier/actes" criteres={criteres} reponse={reponse} types={TYPES} anneeEnCours={2026} avecEntite={avecEntite} />,
  );

describe("Formulaire", () => {
  it("formulaire GET vers la page de recherche ; filtres type (retirés signalés), année, statut", () => {
    afficher({ texte: "Mugisho", typeActeId: "t1", annee: 2026, statut: "paye" }, { etat: "vide" });
    const formulaire = screen.getByRole("search", { name: "Recherche et filtres" }) as HTMLFormElement;
    expect([formulaire.getAttribute("action"), formulaire.method]).toEqual(["/officier/recherche", "get"]);
    expect((screen.getByLabelText("Rechercher un acte") as HTMLInputElement).value).toBe("Mugisho");
    expect([...(screen.getByLabelText("Type d'acte") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      "Tous les types", "22 · Extrait d'acte de naissance", "26 · Certificat de vie (retiré)",
    ]);
    expect((screen.getByLabelText("Type d'acte") as HTMLSelectElement).value).toBe("t1");
    expect((screen.getByLabelText("Année") as HTMLSelectElement).value).toBe("2026");
    expect((screen.getByLabelText("Statut") as HTMLSelectElement).value).toBe("paye");
  });

  it("barre seule (accueil de l'officier) : même recherche", () => {
    render(<BarreRecherche action="/officier/recherche" />);
    expect(screen.getByRole("search").getAttribute("action")).toBe("/officier/recherche");
    expect(screen.getByRole("button", { name: "Rechercher" })).toBeTruthy();
  });
});

describe("Messages et résultats", () => {
  it("rien tapé : explication ; refus de la base : message", () => {
    afficher(VIDE, { etat: "vide" });
    expect(screen.getByText(/Tapez un ID ou un nom/)).toBeTruthy();
    cleanup();
    afficher({ ...VIDE, texte: "a" }, { etat: "erreur", message: "Tapez au moins 2 caractères pour lancer une recherche." });
    expect(screen.getByRole("alert").textContent).toBe("Tapez au moins 2 caractères pour lancer une recherche.");
  });

  it("aucun résultat (avec filtres) ; trop de résultats", () => {
    afficher({ ...VIDE, texte: "Xyz", annee: 2026 }, { etat: "trouve", resultats: [], tronque: false });
    expect(screen.getByRole("status").textContent).toBe("Aucun acte trouvé pour « Xyz » avec ces filtres.");
    cleanup();
    afficher({ ...VIDE, texte: "MUL" }, { etat: "trouve", resultats: [r({})], tronque: true });
    expect(screen.getByRole("status").textContent).toContain("Plus de 50 actes trouvés");
  });

  it("tableau : ID cliquable vers la fiche (avec retour aux résultats), titulaire, époux, demandeur, registre, statut", () => {
    afficher({ ...VIDE, texte: "Mugisho" }, {
      etat: "trouve", tronque: false,
      resultats: [
        r({}),
        r({ acteId: "a2", identifiant: "MUL-MAR-2026-000009", typeLibelle: "Mariage", titulaire: "Kasongo Jean", titulaire2: "Mapendo Grace", demandeur: "Mugisho Pierre", statut: "enregistre", scanne: false }),
        r({ acteId: "a3", identifiant: "MUL-EXNAIS-2019-000411", numeroRegistre: "411", dateActe: "2019-05-02" }),
      ],
    });
    expect(screen.getByRole("status").textContent).toBe("3 actes trouvés");
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes.map((l) => within(l).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["MUL-EXNAIS-2026-000123", "Extrait d'acte de naissance", "MUGISHO Bahati Jean", "13/10/2026", "Délivré et scanné"],
      ["MUL-MAR-2026-000009", "Mariage", "Kasongo Jean et Mapendo GraceDemandeur : Mugisho Pierre", "13/10/2026", "Enregistré"],
      ["MUL-EXNAIS-2019-000411", "Extrait d'acte de naissance", "MUGISHO Bahati JeanReg. n° 411", "02/05/2019", "Délivré et scanné"],
    ]);
    expect(screen.getByRole("link", { name: "MUL-EXNAIS-2026-000123" }).getAttribute("href")).toBe(
      "/officier/actes/a1?retour=%2Fofficier%2Frecherche%3Fq%3DMugisho",
    );
  });

  it("administrateur : une colonne « Entité »", () => {
    afficher({ ...VIDE, texte: "Mugisho" }, { etat: "trouve", tronque: false, resultats: [r({ entiteCode: "KAV" })] }, true);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["ID de l'acte", "Entité", "Type", "Titulaire", "Date", "Statut"]);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[1].textContent).toBe("KAV");
  });
});
