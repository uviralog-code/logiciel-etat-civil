// Fichier 34 — page du téléphone (QR code) : envoi des pages, « J'ai terminé », lien expiré
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActeDuTransfert } from "@/lib/transfert-photo";
import { EnvoiTelephone } from "./envoi-telephone";

const m = vi.hoisted(() => ({
  envoyerPage: vi.fn(async () => ({ ok: true as const, numero: 1 })),
  terminerEnvoi: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/ecran-tactile", () => ({ useEcranTactile: () => true }));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({}) }));
vi.mock("@/lib/transfert-photo", async (original) => ({
  ...(await original<typeof import("@/lib/transfert-photo")>()), envoyerPage: m.envoyerPage, terminerEnvoi: m.terminerEnvoi,
}));
// La prise de vue elle-même est testée à part : ici, un bouton remet une page
vi.mock("@/components/capture-photo", () => ({
  CapturePhoto: ({ surPage, libelleAjout }: { surPage: (p: unknown) => Promise<void>; libelleAjout: string }) => (
    <button type="button" onClick={() => surPage({ jpeg: new Uint8Array([0xff, 0xd8, 0xff]), largeur: 1654, hauteur: 2339 }).catch(() => {})}>
      {libelleAjout}
    </button>
  ),
}));

beforeEach(() => Object.values(m).forEach((f) => f.mockClear()));
afterEach(cleanup);
const SECRET = "S".repeat(43);
const ACTE: ActeDuTransfert = {
  identifiant: "MUL-EXNAIS-2026-000123", typeLibelle: "Extrait d'acte de naissance", couleur: "#2E7D32", titulaire: "MUGISHO Bahati Jean",
  pages: 0, expireLe: new Date(Date.now() + 600_000).toISOString(), termine: false,
};

it("chaque page est envoyée avec le secret ; compteur ; « J'ai terminé » ferme l'envoi", async () => {
  render(<EnvoiTelephone secret={SECRET} acte={ACTE} />);
  expect(screen.getByTestId("validite-lien").textContent).toBe("Lien valable encore 10 min, pour cet acte seulement.");
  expect(screen.queryByRole("button", { name: "J'ai terminé" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Redresser et envoyer la page" }));
  await waitFor(() => expect(screen.getByTestId("pages-envoyees").textContent).toBe("✓ 1 page envoyée à l'ordinateur"));
  expect(m.envoyerPage).toHaveBeenCalledWith(expect.anything(), SECRET, expect.objectContaining({ largeur: 1654, hauteur: 2339 }));
  m.envoyerPage.mockResolvedValueOnce({ ok: true, numero: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Redresser et envoyer la page" }));
  await waitFor(() => expect(screen.getByTestId("pages-envoyees").textContent).toBe("✓ 2 pages envoyées à l'ordinateur"));
  fireEvent.click(screen.getByRole("button", { name: "J'ai terminé" }));
  await waitFor(() => expect(screen.getByTestId("envoi-termine").textContent).toMatch(/^C'est envoyé : 2 pages\.Continuez sur l'ordinateur/));
  expect(m.terminerEnvoi).toHaveBeenCalledWith(expect.anything(), SECRET);
});

it("lien déjà terminé ou expiré : plus de prise de vue", () => {
  render(<EnvoiTelephone secret={SECRET} acte={{ ...ACTE, pages: 3, termine: true }} />);
  expect(screen.getByTestId("envoi-termine").textContent).toMatch(/^C'est envoyé : 3 pages/);
  cleanup();
  render(<EnvoiTelephone secret={SECRET} acte={{ ...ACTE, expireLe: new Date(Date.now() - 1000).toISOString() }} />);
  expect(screen.getByRole("alert").textContent).toMatch(/^Ce lien a expiré/);
  expect(screen.queryByRole("button", { name: "Redresser et envoyer la page" })).toBeNull();
});
