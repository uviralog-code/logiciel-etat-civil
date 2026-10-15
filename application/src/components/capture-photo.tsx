"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { chargerOpenCV, imageVersAdresse, imageVersJpeg, lirePhoto } from "@/lib/photo-navigateur";
import {
  ameliorerLisibilite, coinsParDefaut, deplacerCoin, detecterCoins, evaluerQualite, messageQualite, redresser, tailleRedressee,
  type Coins, type ImageRgba,
} from "@/lib/recadrage";
import type { PagePhoto } from "@/lib/transfert-photo";

type Etat = "repos" | "lecture" | "recherche" | "trouve" | "pas-trouve" | "sans-outil" | "redressement" | "envoi";
const MESSAGES: Partial<Record<Etat, string>> = {
  lecture: "Lecture de la photo…",
  recherche: "Recherche des bords de la feuille…",
  trouve: "Coins repérés : vérifiez qu'ils sont sur les 4 angles de la feuille, déplacez-les au besoin.",
  "pas-trouve": "Feuille non repérée : placez les 4 coins orange sur les 4 angles de la feuille.",
  "sans-outil": "Outil de repérage indisponible (connexion lente) : placez les 4 coins orange à la main.",
  redressement: "Redressement de la page…",
  envoi: "Envoi de la page…",
};
const NOMS_COINS = ["haut gauche", "haut droite", "bas droite", "bas gauche"];
const boutonPrincipal = "h-12 rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:opacity-50";
const boutonSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-5 font-semibold text-encre hover:bg-bleu-clair disabled:opacity-50";

/**
 * Prise de vue d'un acte (fichier 34) : appareil photo du téléphone (ou photo
 * déjà prise), repérage des 4 coins de la feuille (OpenCV, méthode de
 * jscanify), coins déplaçables au doigt, redressement, avertissement si la
 * page est floue ou trop sombre. Chaque page prête est remise à `surPage`.
 */
export function CapturePhoto({
  tactile,
  occupe = false,
  libelleAjout = "Redresser et ajouter la page",
  surPage,
}: {
  /** Téléphone : boutons « Prendre une photo » et « Choisir dans la galerie ». */
  tactile: boolean;
  occupe?: boolean;
  libelleAjout?: string;
  /** Reçoit la page redressée ; peut échouer avec un message (ex. envoi impossible). */
  surPage: (page: PagePhoto) => Promise<void> | void;
}) {
  const ids = useId();
  const appareil = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  const [photo, setPhoto] = useState<{ image: ImageRgba; apercu: string } | null>(null);
  const [coins, setCoins] = useState<Coins | null>(null);
  const [etat, setEtat] = useState<Etat>("repos");
  const [ameliorer, setAmeliorer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<number | null>(null);
  /** Page redressée mais jugée floue ou sombre : l'officier choisit de la garder ou non. */
  const [avertie, setAvertie] = useState<{ page: PagePhoto; message: string } | null>(null);

  async function choisirPhoto(fichier: File | undefined) {
    if (!fichier) return;
    const g = ++generation.current;
    setErreur(null);
    setAvertie(null);
    setEtat("lecture");
    try {
      const image = await lirePhoto(fichier);
      if (g !== generation.current) return;
      setPhoto({ image, apercu: imageVersAdresse(image) });
      setCoins(coinsParDefaut(image.width, image.height));
      setEtat("recherche");
      try {
        const cv = await chargerOpenCV();
        const trouves = detecterCoins(cv, image);
        if (g !== generation.current) return;
        if (trouves) setCoins(trouves);
        setEtat(trouves ? "trouve" : "pas-trouve");
      } catch {
        if (g === generation.current) setEtat("sans-outil");
      }
    } catch {
      if (g !== generation.current) return;
      setErreur("Cette photo ne peut pas être lue. Reprenez la photo.");
      setEtat("repos");
    } finally {
      if (appareil.current) appareil.current.value = "";
      if (galerie.current) galerie.current.value = "";
    }
  }

  function recommencer() {
    generation.current++;
    setPhoto(null);
    setCoins(null);
    setAvertie(null);
    setEtat("repos");
    setErreur(null);
  }

  async function remettre(page: PagePhoto) {
    setEtat("envoi");
    try {
      await surPage(page);
      recommencer();
    } catch (e) {
      setErreur((e as Error).message);
      setEtat("trouve");
    }
  }

  async function redresserEtAjouter() {
    if (!photo || !coins) return;
    setErreur(null);
    setEtat("redressement");
    // Laisser l'écran afficher « Redressement… » avant le calcul
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { largeur, hauteur } = tailleRedressee(coins);
      let image = redresser(photo.image, coins, largeur, hauteur);
      if (ameliorer) image = ameliorerLisibilite(image);
      const page = await imageVersJpeg(image);
      const message = messageQualite(evaluerQualite(image));
      if (message) {
        setAvertie({ page, message });
        setEtat("trouve");
        return;
      }
      await remettre(page);
    } catch (e) {
      setErreur(`La page n'a pas pu être redressée (${(e as Error).message}). Vérifiez les 4 coins.`);
      setEtat("pas-trouve");
    }
  }

  // Coins déplacés au doigt (ou à la souris), puis au clavier
  const versImage = (e: PointerEvent) => {
    const r = zone.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * photo!.image.width, y: ((e.clientY - r.top) / r.height) * photo!.image.height };
  };
  const deplacer = (i: number, p: { x: number; y: number }) => {
    setAvertie(null);
    setCoins((c) => (c && photo ? deplacerCoin(c, i, p, photo.image.width, photo.image.height) : c));
  };
  const auClavier = (i: number, e: KeyboardEvent) => {
    const pas = (photo?.image.width ?? 1000) / 100;
    const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key];
    if (!d || !coins) return;
    e.preventDefault();
    deplacer(i, { x: coins[i].x + d[0], y: coins[i].y + d[1] });
  };

  const travail = etat === "lecture" || etat === "redressement" || etat === "envoi";

  return (
    <div className="flex flex-col gap-4" data-testid="capture-photo">
      {!photo && (
        <div className="flex flex-wrap gap-3">
          {tactile ? (
            <>
              <button type="button" className={boutonPrincipal} disabled={occupe || travail} onClick={() => appareil.current?.click()}>
                Prendre une photo
              </button>
              <button type="button" className={boutonSecondaire} disabled={occupe || travail} onClick={() => galerie.current?.click()}>
                Choisir dans la galerie
              </button>
            </>
          ) : (
            <button type="button" className={boutonSecondaire} disabled={occupe || travail} onClick={() => galerie.current?.click()}>
              Choisir une photo sur cet ordinateur
            </button>
          )}
        </div>
      )}
      <input
        ref={appareil}
        id={`${ids}-appareil`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Prendre une photo de l'acte"
        onChange={(e) => choisirPhoto(e.target.files?.[0])}
      />
      <input
        ref={galerie}
        id={`${ids}-galerie`}
        type="file"
        accept="image/jpeg,image/png,image/*"
        className="sr-only"
        aria-label="Choisir une photo de l'acte"
        onChange={(e) => choisirPhoto(e.target.files?.[0])}
      />

      {erreur && (
        <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
          {erreur}
        </p>
      )}
      {MESSAGES[etat] && (
        <p
          role="status"
          className={`text-[17px] ${etat === "trouve" ? "text-succes-texte" : etat === "pas-trouve" || etat === "sans-outil" ? "font-semibold text-attention-texte" : ""}`}
          data-testid="etat-photo"
        >
          {MESSAGES[etat]}
        </p>
      )}

      {photo && coins && (
        <>
          <div className="flex justify-center rounded-lg bg-[#2b2f36] p-3">
            <div ref={zone} className="relative inline-block touch-none select-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- photo prise par l'officier */}
              <img src={photo.apercu} alt="Photo de l'acte à recadrer" draggable={false} className="block max-h-[65vh] max-w-full" />
              <svg viewBox={`0 0 ${photo.image.width} ${photo.image.height}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
                <polygon
                  points={coins.map((c) => `${c.x},${c.y}`).join(" ")}
                  fill="rgba(255,152,0,0.18)"
                  stroke="#ff9800"
                  strokeWidth={Math.max(photo.image.width, photo.image.height) / 220}
                  data-testid="cadre-feuille"
                />
              </svg>
              {coins.map((c, i) => (
                <button
                  key={NOMS_COINS[i]}
                  type="button"
                  aria-label={`Coin ${NOMS_COINS[i]} (flèches du clavier pour le déplacer)`}
                  data-coin={i}
                  disabled={travail}
                  className={`absolute size-11 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-[#ff9800] ${glisse === i ? "bg-[#ff9800]/60" : "bg-white/50"}`}
                  style={{ left: `${(c.x / photo.image.width) * 100}%`, top: `${(c.y / photo.image.height) * 100}%` }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setGlisse(i);
                  }}
                  onPointerMove={(e) => glisse === i && deplacer(i, versImage(e))}
                  onPointerUp={() => setGlisse(null)}
                  onPointerCancel={() => setGlisse(null)}
                  onKeyDown={(e) => auClavier(i, e)}
                />
              ))}
            </div>
          </div>
          <label className="flex items-start gap-3 text-[17px]">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={ameliorer}
              onChange={(e) => {
                setAmeliorer(e.target.checked);
                setAvertie(null);
              }}
              disabled={travail}
            />
            <span>
              <strong>Améliorer la lisibilité</strong> — fond plus clair si la photo est sombre (les couleurs des cachets sont gardées)
            </span>
          </label>

          {avertie ? (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-attention-texte" data-testid="avertissement-qualite">
              <p className="font-semibold">{avertie.message}</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={boutonSecondaire} onClick={recommencer} disabled={travail}>
                  Reprendre la photo
                </button>
                <button type="button" className={boutonSecondaire} onClick={() => remettre(avertie.page)} disabled={occupe || travail}>
                  Garder quand même
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={boutonPrincipal} onClick={redresserEtAjouter} disabled={occupe || travail || etat === "recherche"}>
                {libelleAjout}
              </button>
              <button type="button" className={boutonSecondaire} onClick={recommencer} disabled={travail}>
                Reprendre la photo
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
