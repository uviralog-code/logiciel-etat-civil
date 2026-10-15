// Fichier 36 — import en lot : acte suivant du registre, document, case « le document correspond », scans manquants, fermeture
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActeDuLot } from "@/lib/anciens-registres";
import { ImportLot, type LotAffiche } from "./import-lot";

const m = vi.hoisted(() => ({
  ajouterAncien: vi.fn(async (_lot: string, s: { numero: string }) => ({ ok: true as const, acte: { id: `id-${s.numero}`, identifiant: `MUL-EXNAIS-2019-0000${s.numero.slice(-2)}` } })),
  archiverAncien: vi.fn(async (): Promise<{ ok: true; version: number; pages: number } | { ok: false; message: string }> => ({ ok: true, version: 1, pages: 1 })),
  fermerLeLot: vi.fn(async (): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true })),
  verifierEmpreinteEntite: vi.fn(async (): Promise<string | null> => null),
  envoyerScan: vi.fn(async () => {}),
  lireEtatPont: vi.fn(async (): Promise<unknown> => ({ etat: "absent" })),
  scanner: vi.fn(async () => ({ pdf: new TextEncoder().encode("%PDF-1.7 scanné"), scanner: "HP" })),
  assemblerPdf: vi.fn(async (pages: { page?: number }[]) => new TextEncoder().encode(`%PDF-1.7 pages ${pages.map((p) => p.page).join(",")}`)),
}));
vi.mock("../actions", () => ({ ajouterAncien: m.ajouterAncien, archiverAncien: m.archiverAncien, fermerLeLot: m.fermerLeLot }));
vi.mock("@/lib/anciens-registres", async (o) => ({ ...(await o<typeof import("@/lib/anciens-registres")>()), verifierEmpreinteEntite: m.verifierEmpreinteEntite }));
vi.mock("@/lib/archivage", async (o) => ({ ...(await o<typeof import("@/lib/archivage")>()), assemblerPdf: m.assemblerPdf, empreinteSha256: async () => "e".repeat(64) }));
vi.mock("@/lib/envoi-reprenable", () => ({ envoyerScan: m.envoyerScan }));
vi.mock("@/lib/pont-scanner", async (o) => ({ ...(await o<typeof import("@/lib/pont-scanner")>()), lireEtatPont: m.lireEtatPont, scanner: m.scanner }));
vi.mock("@/lib/scan-navigateur", () => ({
  compterPages: async () => 10,
  compresserImage: async () => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff]), largeur: 620, hauteur: 877 }),
  dessinerPage: async () => document.createElement("canvas"),
}));
vi.mock("@/lib/scans", () => ({ cheminPrevu: async () => "MUL/2019/x.pdf" }));
vi.mock("@/lib/supabase/configuration", () => ({ configurationSupabase: () => ({ url: "http://supabase", clePublique: "cle" }) }));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "jeton" } } }) } }) }));

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockClear());
  m.lireEtatPont.mockResolvedValue({ etat: "absent" });
});
afterEach(cleanup);

const LOT: LotAffiche = {
  id: "lot1", ouvert: true, annee: 2019, modele: "naissance", typeCode: "EXNAIS", typeLibelle: "Extrait d'acte de naissance", codeEntite: "MUL",
  noms: { titulaire: "Nom de l'enfant (titulaire)", titulaire2: null },
};
const ACTES: ActeDuLot[] = [
  { id: "a37", identifiant: "MUL-EXNAIS-2019-000037", titulaire: "X", titulaire2: null, numeroRegistre: "411", dateActe: "2019-05-09", numeroOrdre: 37, scanne: true },
];
const afficher = (lot = LOT, actes = ACTES) => render(<ImportLot lot={lot} actes={actes} dernierNumero={37} aujourdhui="2026-10-14" />);
const pdf = (nom: string) => new File([new TextEncoder().encode(`%PDF-1.7 ${nom}`)], nom, { type: "application/pdf" });
const champ = (nom: string) => screen.getByLabelText(nom) as HTMLInputElement;
const remplir = (nom: string, date = "2019-05-10") => {
  fireEvent.change(champ("Nom de l'enfant (titulaire)"), { target: { value: nom } });
  fireEvent.change(champ("Date de l'acte dans le registre"), { target: { value: date } });
};
const cocher = () => fireEvent.click(screen.getByRole("checkbox"));

describe("Formulaire de l'acte suivant", () => {
  it("type imposé, n° suivant proposé, ID prévu, contrôles avant d'enregistrer", async () => {
    afficher();
    expect(screen.getByText(/Type imposé par le lot/).textContent).toBe("Type imposé par le lot : extrait d'acte de naissance (EXNAIS), année 2019.");
    expect(champ("N° dans le registre papier").value).toBe("412");
    expect(screen.getByTestId("id-prevu").textContent).toBe("MUL-EXNAIS-2019-000038");
    expect([champ("Date de l'acte dans le registre").min, champ("Date de l'acte dans le registre").max]).toEqual(["2019-01-01", "2019-12-31"]);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    expect(screen.getByTestId("erreur-lot").textContent).toBe("Indiquez le nom du titulaire.");
    remplir("Furaha Espoir");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    expect(screen.getByTestId("erreur-lot").textContent).toBe("Cochez « le document correspond » après l'avoir vérifié.");
    cocher();
    expect(screen.getByRole("checkbox").closest("label")!.textContent).toBe("Le document correspond : c'est bien l'acte n° 412 au nom de Furaha Espoir, et il est lisible.");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    await waitFor(() => expect(screen.getByTestId("erreur-lot").textContent).toBe("Choisissez les fichiers à importer."));
    expect(m.ajouterAncien).not.toHaveBeenCalled();
  });

  it("lot de mariages : les deux époux", () => {
    afficher({ ...LOT, modele: "mariage", noms: { titulaire: "Nom de l'époux", titulaire2: "Nom de l'épouse" } });
    expect(champ("Nom de l'époux")).toBeTruthy();
    expect(champ("Nom de l'épouse")).toBeTruthy();
  });
});

describe("Plusieurs fichiers (un par acte)", () => {
  it("n° lu dans le nom du fichier ; acte créé, scan envoyé et archivé dans le lot ; fichier suivant", async () => {
    afficher();
    fireEvent.change(screen.getByLabelText("Fichiers des actes (un par acte)"), { target: { files: [pdf("reg2019_420.pdf"), pdf("421.pdf")] } });
    await waitFor(() => expect(champ("N° dans le registre papier").value).toBe("420"));
    await waitFor(() => expect(screen.getByTestId("apercu-acte")).toBeTruthy());
    expect(screen.getByTestId("file-fichiers").textContent).toContain("Fichier en cours : reg2019_420.pdf · 1 autre(s) en attente");
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    await waitFor(() => expect(screen.getByTestId("info-lot").textContent).toBe("✓ MUL-EXNAIS-2019-000020 enregistré et archivé (reg. n° 420)."));
    expect(m.ajouterAncien).toHaveBeenCalledWith("lot1", { titulaire: "Furaha Espoir", titulaire2: "", date: "2019-05-10", numero: "420" });
    expect(m.envoyerScan).toHaveBeenCalledWith(expect.objectContaining({ jeton: "jeton", chemin: "MUL/2019/x.pdf" }));
    expect(m.archiverAncien).toHaveBeenCalledWith("id-420", "lot1");
    expect(within(screen.getByTestId("derniers-ajoutes")).getAllByRole("listitem")[0].textContent).toBe("MUL-EXNAIS-2019-000020Reg. n° 420");
    // Suivant : n° du fichier suivant, même date, case décochée, ID suivant
    await waitFor(() => expect(champ("N° dans le registre papier").value).toBe("421"));
    expect([champ("Nom de l'enfant (titulaire)").value, champ("Date de l'acte dans le registre").value, (screen.getByRole("checkbox") as HTMLInputElement).checked]).toEqual(["", "2019-05-10", false]);
    expect(screen.getByTestId("id-prevu").textContent).toBe("MUL-EXNAIS-2019-000039");
  });

  it("même fichier déjà archivé : prévenu, l'acte n'est PAS créé", async () => {
    m.verifierEmpreinteEntite.mockResolvedValue("Ce fichier est déjà enregistré pour l'acte MUL-EXNAIS-2019-000007. Vérifiez que vous avez scanné le bon document.");
    afficher();
    fireEvent.change(screen.getByLabelText("Fichiers des actes (un par acte)"), { target: { files: [pdf("doublon.pdf")] } });
    await waitFor(() => expect(screen.getByTestId("doublon-lot").textContent).toContain("MUL-EXNAIS-2019-000007"));
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    await waitFor(() => expect(screen.getByTestId("erreur-lot").textContent).toContain("déjà enregistré pour l'acte MUL-EXNAIS-2019-000007"));
    expect(m.ajouterAncien).not.toHaveBeenCalled();
    m.verifierEmpreinteEntite.mockResolvedValue(null);
  });

  it("n° déjà numérisé : refus de la base sur le champ n°", async () => {
    m.ajouterAncien.mockResolvedValueOnce({ ok: false, message: "Le n° 412 du registre 2019 est déjà numérisé : MUL-EXNAIS-2019-000005.", champ: "numero" } as never);
    afficher();
    fireEvent.change(screen.getByLabelText("Fichiers des actes (un par acte)"), { target: { files: [pdf("a.pdf")] } });
    await waitFor(() => expect(screen.getByTestId("apercu-acte")).toBeTruthy());
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    await waitFor(() => expect(screen.getByTestId("erreur-lot").textContent).toBe("Le n° 412 du registre 2019 est déjà numérisé : MUL-EXNAIS-2019-000005."));
    expect(champ("N° dans le registre papier").getAttribute("aria-invalid")).toBe("true");
  });

  it("scan non joint après la création : « scan manquant », réessai", async () => {
    m.archiverAncien.mockResolvedValueOnce({ ok: false, message: "La connexion a été coupée." });
    afficher();
    fireEvent.change(screen.getByLabelText("Fichiers des actes (un par acte)"), { target: { files: [pdf("412.pdf")] } });
    await waitFor(() => expect(screen.getByTestId("apercu-acte")).toBeTruthy());
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
    await waitFor(() => expect(screen.getByTestId("erreur-lot").textContent).toMatch(/^L'acte MUL-EXNAIS-2019-000012 est enregistré, mais son scan n'a pas pu être joint : La connexion a été coupée\./));
    expect(within(screen.getByTestId("scans-manquants")).getByText("MUL-EXNAIS-2019-000012")).toBeTruthy();
    expect(within(screen.getByTestId("derniers-ajoutes")).getAllByRole("listitem")[0].textContent).toBe("MUL-EXNAIS-2019-000012Reg. n° 412 · scan manquant");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer l'envoi du scan" }));
    await waitFor(() => expect(screen.getByTestId("info-lot").textContent).toBe("✓ MUL-EXNAIS-2019-000012 : scan archivé."));
    expect(screen.queryByTestId("scans-manquants")).toBeNull();
  });
});

describe("Registre entier (un PDF découpé)", () => {
  it("pages 1 pour le premier acte, puis 2 proposées pour le suivant", async () => {
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Registre entier (un PDF)" }));
    fireEvent.change(screen.getByLabelText("PDF du registre entier"), { target: { files: [pdf("registre-2019.pdf")] } });
    await waitFor(() => expect(champ("Pages de cet acte").value).toBe("1"));
    expect(screen.getByTestId("registre-entier").textContent).toContain("registre-2019.pdf · 10 pages");
    fireEvent.change(champ("Pages de cet acte"), { target: { value: "1-2" } });
    await waitFor(() => expect(m.assemblerPdf.mock.calls.at(-1)![0].map((p) => p.page)).toEqual([0, 1]));
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer cet acte" }));
    await waitFor(() => expect(m.archiverAncien).toHaveBeenCalled());
    await waitFor(() => expect(champ("Pages de cet acte").value).toBe("3-4"));
  });
});

describe("Scanner du bureau", () => {
  it("pont prêt : choisi d'office ; « Scanner et enregistrer » scanne puis enregistre", async () => {
    m.lireEtatPont.mockResolvedValue({ etat: "ok", version: "1.0.0", naps2: true, scanners: ["HP"], scanner: "HP", dossier: "C:\\EtatCivil\\Scans", pret: true, scanEnCours: false, message: "prêt" });
    afficher();
    await waitFor(() => expect(screen.getByRole("button", { name: "Scanner du bureau" }).getAttribute("aria-pressed")).toBe("true"));
    remplir("Furaha Espoir");
    cocher();
    fireEvent.click(screen.getByRole("button", { name: "Scanner et enregistrer" }));
    await waitFor(() => expect(m.archiverAncien).toHaveBeenCalled());
    expect(m.scanner).toHaveBeenCalled();
  });

  it("pont absent : le bouton est inactif et l'écran propose les autres façons", async () => {
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Scanner du bureau" }));
    await waitFor(() => expect(screen.getByTestId("etat-scanner-lot").textContent).toBe("Pont scanner non démarré sur cet ordinateur. Utilisez « Plusieurs fichiers » ou « Registre entier »."));
    expect((screen.getByRole("button", { name: "Scanner et enregistrer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Fermer le lot", () => {
  it("confirmation ; refus de la base affiché ; lot fermé : liste seule", async () => {
    m.fermerLeLot.mockResolvedValueOnce({ ok: false, message: "1 acte(s) de ce lot n'ont pas encore leur scan : joignez-les avant de fermer le lot." });
    afficher();
    fireEvent.click(screen.getByRole("button", { name: "Fermer le lot…" }));
    const fenetre = screen.getByRole("dialog");
    expect(fenetre.textContent).toContain("Le lot compte 1 acte.");
    await act(async () => fireEvent.click(within(fenetre).getByRole("button", { name: "Oui, fermer le lot" })));
    expect(within(fenetre).getByRole("alert").textContent).toMatch(/^1 acte\(s\) de ce lot/);
    expect(m.fermerLeLot).toHaveBeenCalledWith("lot1");
    cleanup();
    afficher({ ...LOT, ouvert: false });
    expect(screen.getByRole("note").textContent).toMatch(/^Ce lot est fermé/);
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Actes du lot" })).toBeTruthy();
  });
});

it("le compteur du bandeau suit la saisie", async () => {
  const { CompteurLot } = await import("./compteur-lot");
  render(<><CompteurLot lotId="lot1" initial={1} /><ImportLot lot={LOT} actes={ACTES} dernierNumero={37} aujourdhui="2026-10-14" /></>);
  await waitFor(() => expect(screen.getByTestId("nb-actes-lot").textContent).toBe("1"));
  fireEvent.change(screen.getByLabelText("Fichiers des actes (un par acte)"), { target: { files: [pdf("420.pdf")] } });
  await waitFor(() => expect(screen.getByTestId("apercu-acte")).toBeTruthy());
  remplir("Furaha Espoir");
  cocher();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer et passer au suivant" }));
  await waitFor(() => expect(screen.getByTestId("nb-actes-lot").textContent).toBe("2"));
});
