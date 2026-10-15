// Fichier 39 — reçu A5 à l'écran : contenu, impression comptée (original puis duplicata), impression automatique, PDF
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecuA5 } from "@/components/recu-a5";
import type { ResultatImpression } from "@/lib/recus";
import { RECU } from "@/test/recu-exemple";
import { ImpressionRecu } from "./impression-recu";

const imprimerRecu = vi.fn<(id: string) => Promise<ResultatImpression>>();
vi.mock("../../actions", () => ({ imprimerRecu: (id: string) => imprimerRecu(id) }));
const remplacer = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: remplacer, refresh: vi.fn(), push: vi.fn() }) }));
const imprimer = vi.fn();
beforeEach(() => {
  imprimerRecu.mockReset();
  remplacer.mockReset();
  imprimer.mockReset();
  window.print = imprimer;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>';

describe("Reçu A5 (maquette)", () => {
  it("en-tête, lignes, montant en chiffres et en lettres, caissier, QR", () => {
    render(<RecuA5 recu={RECU} qrSvg={QR} mention={null} />);
    const t = n(screen.getByTestId("recu-a5").textContent);
    for (const attendu of ["République Démocratique du Congo", "Province du Sud-Kivu · Ville d'Uvira", "Commune de Mulongwe", "REÇU DE PAIEMENT",
      "13/10/2026 à 08 h 29", "MUL-REC-2026-000845", "Taux appliqué2 850 FC pour 1 $", "Neema Furaha", "Cachet du bureau", "Vérifier ce reçu"]) {
      expect(t).toContain(attendu);
    }
    expect(n(screen.getByTestId("montant-paye").textContent)).toBe("85 500 FC");
    expect(screen.getByTestId("montant-lettres").textContent).toBe("Quatre-vingt-cinq mille cinq cents francs congolais.");
    expect(screen.getByRole("img", { name: "QR code de vérification du reçu" }).innerHTML).toContain("<svg");
    expect(screen.queryByTestId("mention-duplicata")).toBeNull();
    expect(screen.queryByTestId("tampon-annule")).toBeNull();
  });
  it("duplicata et reçu annulé", () => {
    render(<RecuA5 recu={{ ...RECU, statut: "annule" }} qrSvg={QR} mention="DUPLICATA n° 2" />);
    expect(screen.getByTestId("mention-duplicata").textContent).toBe("DUPLICATA n° 2");
    expect(screen.getByTestId("tampon-annule").textContent).toBe("ANNULÉ");
  });
});

describe("Imprimer le reçu", () => {
  it("1re impression : l'original ; ensuite l'aperçu annonce le duplicata", async () => {
    imprimerRecu.mockResolvedValue({ ok: true, numero: 1 });
    render(<ImpressionRecu recu={RECU} qrSvg={QR} imprimerTout={false} />);
    expect(screen.getByTestId("etat-impressions").textContent).toBe("Pas encore imprimé : la prochaine impression sera l'original.");
    expect(screen.getByTestId("apercu-recu").querySelector("[data-testid=mention-duplicata]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer le reçu (A5)" }));
    await waitFor(() => expect(imprimer).toHaveBeenCalledTimes(1));
    expect(imprimerRecu).toHaveBeenCalledWith(RECU.id);
    // Le reçu imprimé (portail à la racine de la page) est l'original
    expect(document.querySelector(".recu-impression [data-testid=mention-duplicata]")).toBeNull();
    expect(screen.getByTestId("etat-impressions").textContent).toBe("Imprimé 1 fois : la prochaine impression portera « DUPLICATA n° 2 ».");
    expect(screen.getByTestId("apercu-recu").querySelector("[data-testid=mention-duplicata]")?.textContent).toBe("DUPLICATA n° 2");
  });

  it("réimpression : le reçu imprimé porte « DUPLICATA n° 3 »", async () => {
    imprimerRecu.mockResolvedValue({ ok: true, numero: 3 });
    render(<ImpressionRecu recu={{ ...RECU, impressions: 2 }} qrSvg={QR} imprimerTout={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer le reçu (A5)" }));
    await waitFor(() => expect(imprimer).toHaveBeenCalled());
    expect(document.querySelector(".recu-impression [data-testid=mention-duplicata]")?.textContent).toBe("DUPLICATA n° 3");
  });

  it("après l'encaissement : impression lancée une seule fois, adresse nettoyée", async () => {
    imprimerRecu.mockResolvedValue({ ok: true, numero: 1 });
    const { rerender } = render(<ImpressionRecu recu={RECU} qrSvg={QR} imprimerTout />);
    await waitFor(() => expect(imprimer).toHaveBeenCalledTimes(1));
    expect(remplacer).toHaveBeenCalledWith(`/caissier/recus/${RECU.id}`, { scroll: false });
    rerender(<ImpressionRecu recu={RECU} qrSvg={QR} imprimerTout />);
    expect(imprimerRecu).toHaveBeenCalledTimes(1);
  });

  it("refus de la base : message, pas d'impression", async () => {
    imprimerRecu.mockResolvedValue({ ok: false, message: "Reçu introuvable." });
    render(<ImpressionRecu recu={RECU} qrSvg={QR} imprimerTout={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer le reçu (A5)" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Reçu introuvable.");
    expect(imprimer).not.toHaveBeenCalled();
  });

  it("PDF : demandé en POST, compté, enregistré sous le n° du reçu", async () => {
    const appels: [string, RequestInit | undefined][] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      appels.push([url, init]);
      return new Response("%PDF", { headers: { "x-numero-impression": "2", "content-disposition": 'attachment; filename="MUL-REC-2026-000845-duplicata-2.pdf"' } });
    });
    URL.createObjectURL = vi.fn(() => "blob:recu");
    URL.revokeObjectURL = vi.fn();
    const clics: string[] = [];
    const clicOrigine = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clics.push(this.download);
    };
    try {
      render(<ImpressionRecu recu={{ ...RECU, impressions: 1 }} qrSvg={QR} imprimerTout={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Télécharger le PDF" }));
      await waitFor(() => expect(clics.length + screen.queryAllByRole("alert").length).toBeGreaterThan(0));
      expect(screen.queryByRole("alert")?.textContent ?? null).toBeNull();
      expect(clics).toEqual(["MUL-REC-2026-000845-duplicata-2.pdf"]);
      expect(appels).toEqual([[`/caissier/recus/${RECU.id}/pdf`, { method: "POST" }]]);
      expect(screen.getByTestId("etat-impressions").textContent).toContain("Imprimé 2 fois");
    } finally {
      HTMLAnchorElement.prototype.click = clicOrigine;
    }
  });

  it("reçu annulé : signalé, pas de message de paiement", () => {
    render(<ImpressionRecu recu={{ ...RECU, statut: "annule", motifAnnulation: "erreur de type" }} qrSvg={QR} imprimerTout={false} />);
    expect(screen.getByRole("alert").textContent).toBe("Reçu ANNULÉ · erreur de type : il n'a aucune valeur.");
  });
});
