// Fichier 34 — « Photo par téléphone » sur l'ordinateur : QR code, pages reçues, fin d'envoi, expiration
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reception } from "@/lib/transfert-photo";
import { PhotoTelephone, SUIVI_MS } from "./photo-telephone";

const m = vi.hoisted(() => ({
  tactile: false,
  creerTransfert: vi.fn(async () => ({ ok: true as const, transfert: { id: "t1", secret: "S".repeat(43), expireLe: new Date(Date.now() + 600_000).toISOString() } })),
  recupererPages: vi.fn(async (): Promise<Reception> => ({ pages: [], termine: false, expire: false })),
  toDataURL: vi.fn(async (adresse: string) => `data:image/png;base64,${adresse.length}`),
}));
vi.mock("@/lib/ecran-tactile", () => ({ useEcranTactile: () => m.tactile }));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({}) }));
vi.mock("@/lib/transfert-photo", async (original) => ({
  ...(await original<typeof import("@/lib/transfert-photo")>()), creerTransfert: m.creerTransfert, recupererPages: m.recupererPages,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: m.toDataURL } }));
vi.mock("@/components/capture-photo", () => ({
  CapturePhoto: ({ tactile }: { tactile: boolean }) => <p data-testid="capture">capture {tactile ? "téléphone" : "ordinateur"}</p>,
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  m.tactile = false;
  Object.values(m).forEach((f) => typeof f === "function" && f.mockClear());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const page = (numero: number) => ({ numero, jpeg: new Uint8Array([0xff, 0xd8, 0xff, numero]), largeur: 1654, hauteur: 2339 });
const tour = () => act(() => vi.advanceTimersByTimeAsync(SUIVI_MS));

describe("Sur l'ordinateur", () => {
  it("QR code vers la page du téléphone (sans mot de passe), valable 10 minutes ; les pages reçues rejoignent l'aperçu", async () => {
    const surPage = vi.fn();
    render(<PhotoTelephone acteId="a1" occupe={false} surPage={surPage} />);
    await act(async () => {});
    expect(m.creerTransfert).toHaveBeenCalledWith(expect.anything(), "a1");
    expect(m.toDataURL.mock.calls[0][0]).toBe(`${window.location.origin}/photo/${"S".repeat(43)}`);
    expect(screen.getByRole("img", { name: /QR code/ })).toBeTruthy();
    expect(screen.getByTestId("etat-telephone").textContent).toBe("QR code valable encore 10 min, pour cet acte seulement.");

    m.recupererPages.mockResolvedValueOnce({ pages: [page(1), page(2)], termine: false, expire: false });
    await tour();
    expect(surPage.mock.calls.map((c) => c[0].jpeg[3])).toEqual([1, 2]);
    expect(screen.getByTestId("etat-telephone").textContent).toBe("2 pages reçues du téléphone. QR code valable encore 10 min, pour cet acte seulement.");

    m.recupererPages.mockResolvedValueOnce({ pages: [page(3)], termine: true, expire: false });
    await tour();
    expect(surPage).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("etat-telephone").textContent).toBe("3 pages reçues du téléphone. Le téléphone a terminé l'envoi.");
    // Plus de vérification une fois terminé
    m.recupererPages.mockClear();
    await tour();
    expect(m.recupererPages).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nouveau QR code" })).toBeTruthy();
  });

  it("QR code expiré : un nouveau sur demande", async () => {
    m.creerTransfert.mockResolvedValueOnce({ ok: true, transfert: { id: "t0", secret: "E".repeat(43), expireLe: new Date(Date.now() + 2000).toISOString() } });
    render(<PhotoTelephone acteId="a1" occupe={false} surPage={vi.fn()} />);
    await act(async () => {});
    await tour();
    expect(screen.getByTestId("etat-telephone").textContent).toBe("Ce QR code a expiré.");
    fireEvent.click(screen.getByRole("button", { name: "Nouveau QR code" }));
    await act(async () => {});
    expect(m.creerTransfert).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("etat-telephone").textContent).toMatch(/^QR code valable encore/);
  });

  it("acte pas encore payé : le refus de la base est affiché", async () => {
    m.creerTransfert.mockResolvedValueOnce({ ok: false, message: "L'acte n'est pas encore payé." } as never);
    render(<PhotoTelephone acteId="a1" occupe={false} surPage={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toBe("L'acte n'est pas encore payé.");
  });
});

it("Officier connecté sur un téléphone : l'appareil photo directement, pas de QR code", () => {
  m.tactile = true;
  render(<PhotoTelephone acteId="a1" occupe={false} surPage={vi.fn()} />);
  expect(screen.getByTestId("capture").textContent).toBe("capture téléphone");
  expect(m.creerTransfert).not.toHaveBeenCalled();
  expect(screen.queryByTestId("qr-telephone")).toBeNull();
});
