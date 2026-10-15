// Fichier 35 — le pont scanner vu du navigateur : état, refus, scan, dossier surveillé
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADRESSE_PONT, lireEtatPont, lireFichierDossier, listerDossier, rangerFichiers, scanner, texteCarteScanner, type EtatPont } from "./pont-scanner";

const ETAT = { version: "1.0.0", naps2: true, scanners: ["HP LaserJet MFP M28w (WIA)"], scanner: "HP LaserJet MFP M28w (WIA)", dossier: "C:\\EtatCivil\\Scans", pret: true, scanEnCours: false, message: "prêt" };
const reponse = (corps: unknown, init: ResponseInit = {}) =>
  new Response(typeof corps === "string" || corps instanceof Uint8Array ? (corps as BodyInit) : JSON.stringify(corps), init);
afterEach(() => vi.unstubAllGlobals());

describe("État du pont", () => {
  it("adresse locale ; prêt ; absent ; refusé (adresse non autorisée)", async () => {
    expect(ADRESSE_PONT).toBe("http://127.0.0.1:47820");
    const f = vi.fn(async () => reponse(ETAT));
    vi.stubGlobal("fetch", f);
    expect(await lireEtatPont()).toEqual({ etat: "ok", ...ETAT });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://127.0.0.1:47820/api/etat");
    await lireEtatPont(true);
    expect((f.mock.calls[1] as unknown[])[0]).toBe("http://127.0.0.1:47820/api/etat?rafraichir=1");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await lireEtatPont()).toEqual({ etat: "absent" });
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ erreur: "Le pont n'autorise pas encore l'adresse https://x.cd." }, { status: 403 })));
    expect(await lireEtatPont()).toEqual({ etat: "refuse", message: "Le pont n'autorise pas encore l'adresse https://x.cd." });
  });

  it.each<[EtatPont | null, string, boolean]>([
    [null, "Recherche du scanner…", false],
    [{ etat: "absent" }, "Pont scanner non démarré sur cet ordinateur", false],
    [{ etat: "refuse", message: "x" }, "Pont scanner à régler (adresse non autorisée)", false],
    [{ etat: "ok", ...ETAT }, "HP LaserJet MFP M28w (WIA) · prêt", true],
    [{ etat: "ok", ...ETAT, scanEnCours: true }, "HP LaserJet MFP M28w (WIA) · scan en cours", false],
    [{ etat: "ok", ...ETAT, pret: false, scanner: null, message: "Aucun scanner trouvé : vérifiez qu'il est branché et allumé." }, "Aucun scanner trouvé : vérifiez qu'il est branché et allumé.", false],
  ])("carte « Scanner » : %j", (etat, texte, pret) => expect(texteCarteScanner(etat)).toEqual({ texte, pret }));
});

describe("Scan et dossier surveillé", () => {
  it("scan : le PDF et le nom du scanner ; échec : le message du pont", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { "X-Scanner": "HP" } })));
    const r = await scanner();
    expect([Array.from(r.pdf), r.scanner]).toEqual([[0x25, 0x50, 0x44, 0x46], "HP"]);
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ erreur: "Le scan a échoué : Bourrage papier" }, { status: 502 })));
    await expect(scanner()).rejects.toThrow("Le scan a échoué : Bourrage papier");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(scanner()).rejects.toThrow("Le pont scanner ne répond plus");
  });

  it("liste, lecture d'un fichier (nom encodé), rangement après archivage", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("/fichier") ? reponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } })
        : url.endsWith("/ranger") ? reponse({ ranges: 1 })
          : reponse({ dossier: "C:\\EtatCivil\\Scans", fichiers: [{ nom: "acte 12.jpg", taille: 3, modifie: "2026-10-14T08:00:00Z" }] }),
    );
    vi.stubGlobal("fetch", f);
    const d = await listerDossier();
    expect(d.fichiers[0].nom).toBe("acte 12.jpg");
    const fichier = await lireFichierDossier(d.fichiers[0]);
    expect([fichier.name, fichier.type, fichier.size]).toEqual(["acte 12.jpg", "image/jpeg", 3]);
    expect(f.mock.calls[1][0]).toBe("http://127.0.0.1:47820/api/dossier/fichier?nom=acte%2012.jpg");
    await rangerFichiers(["acte 12.jpg"]);
    const [url, init] = f.mock.calls[2] as unknown as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual(["http://127.0.0.1:47820/api/dossier/ranger", "POST", '{"noms":["acte 12.jpg"]}']);
    f.mockClear();
    await rangerFichiers([]);
    expect(f).not.toHaveBeenCalled();
  });
});
