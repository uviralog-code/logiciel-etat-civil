"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import {
  analyserPages, numeroDepuisNomFichier, numeroSuivant, pagesSuivantes, validerAncien, verifierEmpreinteEntite,
  type ActeDuLot, type SaisieAncien,
} from "@/lib/anciens-registres";
import { assemblerPdf, controlerFichier, empreinteSha256, formaterTaille, TAILLE_MAXIMUM } from "@/lib/archivage";
import { envoyerScan } from "@/lib/envoi-reprenable";
import { idPrevu } from "@/lib/nouvel-acte";
import { lireEtatPont, scanner, texteCarteScanner, type EtatPont } from "@/lib/pont-scanner";
import { compresserImage, compterPages, dessinerPage } from "@/lib/scan-navigateur";
import { cheminPrevu } from "@/lib/scans";
import { configurationSupabase } from "@/lib/supabase/configuration";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import { ajouterAncien, archiverAncien, fermerLeLot } from "../actions";
import { annoncerNombreActes } from "./compteur-lot";

export interface LotAffiche {
  id: string;
  ouvert: boolean;
  annee: number;
  modele: string;
  typeCode: string;
  typeLibelle: string;
  codeEntite: string;
  noms: { titulaire: string; titulaire2: string | null };
}

type Source = "scanner" | "fichiers" | "registre";
type Document = { octets: Uint8Array; empreinte: string };
type Envoi = { etat: "repos" } | { etat: "travail"; texte: string; pourcentage?: number };

const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte disabled:bg-[#f2f4f7]";
const boutonPrincipal = "h-12 rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:opacity-50";
const boutonSecondaire = "h-11 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair disabled:opacity-50";
const VIDE: SaisieAncien = { titulaire: "", titulaire2: "", date: "", numero: "" };

/** Un fichier choisi (PDF, JPEG ou PNG) → le PDF de l'acte. */
async function pdfDepuisFichier(f: File): Promise<Uint8Array> {
  const octets = new Uint8Array(await f.arrayBuffer());
  const c = controlerFichier({ nom: f.name, taille: f.size, debut: octets.subarray(0, 8) });
  if (!c.ok) throw new Error(c.message);
  if (c.genre === "pdf") {
    await compterPages(octets); // refuse un PDF protégé ou abîmé
    return octets;
  }
  const photo = await compresserImage(octets, c.genre === "png" ? "image/png" : "image/jpeg");
  return assemblerPdf([{ genre: "image", source: 0, largeur: photo.largeur, hauteur: photo.hauteur, rotation: 0 }], [photo.jpeg]);
}

/**
 * Import en lot (maquette « Officier — Import en lot ») : l'acte suivant du
 * registre (nom(s), date, n°), son document (scanner du bureau, plusieurs
 * fichiers, ou un PDF du registre entier découpé), une case « le document
 * correspond », puis l'acte est créé et son scan archivé dans le lot.
 */
export function ImportLot({ lot, actes, dernierNumero, aujourdhui }: { lot: LotAffiche; actes: ActeDuLot[]; dernierNumero: number; aujourdhui: string }) {
  const ids = useId();
  const choixFichiers = useRef<HTMLInputElement>(null);
  const choixRegistre = useRef<HTMLInputElement>(null);
  const choixManquant = useRef<HTMLInputElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);

  const [liste, setListe] = useState(actes);
  const [numeroOrdre, setNumeroOrdre] = useState(dernierNumero);
  const [source, setSource] = useState<Source>("fichiers");
  const [pont, setPont] = useState<EtatPont | null>(null);
  const [saisie, setSaisie] = useState<SaisieAncien>({ ...VIDE, numero: numeroSuivant(actes[0]?.numeroRegistre) });
  const [coche, setCoche] = useState(false);
  const [file, setFile] = useState<File[]>([]);
  const [registre, setRegistre] = useState<{ nom: string; octets: Uint8Array; total: number } | null>(null);
  const [pagesTexte, setPagesTexte] = useState("");
  const [document, setDocument] = useState<Document | null>(null);
  const [doublon, setDoublon] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<Envoi>({ etat: "repos" });
  const [erreur, setErreur] = useState<{ message: string; champ?: keyof SaisieAncien | "coche" | "pages" } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reessai, setReessai] = useState<{ acte: { id: string; identifiant: string }; octets: Uint8Array } | null>(null);
  const [cibleManquant, setCibleManquant] = useState<string | null>(null);
  const [fermeture, setFermeture] = useState(false);
  const [erreurFermeture, setErreurFermeture] = useState<string | null>(null);

  const occupe = envoi.etat !== "repos";

  // Le bandeau (« 37 actes numérisés dans ce lot ») suit la saisie
  useEffect(() => {
    annoncerNombreActes(lot.id, liste.length);
  }, [lot.id, liste.length]);
  const manquants = liste.filter((a) => !a.scanne);

  // Le scanner du bureau (fichier 35) : s'il est prêt, il est proposé d'office
  useEffect(() => {
    lireEtatPont().then((e) => {
      setPont(e);
      if (e.etat === "ok" && e.pret) setSource((s) => (s === "fichiers" ? "scanner" : s));
    });
  }, []);

  // Le document de l'acte en cours (fichier en tête de file, ou pages du registre) : préparé, vérifié, montré
  const generation = useRef(0);
  async function preparer(octets: Promise<Uint8Array> | null) {
    const g = ++generation.current;
    setDocument(null);
    setDoublon(null);
    if (!octets) return;
    try {
      const pdf = await octets;
      const empreinte = await empreinteSha256(pdf);
      if (g !== generation.current) return;
      setDocument({ octets: pdf, empreinte });
      const message = await verifierEmpreinteEntite(creerClientNavigateur(), empreinte).catch(() => null);
      if (g === generation.current) setDoublon(message);
    } catch (e) {
      if (g === generation.current) setErreur({ message: (e as Error).message });
    }
  }
  useEffect(() => {
    if (!document || !toile.current) return;
    let perime = false;
    dessinerPage(document.octets, 1, 300)
      .then((dessin) => {
        const ecran = toile.current;
        if (perime || !ecran) return;
        ecran.width = dessin.width;
        ecran.height = dessin.height;
        ecran.style.width = `${Math.round(dessin.width / Math.min(2, window.devicePixelRatio || 1))}px`;
        ecran.getContext("2d")?.drawImage(dessin, 0, 0);
      })
      .catch(() => {});
    return () => {
      perime = true;
    };
  }, [document]);

  function choisirSource(s: Source) {
    setSource(s);
    setErreur(null);
    if (s === "scanner") preparer(null);
    if (s === "fichiers") preparer(file[0] ? pdfDepuisFichier(file[0]) : null);
    if (s === "registre") changerPages(pagesTexte);
  }

  function prendreFichiers(liste: FileList | null) {
    const nouveaux = Array.from(liste ?? []);
    if (choixFichiers.current) choixFichiers.current.value = "";
    if (!nouveaux.length) return;
    const tous = [...file, ...nouveaux];
    setFile(tous);
    if (file.length === 0) {
      const n = numeroDepuisNomFichier(tous[0].name, lot.annee);
      if (n) setSaisie((s) => ({ ...s, numero: n }));
      preparer(pdfDepuisFichier(tous[0]));
    }
  }

  async function prendreRegistre(f: File | undefined) {
    if (choixRegistre.current) choixRegistre.current.value = "";
    if (!f) return;
    setErreur(null);
    try {
      const octets = new Uint8Array(await f.arrayBuffer());
      const c = controlerFichier({ nom: f.name, taille: f.size, debut: octets.subarray(0, 8) });
      if (!c.ok) throw new Error(c.message);
      if (c.genre !== "pdf") throw new Error("Le registre entier doit être un seul PDF.");
      const total = await compterPages(octets);
      setRegistre({ nom: f.name, octets, total });
      const p = pagesSuivantes(null, total);
      setPagesTexte(p);
      changerPages(p, { octets, total });
    } catch (e) {
      setErreur({ message: (e as Error).message });
    }
  }

  function changerPages(texte: string, r: { octets: Uint8Array; total: number } | null = registre) {
    setPagesTexte(texte);
    if (!r) return preparer(null);
    const a = analyserPages(texte, r.total);
    if (!a.ok) return preparer(null);
    preparer(assemblerPdf(a.pages.map((page) => ({ genre: "pdf" as const, source: 0, page, rotation: 0 as const })), [r.octets]));
  }

  // Envoi du PDF de l'acte puis enregistrement de son scan dans le lot
  async function joindreScan(acte: { id: string; identifiant: string }, octets: Uint8Array) {
    const supabase = creerClientNavigateur();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Votre session a expiré : reconnectez-vous.");
    const { url, clePublique } = configurationSupabase();
    setEnvoi({ etat: "travail", texte: `Envoi du scan de ${acte.identifiant}…`, pourcentage: 0 });
    await envoyerScan({
      url, clePublique, jeton: data.session.access_token, chemin: await cheminPrevu(supabase, acte.id), octets, empreinte: await empreinteSha256(octets),
      surProgression: (e, t) => setEnvoi({ etat: "travail", texte: `Envoi du scan de ${acte.identifiant}…`, pourcentage: Math.round((100 * e) / t) }),
    });
    setEnvoi({ etat: "travail", texte: "Vérification et archivage…" });
    const r = await archiverAncien(acte.id, lot.id);
    if (!r.ok) throw new Error(r.message);
    setListe((l) => l.map((a) => (a.id === acte.id ? { ...a, scanne: true } : a)));
  }

  async function enregistrer() {
    setErreur(null);
    setInfo(null);
    setReessai(null);
    const v = validerAncien(saisie, { annee_registre: lot.annee, modele_fiche: lot.modele }, aujourdhui);
    if (!v.ok) return setErreur(v);
    if (!coche) return setErreur({ message: "Cochez « le document correspond » après l'avoir vérifié.", champ: "coche" });
    if (source === "registre") {
      const a = registre ? analyserPages(pagesTexte, registre.total) : ({ ok: false, message: "Choisissez le PDF du registre." } as const);
      if (!a.ok) return setErreur({ message: a.message, champ: "pages" });
    }

    let octets: Uint8Array;
    try {
      if (source === "scanner") {
        setEnvoi({ etat: "travail", texte: "Scan en cours… ne soulevez pas le capot." });
        octets = (await scanner()).pdf;
      } else {
        if (!document) throw new Error(source === "fichiers" ? "Choisissez les fichiers à importer." : "Choisissez le PDF du registre et les pages de cet acte.");
        octets = document.octets;
      }
      if (octets.length > TAILLE_MAXIMUM) throw new Error(`Le document fait ${formaterTaille(octets.length)} : 15 Mo au plus.`);
      // Le même fichier déjà archivé ? On ne crée pas l'acte pour rien.
      const dejaVu = await verifierEmpreinteEntite(creerClientNavigateur(), await empreinteSha256(octets));
      if (dejaVu) throw new Error(dejaVu);
    } catch (e) {
      setEnvoi({ etat: "repos" });
      return setErreur({ message: (e as Error).message });
    }

    setEnvoi({ etat: "travail", texte: "Enregistrement de l'acte…" });
    const r = await ajouterAncien(lot.id, saisie);
    if (!r.ok) {
      setEnvoi({ etat: "repos" });
      return setErreur({ message: r.message, champ: r.champ });
    }
    const nouvel: ActeDuLot = {
      id: r.acte.id, identifiant: r.acte.identifiant, titulaire: saisie.titulaire.trim(), titulaire2: saisie.titulaire2.trim() || null,
      numeroRegistre: saisie.numero.trim(), dateActe: saisie.date, numeroOrdre: numeroOrdre + 1, scanne: false,
    };
    setListe((l) => [nouvel, ...l]);
    setNumeroOrdre((n) => n + 1);
    try {
      await joindreScan(r.acte, octets);
      setInfo(`${r.acte.identifiant} enregistré et archivé (reg. n° ${saisie.numero.trim()}).`);
    } catch (e) {
      setReessai({ acte: r.acte, octets });
      setErreur({ message: `L'acte ${r.acte.identifiant} est enregistré, mais son scan n'a pas pu être joint : ${(e as Error).message}` });
    }
    setEnvoi({ etat: "repos" });

    // Acte suivant : même date (souvent proche), n° suivant, document suivant
    setCoche(false);
    setSaisie({ ...VIDE, date: saisie.date, numero: numeroSuivant(saisie.numero) });
    if (source === "fichiers") {
      const reste = file.slice(1);
      setFile(reste);
      const n = reste[0] ? numeroDepuisNomFichier(reste[0].name, lot.annee) : "";
      if (n) setSaisie((s) => ({ ...s, numero: n }));
      preparer(reste[0] ? pdfDepuisFichier(reste[0]) : null);
    }
    if (source === "registre" && registre) {
      const a = analyserPages(pagesTexte, registre.total);
      const pages = a.ok ? a.pages : null;
      changerPages(pagesSuivantes(pages, registre.total));
    }
  }

  async function reessayerEnvoi() {
    if (!reessai) return;
    setErreur(null);
    try {
      await joindreScan(reessai.acte, reessai.octets);
      setInfo(`${reessai.acte.identifiant} : scan archivé.`);
      setReessai(null);
    } catch (e) {
      setErreur({ message: `Le scan de ${reessai.acte.identifiant} n'a toujours pas pu être joint : ${(e as Error).message}` });
    }
    setEnvoi({ etat: "repos" });
  }

  async function joindreManquant(f: File | undefined) {
    if (choixManquant.current) choixManquant.current.value = "";
    const acte = liste.find((a) => a.id === cibleManquant);
    setCibleManquant(null);
    if (!f || !acte) return;
    setErreur(null);
    try {
      const octets = await pdfDepuisFichier(f);
      const dejaVu = await verifierEmpreinteEntite(creerClientNavigateur(), await empreinteSha256(octets));
      if (dejaVu) throw new Error(dejaVu);
      await joindreScan(acte, octets);
      setInfo(`${acte.identifiant} : scan archivé.`);
      if (reessai?.acte.id === acte.id) setReessai(null);
    } catch (e) {
      setErreur({ message: `${acte.identifiant} : ${(e as Error).message}` });
    }
    setEnvoi({ etat: "repos" });
  }

  async function fermer() {
    setErreurFermeture(null);
    const r = await fermerLeLot(lot.id);
    if (!r.ok) setErreurFermeture(r.message);
  }

  const changer = (champ: keyof SaisieAncien) => (e: { target: { value: string } }) => setSaisie((s) => ({ ...s, [champ]: e.target.value }));
  const carteScanner = texteCarteScanner(pont);
  const libelleBouton = source === "scanner" ? "Scanner et enregistrer" : source === "fichiers" ? "Enregistrer et passer au suivant" : "Enregistrer cet acte";
  const idSuivant = idPrevu(lot.codeEntite, lot.typeCode, lot.annee, numeroOrdre);

  const listeActes = (
    <section aria-labelledby={`${ids}-derniers`} className="overflow-hidden rounded-[10px] border border-bordure bg-surface">
      <h2 id={`${ids}-derniers`} className="px-5 py-[18px] text-xl font-bold">
        {lot.ouvert ? "Derniers ajoutés" : "Actes du lot"}
      </h2>
      {liste.length === 0 ? (
        <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun acte pour l&apos;instant.</p>
      ) : (
        <ul data-testid="derniers-ajoutes">
          {(lot.ouvert ? liste.slice(0, 8) : liste).map((a) => (
            <li key={a.id} data-acte={a.identifiant} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0f5] px-5 py-3">
              <span className="font-mono text-[15px] font-semibold">{a.identifiant}</span>
              <span className={a.scanne ? "" : "font-semibold text-attention-texte"}>
                Reg. n° {a.numeroRegistre}
                {!a.scanne && " · scan manquant"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!lot.ouvert) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <p role="note" className="rounded-lg bg-[#eef1f6] px-4 py-3 text-[17px]">
          Ce lot est fermé : il n&apos;accepte plus aucun acte. Ses actes se retrouvent par la recherche (nom ou n° du registre).
        </p>
        {listeActes}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-labelledby={`${ids}-titre`} className="flex min-w-0 flex-col gap-5 rounded-[10px] border border-bordure bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h2 id={`${ids}-titre`} className="font-serif text-[26px] font-bold">
            Ajouter l&apos;acte suivant du registre
          </h2>
          <p className="text-texte-doux">
            Type imposé par le lot : <strong className="text-encre">{lot.typeLibelle.charAt(0).toLowerCase() + lot.typeLibelle.slice(1)} ({lot.typeCode})</strong>,
            année <strong className="text-encre">{lot.annee}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Document de l'acte">
          {(
            [
              ["scanner", "Scanner du bureau"],
              ["fichiers", "Plusieurs fichiers"],
              ["registre", "Registre entier (un PDF)"],
            ] as const
          ).map(([s, libelle]) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => choisirSource(s)}
              disabled={occupe}
              className={`h-11 rounded-full border px-4 font-semibold ${source === s ? "border-bleu-etat bg-bleu-clair text-bleu-etat" : "border-bordure-champ bg-surface text-encre hover:bg-bleu-clair"}`}
            >
              {libelle}
            </button>
          ))}
        </div>

        {source === "scanner" && (
          <p className={`text-[15px] ${carteScanner.pret ? "text-succes-texte" : "font-semibold text-attention-texte"}`} data-testid="etat-scanner-lot">
            {carteScanner.pret ? `${carteScanner.texte} — posez l'acte sur la vitre, puis « Scanner et enregistrer ».` : `${carteScanner.texte}. Utilisez « Plusieurs fichiers » ou « Registre entier ».`}
          </p>
        )}
        {source === "fichiers" && (
          <div className="flex flex-wrap items-center gap-3" data-testid="file-fichiers">
            <button type="button" className={boutonSecondaire} onClick={() => choixFichiers.current?.click()} disabled={occupe}>
              {file.length ? "Ajouter d'autres fichiers" : "Importer plusieurs fichiers"}
            </button>
            <span className="text-[15px] text-texte-doux">
              {file.length
                ? `Fichier en cours : ${file[0].name} · ${file.length - 1} autre(s) en attente`
                : "Un fichier par acte (PDF, JPEG ou PNG). Le n° est lu dans le nom du fichier s'il y figure (ex. « 412.pdf »)."}
            </span>
          </div>
        )}
        {source === "registre" && (
          <div className="flex flex-wrap items-end gap-3" data-testid="registre-entier">
            <button type="button" className={boutonSecondaire} onClick={() => choixRegistre.current?.click()} disabled={occupe}>
              {registre ? "Autre PDF du registre" : "Choisir le PDF du registre"}
            </button>
            {registre && (
              <>
                <span className="self-center text-[15px] text-texte-doux">
                  {registre.nom} · {registre.total} pages
                </span>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${ids}-pages`} className="text-[15px] font-semibold">
                    Pages de cet acte
                  </label>
                  <input
                    id={`${ids}-pages`}
                    value={pagesTexte}
                    onChange={(e) => changerPages(e.target.value)}
                    placeholder="ex. 3-4"
                    className={`${classeChamp} w-32`}
                    aria-invalid={erreur?.champ === "pages" || undefined}
                    disabled={occupe}
                  />
                </div>
              </>
            )}
          </div>
        )}
        <input ref={choixFichiers} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Fichiers des actes (un par acte)" onChange={(e) => prendreFichiers(e.target.files)} />
        <input ref={choixRegistre} type="file" accept="application/pdf" className="sr-only" aria-label="PDF du registre entier" onChange={(e) => prendreRegistre(e.target.files?.[0])} />

        {document && source !== "scanner" && (
          <div className="flex justify-center rounded-lg bg-[#e9edf3] p-3">
            <canvas ref={toile} className="max-w-full bg-white shadow-md" data-testid="apercu-acte" role="img" aria-label="Première page du document de l'acte" />
          </div>
        )}
        {doublon && source !== "scanner" && (
          <p role="alert" className="rounded-lg border border-[#e8a3a3] bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="doublon-lot">
            {doublon}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-titulaire`} className="font-semibold">
            {lot.noms.titulaire}
          </label>
          <input id={`${ids}-titulaire`} value={saisie.titulaire} onChange={changer("titulaire")} className={classeChamp} aria-invalid={erreur?.champ === "titulaire" || undefined} disabled={occupe} autoComplete="off" />
        </div>
        {lot.noms.titulaire2 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-titulaire2`} className="font-semibold">
              {lot.noms.titulaire2}
            </label>
            <input id={`${ids}-titulaire2`} value={saisie.titulaire2} onChange={changer("titulaire2")} className={classeChamp} aria-invalid={erreur?.champ === "titulaire2" || undefined} disabled={occupe} autoComplete="off" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${ids}-date`} className="font-semibold">
              Date de l&apos;acte dans le registre
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              min={`${lot.annee}-01-01`}
              max={`${lot.annee}-12-31` > aujourdhui ? aujourdhui : `${lot.annee}-12-31`}
              value={saisie.date}
              onChange={changer("date")}
              className={classeChamp}
              aria-invalid={erreur?.champ === "date" || undefined}
              disabled={occupe}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${ids}-numero`} className="font-semibold">
              N° dans le registre papier
            </label>
            <input id={`${ids}-numero`} value={saisie.numero} onChange={changer("numero")} placeholder="ex. 412" className={classeChamp} aria-invalid={erreur?.champ === "numero" || undefined} disabled={occupe} autoComplete="off" />
          </div>
        </div>

        <label className={`flex items-start gap-3 rounded-lg px-3 py-2 text-[17px] ${erreur?.champ === "coche" ? "bg-erreur-fond" : "bg-[#f4f6fa]"}`}>
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#2e7d32]" checked={coche} onChange={(e) => setCoche(e.target.checked)} disabled={occupe} />
          <span>
            Le document correspond : c&apos;est bien l&apos;acte <strong>n° {saisie.numero.trim() || "…"}</strong> au nom de{" "}
            <strong>{[saisie.titulaire.trim(), saisie.titulaire2.trim()].filter(Boolean).join(" et ") || "…"}</strong>, et il est lisible.
          </span>
        </label>

        {erreur && (
          <div role="alert" className="flex flex-col gap-2 rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="erreur-lot">
            <span>{erreur.message}</span>
            {reessai && (
              <button type="button" className={`${boutonSecondaire} self-start`} onClick={reessayerEnvoi} disabled={occupe}>
                Réessayer l&apos;envoi du scan
              </button>
            )}
          </div>
        )}
        {info && (
          <p role="status" className="rounded-lg border border-[#a7d3b1] bg-succes-fond px-4 py-3 font-semibold text-succes-texte" data-testid="info-lot">
            ✓ {info}
          </p>
        )}
        {envoi.etat === "travail" && (
          <div role="status" className="flex flex-col gap-2">
            <span className="font-semibold">{envoi.texte}</span>
            {envoi.pourcentage !== undefined && <progress max={100} value={envoi.pourcentage} className="h-2 w-full" aria-label="Progression de l'envoi" />}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" className={boutonPrincipal} onClick={enregistrer} disabled={occupe || (source === "scanner" && !carteScanner.pret)}>
            {libelleBouton}
          </button>
        </div>
        <p className="text-[15px] text-texte-doux">
          L&apos;acte recevra l&apos;ID <span className="font-mono font-semibold text-encre" data-testid="id-prevu">{idSuivant}</span> et sera classé « délivré », sans montant.
        </p>
      </section>

      <aside className="flex flex-col gap-4">
        {listeActes}

        {manquants.length > 0 && (
          <section aria-labelledby={`${ids}-manquants`} className="flex flex-col gap-2 rounded-[10px] border border-[#e8c766] bg-attention-fond p-5 text-attention-texte" data-testid="scans-manquants">
            <h2 id={`${ids}-manquants`} className="text-lg font-bold">
              Scans manquants ({manquants.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {manquants.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{a.identifiant}</span>
                  <button
                    type="button"
                    className={boutonSecondaire}
                    disabled={occupe}
                    onClick={() => {
                      setCibleManquant(a.id);
                      choixManquant.current?.click();
                    }}
                  >
                    Joindre le scan
                  </button>
                </li>
              ))}
            </ul>
            <input ref={choixManquant} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Scan manquant à joindre" onChange={(e) => joindreManquant(e.target.files?.[0])} />
          </section>
        )}

        <section className="flex flex-col gap-2 rounded-[10px] border border-[#e8c766] bg-attention-fond p-5 text-attention-texte">
          <h2 className="text-lg font-bold">Registre terminé ?</h2>
          <p className="text-[15px]">Fermer le lot est définitif : il n&apos;acceptera plus aucun document.</p>
          <button type="button" className={`${boutonSecondaire} self-start border-attention-texte text-attention-texte`} onClick={() => setFermeture(true)} disabled={occupe}>
            Fermer le lot…
          </button>
        </section>
      </aside>

      {fermeture && (
        <FenetreModale titre="Fermer le lot ?" onFermer={() => setFermeture(false)}>
          <p className="text-[17px]">
            Le lot compte {liste.length} acte{liste.length > 1 ? "s" : ""}. Une fois fermé, il n&apos;acceptera plus aucun acte ni document.
            {manquants.length > 0 && ` Attention : ${manquants.length} acte(s) n'ont pas encore leur scan.`}
          </p>
          {erreurFermeture && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
              {erreurFermeture}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={boutonSecondaire} onClick={() => setFermeture(false)}>
              Garder le lot ouvert
            </button>
            <button type="button" className={boutonPrincipal} onClick={fermer}>
              Oui, fermer le lot
            </button>
          </div>
        </FenetreModale>
      )}
    </div>
  );
}
