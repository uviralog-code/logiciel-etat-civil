// Fichier 35 — panneau « Scanner du bureau » : pont absent / à régler / prêt, scan, dossier surveillé
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatPont, FichierDossier } from "@/lib/pont-scanner";
import { ScannerBureau, SUIVI_DOSSIER_MS } from "./scanner-bureau";

const m = vi.hoisted(() => ({
  scanner: vi.fn(async () => ({ pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]), scanner: "HP" })),
  listerDossier: vi.fn(async (): Promise<{ dossier: string; fichiers: FichierDossier[] }> => ({ dossier: "C:\\EtatCivil\\Scans", fichiers: [] })),
  lireFichierDossier: vi.fn(async (f: FichierDossier) => new File([new Uint8Array([1])], f.nom)),
}));
vi.mock("@/lib/pont-scanner", () => m);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.values(m).forEach((f) => f.mockClear());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PRET: EtatPont = {
  etat: "ok", version: "1.0.0", naps2: true, scanners: ["HP LaserJet MFP M28w (WIA)"], scanner: "HP LaserJet MFP M28w (WIA)",
  dossier: "C:\\EtatCivil\\Scans", pret: true, scanEnCours: false, message: "prêt",
};
const afficher = (etat: EtatPont | null, autres: { joints?: string[] } = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature du vrai rappel
  const props = { etat, reessayer: vi.fn(), occupe: false, joints: [] as string[], surDocuments: vi.fn(async (fichiers: File[], nomDossier?: string) => {}), ...autres };
  render(<ScannerBureau {...props} />);
  return props;
};

describe("Le pont n'est pas prêt", () => {
  it("absent : que vérifier (installation, autorisation du navigateur), réessayer", () => {
    const p = afficher({ etat: "absent" });
    const aide = screen.getByTestId("pont-absent");
    expect(aide.textContent).toMatch(/^Le pont scanner ne répond pas sur cet ordinateur\./);
    expect(aide.textContent).toContain("autoriser l'accès aux appareils du réseau local");
    fireEvent.click(within(aide).getByRole("button", { name: "Réessayer" }));
    expect(p.reessayer).toHaveBeenCalled();
    expect(m.listerDossier).not.toHaveBeenCalled();
  });

  it("adresse non autorisée : la commande exacte à lancer sur l'ordinateur", () => {
    afficher({ etat: "refuse", message: "Le pont n'autorise pas encore l'adresse http://localhost:3000." });
    expect(screen.getByTestId("commande-installation").textContent).toBe(
      `C:\\EtatCivil\\EtatCivilScanner.exe --installer --origine ${window.location.origin}`);
  });

  it("pas de scanner branché : le message du pont", () => {
    afficher({ ...PRET, pret: false, scanner: null, message: "Aucun scanner trouvé : vérifiez qu'il est branché et allumé." } as EtatPont);
    expect(screen.getByRole("alert").textContent).toMatch(/^Aucun scanner trouvé/);
    expect(screen.queryByRole("button", { name: "Scanner la page" })).toBeNull();
  });
});

describe("Pont prêt", () => {
  it("« Scanner la page » : le PDF scanné rejoint le document ; échec affiché", async () => {
    const p = afficher(PRET);
    fireEvent.click(screen.getByRole("button", { name: "Scanner la page" }));
    await waitFor(() => expect(p.surDocuments).toHaveBeenCalledTimes(1));
    const [fichiers, nom] = p.surDocuments.mock.calls[0];
    expect([fichiers[0].name, fichiers[0].type, nom]).toEqual([expect.stringMatching(/^scan-\d{2}h\d{2}h\d{2}\.pdf$/), "application/pdf", undefined]);
    m.scanner.mockRejectedValueOnce(new Error("Le scan a échoué : Bourrage papier"));
    fireEvent.click(screen.getByRole("button", { name: "Scanner la page" }));
    await waitFor(() => expect(screen.getByTestId("erreur-scanner").textContent).toBe("Le scan a échoué : Bourrage papier"));
  });

  it("dossier surveillé : relu régulièrement ; « Joindre » ; fichier déjà joint marqué", async () => {
    m.listerDossier.mockResolvedValue({ dossier: "C:\\EtatCivil\\Scans", fichiers: [{ nom: "scan_0001.pdf", taille: 215000, modifie: "2026-10-14T08:05:00Z" }] });
    const p = afficher(PRET, { joints: ["ancien.pdf"] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Joindre" })).toBeTruthy());
    expect(screen.getByText("scan_0001.pdf").closest("li")!.textContent!.replace(/[\u202f\u00a0]/g, " ")).toBe("scan_0001.pdf · 10 h 05 · 210 KoJoindre");
    await act(() => vi.advanceTimersByTimeAsync(SUIVI_DOSSIER_MS));
    expect(m.listerDossier).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Joindre" }));
    await waitFor(() => expect(p.surDocuments).toHaveBeenCalledWith([expect.any(File)], "scan_0001.pdf"));
    cleanup();
    afficher(PRET, { joints: ["scan_0001.pdf"] });
    await waitFor(() => expect(screen.getByText("✓ Joint")).toBeTruthy());
  });
});
