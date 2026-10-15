// Fichier 33 — écran « Scan de l'acte » : choix du fichier, aperçu, vérifications obligatoires, envoi
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageSource } from "@/lib/archivage";
import { ScanActe, type ActeAScanner } from "./scan-acte";

const m = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature de la vraie fonction (pages, sources)
  assemblerPdf: vi.fn(async (pages: unknown[], sources?: Uint8Array[]) => new Uint8Array(1500 * pages.length)),
  compresserImage: vi.fn(async () => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 1]), largeur: 620, hauteur: 877 })),
  compterPages: vi.fn(async () => 2),
  dessinerPage: vi.fn(async () => {}),
  verifierEmpreinte: vi.fn(async (): Promise<string | null> => null),
  cheminPrevu: vi.fn(async () => "MUL/2026/MUL-EXNAIS-2026-000123.pdf"),
  envoyerScan: vi.fn(async (e: { surProgression?: (a: number, b: number) => void }) => e.surProgression?.(3000, 6000)),
  archiver: vi.fn(async (): Promise<{ ok: false; message: string; champ?: "motif" }> => ({ ok: false, message: "Refus de la base" })),
}));
vi.mock("@/lib/archivage", async (original) => ({ ...(await original<typeof import("@/lib/archivage")>()), assemblerPdf: m.assemblerPdf, empreinteSha256: async () => "e".repeat(64) }));
vi.mock("@/lib/scan-navigateur", () => ({ compresserImage: m.compresserImage, compterPages: m.compterPages, dessinerPage: m.dessinerPage }));
vi.mock("@/lib/scans", () => ({ verifierEmpreinte: m.verifierEmpreinte, cheminPrevu: m.cheminPrevu }));
vi.mock("@/lib/envoi-reprenable", () => ({ envoyerScan: m.envoyerScan }));
vi.mock("@/lib/supabase/configuration", () => ({ configurationSupabase: () => ({ url: "http://supabase", clePublique: "cle" }) }));
vi.mock("@/lib/supabase/navigateur", () => ({
  creerClientNavigateur: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "jeton" } } }) } }),
}));
vi.mock("./actions", () => ({ archiver: m.archiver }));
const n = vi.hoisted(() => ({
  push: vi.fn(),
  lireEtatPont: vi.fn(async (): Promise<unknown> => ({ etat: "absent" })),
  rangerFichiers: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: n.push }) }));
vi.mock("@/lib/pont-scanner", async (original) => ({
  ...(await original<typeof import("@/lib/pont-scanner")>()), lireEtatPont: n.lireEtatPont, rangerFichiers: n.rangerFichiers,
}));
// Le panneau du scanner est testé à part : ici, il remet un PDF scanné, puis un fichier du dossier surveillé
vi.mock("./scanner-bureau", () => ({
  ScannerBureau: ({ surDocuments }: { surDocuments: (f: File[], nom?: string) => Promise<void> }) => (
    <>
      <button type="button" onClick={() => surDocuments([new File([new TextEncoder().encode("%PDF-1.7")], "scan.pdf")])}>Scan stub</button>
      <button type="button" onClick={() => surDocuments([new File([new TextEncoder().encode("%PDF-1.7")], "scan_0001.pdf")], "scan_0001.pdf")}>Joindre stub</button>
    </>
  ),
}));
// Le panneau « Photo par téléphone » est testé à part : ici, il remet 2 pages d'un coup (comme une réception du téléphone)
vi.mock("./photo-telephone", () => ({
  PhotoTelephone: ({ surPage }: { surPage: (p: { jpeg: Uint8Array; largeur: number; hauteur: number }) => void }) => (
    <button type="button" onClick={() => [1, 2].forEach((n) => surPage({ jpeg: new Uint8Array([0xff, 0xd8, 0xff, n]), largeur: 1654, hauteur: 2339 }))}>
      Recevoir 2 photos
    </button>
  ),
}));

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockClear());
  Object.values(n).forEach((f) => f.mockClear());
  n.lireEtatPont.mockResolvedValue({ etat: "absent" });
});
afterEach(cleanup);

const ACTE: ActeAScanner = {
  id: "a1", identifiant: "MUL-EXNAIS-2026-000123", typeLibelle: "Extrait d'acte de naissance", titulaire: "MUGISHO Bahati Jean",
  chemin: "MUL/2026/MUL-EXNAIS-2026-000123.pdf", version: 1, retour: "/officier",
};
const JPEG = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], "acte.jpg", { type: "image/jpeg" });
const PDF = () => new File([new TextEncoder().encode("%PDF-1.7 …")], "registre.pdf", { type: "application/pdf" });
const choisir = (...f: File[]) => fireEvent.change(screen.getByLabelText("Choisir le fichier de l'acte"), { target: { files: f } });
const valider = () => screen.getByRole("button", { name: "Valider l'archivage" }) as HTMLButtonElement;
const cocherTout = () => screen.getAllByRole("checkbox").forEach((c) => fireEvent.click(c));

describe("Avant de choisir un fichier", () => {
  it("3 sources (pont scanner absent ici), emplacement prévu, validation impossible et pourquoi", async () => {
    render(<ScanActe acte={ACTE} />);
    expect(screen.getByRole("heading", { name: "Joindre l'acte signé et cacheté" })).toBeTruthy();
    const sources = within(screen.getByRole("group", { name: "Source du document" }));
    await waitFor(() => expect(screen.getByTestId("carte-scanner").textContent).toBe("ScannerPont scanner non démarré sur cet ordinateur"));
    expect(sources.getByRole("button", { name: /Importer un fichier/ }).getAttribute("aria-pressed")).toBe("true");
    expect(sources.getByRole("button", { name: /Photo par téléphone/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("chemin-prevu").textContent).toBe("MUL/2026/MUL-EXNAIS-2026-000123.pdf");
    expect(valider().disabled).toBe(true);
    expect(screen.getByTestId("manque").textContent).toBe("Pour valider : choisissez le fichier de l'acte · cochez les 3 vérifications.");
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).disabled)).toBe(true);
  });
});

describe("Choix des fichiers et aperçu", () => {
  it("photo + PDF de 2 pages : 3 pages réunies dans l'ordre ; résumé ; fichier refusé signalé", async () => {
    render(<ScanActe acte={ACTE} />);
    choisir(JPEG(), new File(["texte"], "notes.jpg"), PDF());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 1 sur 3" })).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toBe("« notes.jpg » n'est ni un PDF, ni une photo JPEG ou PNG.");
    const pages = m.assemblerPdf.mock.calls.at(-1)![0] as PageSource[];
    expect(pages.map((p) => [p.genre, p.source, p.genre === "pdf" ? p.page : null])).toEqual([["image", 0, null], ["pdf", 1, 0], ["pdf", 1, 1]]);
    await waitFor(() => expect(screen.getByTestId("resume-document").textContent?.replace(/ | /g, " ")).toBe("3 pages · 4 Ko après compression · version 1"));
    expect(m.verifierEmpreinte).toHaveBeenCalledWith(expect.anything(), "a1", "e".repeat(64));
  });

  it("pivoter, page suivante, retirer, recommencer", async () => {
    render(<ScanActe acte={ACTE} />);
    choisir(PDF());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 1 sur 2" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Page suivante ›" }));
    fireEvent.click(screen.getByRole("button", { name: "Pivoter" }));
    await waitFor(() => expect((m.assemblerPdf.mock.calls.at(-1)![0] as PageSource[]).map((p) => p.rotation)).toEqual([0, 90]));
    expect(screen.getByRole("heading", { name: "Aperçu — page 2 sur 2" })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Retirer cette page" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Retirer cette page" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 1 sur 1" })).toBeTruthy());
    await waitFor(() => expect((screen.getByRole("button", { name: "Recommencer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Recommencer" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu" })).toBeTruthy());
    expect(valider().disabled).toBe(true);
  });
});

describe("Valider l'archivage", () => {
  it("les 3 cases sont obligatoires ; envoi avec progression, puis enregistrement par le serveur ; refus affiché", async () => {
    render(<ScanActe acte={ACTE} />);
    choisir(JPEG());
    await waitFor(() => expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).disabled)).toBe(true));
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual([
      "Il s'agit bien de : extrait d'acte de naissance", "Il est au nom de MUGISHO Bahati Jean", "Il est signé et cacheté, et lisible",
    ]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(valider().disabled).toBe(true);
    expect(screen.getByTestId("manque").textContent).toBe("Pour valider : cochez les 3 vérifications.");
    cocherTout();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(valider().disabled).toBe(false);

    fireEvent.click(valider());
    await waitFor(() => expect(screen.getByTestId("erreur-archivage").textContent).toBe("Refus de la base"));
    expect(m.envoyerScan).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://supabase", clePublique: "cle", jeton: "jeton", chemin: "MUL/2026/MUL-EXNAIS-2026-000123.pdf", empreinte: "e".repeat(64),
    }));
    expect(m.archiver).toHaveBeenCalledWith("a1", null, "fichier");
    expect(valider().disabled).toBe(false);
  });

  it("même fichier déjà archivé : message rouge (maquette) et validation impossible", async () => {
    m.verifierEmpreinte.mockResolvedValueOnce("Ce fichier est déjà enregistré pour l'acte MUL-EXNAIS-2026-000118. Vérifiez que vous avez scanné le bon document.");
    render(<ScanActe acte={ACTE} />);
    choisir(JPEG());
    await waitFor(() => expect(screen.getByTestId("doublon").textContent).toContain("MUL-EXNAIS-2026-000118"));
    cocherTout();
    expect(valider().disabled).toBe(true);
  });

  it("refaire le scan (version 2) : motif obligatoire, transmis au serveur", async () => {
    render(<ScanActe acte={{ ...ACTE, chemin: "MUL/2026/MUL-EXNAIS-2026-000123-v2.pdf", version: 2 }} />);
    expect(screen.getByRole("heading", { name: "Refaire le scan de l'acte" })).toBeTruthy();
    choisir(JPEG());
    await waitFor(() => expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).disabled)).toBe(true));
    cocherTout();
    expect(screen.getByTestId("manque").textContent).toBe("Pour valider : indiquez pourquoi le scan est refait.");
    fireEvent.change(screen.getByLabelText("Pourquoi refaire le scan ?"), { target: { value: "Page 2 illisible" } });
    fireEvent.click(valider());
    await waitFor(() => expect(m.archiver).toHaveBeenCalledWith("a1", "Page 2 illisible", "fichier"));
  });
});

describe("Photo par téléphone", () => {
  it("les photos reçues (même 2 d'un coup) s'ajoutent comme pages photo ; archivées en mode « photo »", async () => {
    render(<ScanActe acte={ACTE} />);
    fireEvent.click(screen.getByRole("button", { name: /Photo par téléphone/ }));
    expect(screen.getByRole("button", { name: /Photo par téléphone/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Recevoir 2 photos" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 2 sur 2" })).toBeTruthy());
    const pages = m.assemblerPdf.mock.calls.at(-1)![0] as PageSource[];
    expect(pages.map((p) => [p.genre, p.source, p.genre === "image" && p.photo])).toEqual([["image", 0, true], ["image", 1, true]]);
    expect((m.assemblerPdf.mock.calls.at(-1)![1] as Uint8Array[]).map((s) => s[3])).toEqual([1, 2]);
    await waitFor(() => expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).disabled)).toBe(true));
    cocherTout();
    fireEvent.click(valider());
    await waitFor(() => expect(m.archiver).toHaveBeenCalledWith("a1", null, "photo"));
  });
});

describe("Scanner du bureau (pont)", () => {
  const PRET = { etat: "ok", version: "1.0.0", naps2: true, scanners: ["HP"], scanner: "HP LaserJet MFP M28w (WIA)", dossier: "C:\\EtatCivil\\Scans", pret: true, scanEnCours: false, message: "prêt" };

  it("pont prêt : carte « Scanner » choisie d'office (maquette) ; pages du scanner archivées en mode « scanner » ; fichiers joints rangés ; fiche ouverte", async () => {
    n.lireEtatPont.mockResolvedValue(PRET);
    m.archiver.mockResolvedValueOnce({ ok: true, version: 1, pages: 2 } as never);
    render(<ScanActe acte={ACTE} />);
    await waitFor(() => expect(screen.getByTestId("carte-scanner").getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByTestId("carte-scanner").textContent).toBe("ScannerHP LaserJet MFP M28w (WIA) · prêt");
    fireEvent.click(screen.getByRole("button", { name: "Scan stub" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 1 sur 2" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Joindre stub" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aperçu — page 3 sur 4" })).toBeTruthy());
    expect((m.assemblerPdf.mock.calls.at(-1)![0] as PageSource[]).every((p) => p.scanner)).toBe(true);
    await waitFor(() => expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).disabled)).toBe(true));
    cocherTout();
    fireEvent.click(valider());
    await waitFor(() => expect(n.push).toHaveBeenCalledWith("/officier/actes/a1?archive=1"));
    expect(m.archiver).toHaveBeenCalledWith("a1", null, "scanner");
    expect(n.rangerFichiers).toHaveBeenCalledWith(["scan_0001.pdf"]);
  });

  it("l'officier a déjà choisi une autre source : la réponse du pont ne la change pas", async () => {
    let repondre: (v: unknown) => void = () => {};
    n.lireEtatPont.mockReturnValue(new Promise((r) => (repondre = r)));
    render(<ScanActe acte={ACTE} />);
    fireEvent.click(screen.getByRole("button", { name: /Photo par téléphone/ }));
    await act(async () => repondre(PRET));
    expect(screen.getByRole("button", { name: /Photo par téléphone/ }).getAttribute("aria-pressed")).toBe("true");
    expect(m.archiver).not.toHaveBeenCalled();
  });
});
