// Fichier 34 — prise de vue : appareil photo, coins repérés et déplaçables, redressement, avertissement de qualité
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tailleRedressee, type Coins, type Qualite } from "@/lib/recadrage";
import { CapturePhoto } from "./capture-photo";

const BONNE: Qualite = { nettete: 230, luminosite: 230, floue: false, sombre: false };
const COINS: Coins = [{ x: 470, y: 95 }, { x: 1210, y: 170 }, { x: 1150, y: 1130 }, { x: 380, y: 1060 }];
const m = vi.hoisted(() => ({
  lirePhoto: vi.fn(async () => ({ data: new Uint8ClampedArray(1600 * 1200 * 4), width: 1600, height: 1200 })),
  chargerOpenCV: vi.fn(async (): Promise<unknown> => ({ Mat: class {} })),
  detecterCoins: vi.fn((): Coins | null => null),
  redresser: vi.fn((_i: unknown, _c: Coins, largeur: number, hauteur: number) => ({ data: new Uint8ClampedArray(4), width: largeur, height: hauteur })),
  ameliorerLisibilite: vi.fn((i: unknown) => i),
  evaluerQualite: vi.fn((): Qualite => ({ nettete: 230, luminosite: 230, floue: false, sombre: false })),
  imageVersJpeg: vi.fn(async (i: { width: number; height: number }) => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff]), largeur: i.width, hauteur: i.height })),
}));
vi.mock("@/lib/photo-navigateur", () => ({ lirePhoto: m.lirePhoto, chargerOpenCV: m.chargerOpenCV, imageVersJpeg: m.imageVersJpeg, imageVersAdresse: () => "data:image/jpeg;base64,AA==" }));
vi.mock("@/lib/recadrage", async (original) => ({
  ...(await original<typeof import("@/lib/recadrage")>()),
  detecterCoins: m.detecterCoins, redresser: m.redresser, ameliorerLisibilite: m.ameliorerLisibilite, evaluerQualite: m.evaluerQualite,
}));

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockClear());
  m.detecterCoins.mockReturnValue(COINS);
  m.evaluerQualite.mockReturnValue(BONNE);
});
afterEach(cleanup);

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "photo.jpg", { type: "image/jpeg" });
const prendre = () => fireEvent.change(screen.getByLabelText("Prendre une photo de l'acte"), { target: { files: [photo()] } });
const redresserBouton = () => screen.getByRole("button", { name: "Redresser et ajouter la page" }) as HTMLButtonElement;
const coin = (i: number) => screen.getAllByRole("button", { name: /^Coin / })[i];

describe("Sur un téléphone", () => {
  it("appareil photo (caméra arrière) et galerie ; coins repérés par OpenCV ; page redressée remise", async () => {
    const surPage = vi.fn();
    render(<CapturePhoto tactile surPage={surPage} />);
    expect(screen.getByRole("button", { name: "Prendre une photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choisir dans la galerie" })).toBeTruthy();
    expect(screen.getByLabelText("Prendre une photo de l'acte").getAttribute("capture")).toBe("environment");
    prendre();
    await waitFor(() => expect(screen.getByTestId("etat-photo").textContent).toMatch(/^Coins repérés/));
    expect(screen.getAllByRole("button", { name: /^Coin / }).map((b) => [b.getAttribute("aria-label")!.split(" (")[0], (b as HTMLElement).style.left])).toEqual([
      ["Coin haut gauche", "29.375%"], ["Coin haut droite", "75.625%"], ["Coin bas droite", "71.875%"], ["Coin bas gauche", "23.75%"],
    ]);
    fireEvent.click(redresserBouton());
    await waitFor(() => expect(surPage).toHaveBeenCalledTimes(1));
    expect(m.redresser.mock.calls[0][1]).toEqual(COINS);
    expect(m.ameliorerLisibilite).not.toHaveBeenCalled();
    expect(surPage.mock.calls[0][0]).toMatchObject(tailleRedressee(COINS)); // 758 × 966
    // Prête pour la page suivante
    await waitFor(() => expect(screen.getByRole("button", { name: "Prendre une photo" })).toBeTruthy());
  });

  it("coin déplacé au clavier ; « Améliorer la lisibilité » appliquée", async () => {
    render(<CapturePhoto tactile surPage={vi.fn()} />);
    prendre();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Coin / })).toHaveLength(4));
    fireEvent.keyDown(coin(0), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Améliorer la lisibilité/ }));
    fireEvent.click(redresserBouton());
    await waitFor(() => expect(m.redresser).toHaveBeenCalled());
    expect((m.redresser.mock.calls[0][1] as Coins)[0]).toEqual({ x: 486, y: 95 });
    expect(m.ameliorerLisibilite).toHaveBeenCalled();
  });
});

describe("Cas difficiles", () => {
  it("feuille non repérée : coins par défaut à placer à la main", async () => {
    m.detecterCoins.mockReturnValue(null);
    render(<CapturePhoto tactile surPage={vi.fn()} />);
    prendre();
    await waitFor(() => expect(screen.getByTestId("etat-photo").textContent).toMatch(/^Feuille non repérée/));
    expect(coin(0).style.left).toBe("6%");
  });

  it("OpenCV indisponible (connexion lente) : coins à la main, le redressement marche quand même", async () => {
    m.chargerOpenCV.mockRejectedValueOnce(new Error("trop lent"));
    const surPage = vi.fn();
    render(<CapturePhoto tactile surPage={surPage} />);
    prendre();
    await waitFor(() => expect(screen.getByTestId("etat-photo").textContent).toMatch(/^Outil de repérage indisponible/));
    fireEvent.click(redresserBouton());
    await waitFor(() => expect(surPage).toHaveBeenCalled());
  });

  it("photo floue : avertissement ; « Garder quand même » ou « Reprendre la photo »", async () => {
    m.evaluerQualite.mockReturnValue({ ...BONNE, nettete: 40, floue: true });
    const surPage = vi.fn();
    render(<CapturePhoto tactile surPage={surPage} />);
    prendre();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Coin / })).toHaveLength(4));
    fireEvent.click(redresserBouton());
    await waitFor(() => expect(screen.getByTestId("avertissement-qualite").textContent).toMatch(/^Photo floue : reprenez-la/));
    expect(surPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Garder quand même" }));
    await waitFor(() => expect(surPage).toHaveBeenCalledTimes(1));
  });

  it("envoi refusé (ex. lien expiré) : message, la photo reste pour réessayer", async () => {
    render(<CapturePhoto tactile surPage={vi.fn(async () => { throw new Error("Ce lien n'est plus valable."); })} />);
    prendre();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Coin / })).toHaveLength(4));
    fireEvent.click(redresserBouton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Ce lien n'est plus valable."));
    expect(screen.getAllByRole("button", { name: /^Coin / })).toHaveLength(4);
  });
});

it("sur un ordinateur : seulement « Choisir une photo sur cet ordinateur »", () => {
  render(<CapturePhoto tactile={false} surPage={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Choisir une photo sur cet ordinateur" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Prendre une photo" })).toBeNull();
});
