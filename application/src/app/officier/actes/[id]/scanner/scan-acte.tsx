"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icone } from "@/components/icone";
import {
  assemblerPdf, controlerFichier, empreinteSha256, formaterTaille, lireMotifRemplacement, modeImport, pivoter,
  TAILLE_MAXIMUM, verificationsAvantArchivage, type PageSource,
} from "@/lib/archivage";
import { envoyerScan } from "@/lib/envoi-reprenable";
import { lireEtatPont, rangerFichiers, texteCarteScanner, type EtatPont } from "@/lib/pont-scanner";
import { compresserImage, compterPages, dessinerPage } from "@/lib/scan-navigateur";
import { cheminPrevu, verifierEmpreinte } from "@/lib/scans";
import { configurationSupabase } from "@/lib/supabase/configuration";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import type { PagePhoto } from "@/lib/transfert-photo";
import { archiver } from "./actions";
import { PhotoTelephone } from "./photo-telephone";
import { ScannerBureau } from "./scanner-bureau";

export interface ActeAScanner {
  id: string;
  identifiant: string;
  typeLibelle: string;
  titulaire: string;
  /** Emplacement prévu (calculé par la base). */
  chemin: string;
  /** Numéro de la version qui sera créée (2 et plus : refaire le scan). */
  version: number;
  retour: string;
}

type DocumentPdf = { octets: Uint8Array; empreinte: string };
type Envoi = { etat: "repos" } | { etat: "envoi"; envoye: number; total: number } | { etat: "enregistrement" };

const carteSource = "flex flex-col items-start gap-1.5 rounded-[10px] p-4 text-left disabled:opacity-60";
const carteChoisie = "border-2 border-bleu-etat bg-bleu-clair text-bleu-etat";
const carteLibre = "border border-bordure bg-surface text-bleu-etat hover:border-bleu-etat";
const classeBouton = "h-11 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair disabled:opacity-50";

/** Écran « Scan de l'acte » (maquette « Officier — Scan ») : scanner du bureau, fichier importé ou photo par téléphone. */
export function ScanActe({ acte }: { acte: ActeAScanner }) {
  const ids = useId();
  const router = useRouter();
  const choix = useRef<HTMLInputElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const cadre = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<Uint8Array[]>([]);
  const [pages, setPages] = useState<PageSource[]>([]);
  const [courante, setCourante] = useState(0);
  const [pdf, setPdf] = useState<DocumentPdf | null>(null);
  const [preparation, setPreparation] = useState(false);
  const [doublon, setDoublon] = useState<string | null>(null);
  const [erreursFichiers, setErreursFichiers] = useState<string[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState<Envoi>({ etat: "repos" });
  const [erreur, setErreur] = useState<{ message: string; champ?: "motif" } | null>(null);
  const [glisse, setGlisse] = useState(false);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);
  const [origine, setOrigine] = useState<"scanner" | "fichier" | "photo">("fichier");
  const [etatPont, setEtatPont] = useState<EtatPont | null>(null);
  /** Fichiers du dossier surveillé joints à ce document (rangés après l'archivage). */
  const [joints, setJoints] = useState<string[]>([]);
  const choixFait = useRef(false);
  // Pages et sources à jour, même entre deux affichages (plusieurs photos peuvent arriver d'un coup)
  const actuel = useRef<{ pages: PageSource[]; sources: Uint8Array[] }>({ pages: [], sources: [] });

  const refaire = acte.version > 1;
  const verifications = verificationsAvantArchivage(acte.typeLibelle, acte.titulaire);
  const tropLourd = pdf != null && pdf.octets.length > TAILLE_MAXIMUM;
  const occupe = preparation || envoi.etat !== "repos";

  // À chaque changement des pages : on refait le PDF unique, son empreinte,
  // et on vérifie qu'il n'est pas déjà archivé (seul le dernier changement compte)
  const generation = useRef(0);
  async function appliquer(nouvellesPages: PageSource[], nouvellesSources: Uint8Array[]) {
    actuel.current = { pages: nouvellesPages, sources: nouvellesSources };
    setPages(nouvellesPages);
    setSources(nouvellesSources);
    const g = ++generation.current;
    if (nouvellesPages.length === 0) {
      setPdf(null);
      setDoublon(null);
      setPreparation(false);
      return;
    }
    setPreparation(true);
    try {
      const octets = await assemblerPdf(nouvellesPages, nouvellesSources);
      const empreinte = await empreinteSha256(octets);
      if (g !== generation.current) return;
      setPdf({ octets, empreinte });
      const message = await verifierEmpreinte(creerClientNavigateur(), acte.id, empreinte).catch(() => null);
      if (g === generation.current) setDoublon(message);
    } catch (e) {
      if (g === generation.current) setErreursFichiers([(e as Error).message]);
    } finally {
      if (g === generation.current) setPreparation(false);
    }
  }

  // Aperçu de la page affichée : dessinée à part, puis recopiée si elle est toujours la bonne
  useEffect(() => {
    if (!pdf || !cadre.current) return;
    let perime = false;
    const largeur = Math.min(560, cadre.current.clientWidth - 32);
    dessinerPage(pdf.octets, Math.min(courante, pages.length - 1) + 1, largeur)
      .then((dessin) => {
        const ecran = toile.current;
        if (perime || !ecran) return;
        const densite = Math.min(2, window.devicePixelRatio || 1);
        ecran.width = dessin.width;
        ecran.height = dessin.height;
        ecran.style.width = `${Math.round(dessin.width / densite)}px`;
        ecran.style.height = `${Math.round(dessin.height / densite)}px`;
        ecran.getContext("2d")?.drawImage(dessin, 0, 0);
        setErreurApercu(null);
      })
      .catch((e: Error) => {
        // L'aperçu seul a échoué : le document peut quand même être archivé
        if (!perime) setErreurApercu(`Aperçu impossible (${e.message}). Ouvrez le fichier sur l'ordinateur pour le vérifier.`);
      });
    return () => {
      perime = true;
    };
  }, [pdf, courante, pages.length]);

  // Le pont scanner de cet ordinateur : s'il est prêt, la carte « Scanner » est choisie d'office (maquette)
  const interrogerPont = (rafraichir = false) =>
    lireEtatPont(rafraichir).then((e) => {
      setEtatPont(e);
      if (!choixFait.current && e.etat === "ok" && e.pret && actuel.current.pages.length === 0) setOrigine("scanner");
    });
  useEffect(() => {
    lireEtatPont().then((e) => {
      setEtatPont(e);
      if (!choixFait.current && e.etat === "ok" && e.pret && actuel.current.pages.length === 0) setOrigine("scanner");
    });
  }, []);
  const choisirOrigine = (o: "scanner" | "fichier" | "photo") => {
    choixFait.current = true;
    setOrigine(o);
  };
  const carteScanner = texteCarteScanner(etatPont);

  async function ajouterFichiers(liste: FileList | File[], options: { scanner?: boolean; nomDossier?: string } = {}) {
    setErreur(null);
    const erreurs: string[] = [];
    const { pages: dejaLa, sources: dejaSources } = actuel.current;
    const nouvellesSources = [...dejaSources];
    const nouvellesPages: PageSource[] = [];
    setPreparation(true);
    for (const f of Array.from(liste)) {
      const octets = new Uint8Array(await f.arrayBuffer());
      const controle = controlerFichier({ nom: f.name, taille: f.size, debut: octets.subarray(0, 8) });
      if (!controle.ok) {
        erreurs.push(controle.message);
        continue;
      }
      try {
        if (controle.genre === "pdf") {
          const n = await compterPages(octets);
          const source = nouvellesSources.push(octets) - 1;
          for (let page = 0; page < n; page++) nouvellesPages.push({ genre: "pdf", source, page, rotation: 0, scanner: options.scanner });
        } else {
          const photo = await compresserImage(octets, controle.genre === "png" ? "image/png" : "image/jpeg");
          const source = nouvellesSources.push(photo.jpeg) - 1;
          nouvellesPages.push({ genre: "image", source, largeur: photo.largeur, hauteur: photo.hauteur, rotation: 0, scanner: options.scanner });
        }
      } catch (e) {
        erreurs.push(`« ${f.name} » : ${(e as Error).message}`);
      }
    }
    setErreursFichiers(erreurs);
    if (choix.current) choix.current.value = "";
    if (nouvellesPages.length > 0) {
      setCourante(dejaLa.length);
      // Nouveau contenu : les vérifications sont à refaire
      setCoches(new Set());
      if (options.nomDossier) setJoints((j) => [...j, options.nomDossier!]);
      await appliquer([...dejaLa, ...nouvellesPages], nouvellesSources);
    } else {
      setPreparation(false);
    }
  }

  /** Une page photographiée et redressée (téléphone ou photo de l'ordinateur) rejoint le document. */
  function ajouterPhoto(p: PagePhoto) {
    const { pages: dejaLa, sources: dejaSources } = actuel.current;
    setErreur(null);
    setCourante(dejaLa.length);
    // Nouveau contenu : les vérifications sont à refaire
    setCoches(new Set());
    appliquer(
      [...dejaLa, { genre: "image", source: dejaSources.length, largeur: p.largeur, hauteur: p.hauteur, rotation: 0, photo: true }],
      [...dejaSources, p.jpeg],
    );
  }

  const recommencer = () => {
    setJoints([]);
    setCourante(0);
    setCoches(new Set());
    setErreursFichiers([]);
    setErreur(null);
    appliquer([], []);
  };
  const pivoterPage = () => appliquer(pages.map((pg, i) => (i === courante ? { ...pg, rotation: pivoter(pg.rotation) } : pg)), sources);
  const retirerPage = () => {
    setCourante((c) => Math.max(0, Math.min(c, pages.length - 2)));
    setCoches(new Set());
    appliquer(pages.filter((_, i) => i !== courante), sources);
  };

  const manque = [
    !pdf && "choisissez le fichier de l'acte",
    coches.size < verifications.length && `cochez les ${verifications.length} vérifications`,
    refaire && !lireMotifRemplacement(motif).ok && "indiquez pourquoi le scan est refait",
  ].filter(Boolean) as string[];
  const pret = manque.length === 0 && !doublon && !tropLourd && !occupe;

  async function valider() {
    if (!pret || !pdf) return;
    setErreur(null);
    try {
      const supabase = creerClientNavigateur();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Votre session a expiré : reconnectez-vous, puis recommencez.");
      const chemin = await cheminPrevu(supabase, acte.id);
      const { url, clePublique } = configurationSupabase();
      setEnvoi({ etat: "envoi", envoye: 0, total: pdf.octets.length });
      await envoyerScan({
        url, clePublique, jeton: data.session.access_token, chemin, octets: pdf.octets, empreinte: pdf.empreinte,
        surProgression: (envoye, total) => setEnvoi({ etat: "envoi", envoye, total }),
      });
      setEnvoi({ etat: "enregistrement" });
      const r = await archiver(acte.id, refaire ? motif : null, modeImport(pages));
      if (!r.ok) {
        setErreur({ message: r.message, champ: r.champ });
        setEnvoi({ etat: "repos" });
        return;
      }
      // Archivé : les fichiers joints du dossier surveillé sont rangés, puis la fiche s'ouvre
      await rangerFichiers(joints);
      router.push(`/officier/actes/${acte.id}?archive=${r.version}`);
    } catch (e) {
      setErreur({ message: (e as Error).message });
      setEnvoi({ etat: "repos" });
    }
  }

  const page = pages[Math.min(courante, Math.max(0, pages.length - 1))];
  const pourcentage = envoi.etat === "envoi" && envoi.total > 0 ? Math.round((100 * envoi.envoye) / envoi.total) : 0;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <h2 className="font-serif text-[28px] font-bold">{refaire ? "Refaire le scan de l'acte" : "Joindre l'acte signé et cacheté"}</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="Source du document">
          <button
            type="button"
            aria-pressed={origine === "scanner"}
            onClick={() => {
              choisirOrigine("scanner");
              if (etatPont?.etat !== "ok") interrogerPont();
            }}
            disabled={occupe}
            className={`${carteSource} ${origine === "scanner" ? carteChoisie : carteLibre}`}
            data-testid="carte-scanner"
          >
            <Icone nom="scanner" taille={24} />
            <strong className="text-lg text-encre">Scanner</strong>
            <span className={`text-[15px] ${carteScanner.pret ? "text-succes-texte" : "text-texte-doux"}`}>{carteScanner.texte}</span>
          </button>
          <button
            type="button"
            aria-pressed={origine === "fichier"}
            onClick={() => {
              choisirOrigine("fichier");
              choix.current?.click();
            }}
            disabled={occupe}
            className={`${carteSource} ${origine === "fichier" ? carteChoisie : carteLibre}`}
          >
            <Icone nom="televerser" taille={24} />
            <strong className="text-lg text-encre">Importer un fichier</strong>
            <span className="text-[15px] text-texte-doux">PDF, JPEG ou PNG, 15 Mo au plus</span>
          </button>
          <button
            type="button"
            aria-pressed={origine === "photo"}
            onClick={() => choisirOrigine("photo")}
            disabled={occupe}
            className={`${carteSource} ${origine === "photo" ? carteChoisie : carteLibre}`}
          >
            <Icone nom="telephone" taille={24} />
            <strong className="text-lg text-encre">Photo par téléphone</strong>
            <span className="text-[15px] text-texte-doux">En secours, si le scanner est en panne</span>
          </button>
        </div>
        {origine === "scanner" && (
          <ScannerBureau
            etat={etatPont}
            reessayer={() => {
              setEtatPont(null);
              interrogerPont(true);
            }}
            occupe={occupe}
            joints={joints}
            surDocuments={(fichiers, nomDossier) => ajouterFichiers(fichiers, { scanner: true, nomDossier })}
          />
        )}
        {origine === "photo" && <PhotoTelephone acteId={acte.id} occupe={occupe} surPage={ajouterPhoto} />}
        <input
          ref={choix}
          id={`${ids}-fichiers`}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          className="sr-only"
          aria-label="Choisir le fichier de l'acte"
          onChange={(e) => e.target.files && ajouterFichiers(e.target.files)}
        />

        {erreursFichiers.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
            {erreursFichiers.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <section
          aria-labelledby={`${ids}-apercu`}
          className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5"
          onDragOver={(e) => {
            e.preventDefault();
            setGlisse(true);
          }}
          onDragLeave={() => setGlisse(false)}
          onDrop={(e) => {
            e.preventDefault();
            setGlisse(false);
            if (!occupe && e.dataTransfer.files.length) ajouterFichiers(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={`${ids}-apercu`} className="text-xl font-bold" aria-live="polite">
              {pages.length === 0 ? "Aperçu" : `Aperçu — page ${Math.min(courante, pages.length - 1) + 1} sur ${pages.length}`}
            </h3>
            {pages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={classeBouton} onClick={pivoterPage} disabled={occupe}>
                  <span className="inline-flex items-center gap-1.5"><Icone nom="pivoter" taille={18} />Pivoter</span>
                </button>
                <button type="button" className={classeBouton} onClick={() => choix.current?.click()} disabled={occupe}>
                  Ajouter une page
                </button>
                {pages.length > 1 && (
                  <button type="button" className={classeBouton} onClick={retirerPage} disabled={occupe}>
                    Retirer cette page
                  </button>
                )}
                <button type="button" className={classeBouton} onClick={recommencer} disabled={occupe}>
                  Recommencer
                </button>
              </div>
            )}
          </div>
          <div ref={cadre} className={`flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-lg p-4 ${glisse ? "bg-bleu-clair" : "bg-[#e9edf3]"}`}>
            {pages.length === 0 ? (
              <>
                <p className="max-w-sm text-center text-[17px] text-texte-doux">
                  Choisissez le fichier de l&apos;acte signé et cacheté (PDF, JPEG ou PNG), ou déposez-le ici. Plusieurs fichiers
                  sont réunis en un seul PDF, dans l&apos;ordre.
                </p>
                <button
                  type="button"
                  onClick={() => choix.current?.click()}
                  disabled={occupe}
                  className="h-12 rounded-lg bg-bleu-etat px-6 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce"
                >
                  Choisir un fichier
                </button>
                {preparation && <p role="status">Préparation du document…</p>}
              </>
            ) : (
              <>
                <canvas ref={toile} className="max-w-full bg-white shadow-md" data-testid="apercu-page" aria-label={`Page ${courante + 1} du document`} role="img" />
                {erreurApercu && (
                  <p role="alert" className="max-w-md text-center font-semibold text-attention-texte">
                    {erreurApercu}
                  </p>
                )}
                {page && (
                  <span className="text-sm text-texte-doux">
                    {page.genre === "image" ? "Photo" : "Page de PDF"}
                    {page.rotation ? ` · pivotée de ${page.rotation}°` : ""}
                  </span>
                )}
              </>
            )}
          </div>
          {pages.length > 1 && (
            <div className="flex justify-between gap-3">
              <button type="button" className={classeBouton} disabled={courante === 0} onClick={() => setCourante((c) => c - 1)}>
                ‹ Page précédente
              </button>
              <button type="button" className={classeBouton} disabled={courante >= pages.length - 1} onClick={() => setCourante((c) => c + 1)}>
                Page suivante ›
              </button>
            </div>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4" aria-label="Validation">
        <fieldset className="flex flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-5">
          <legend className="float-left mb-1 text-xl font-bold">Avant de valider, vérifiez</legend>
          {verifications.map((v) => (
            <label key={v.id} className="flex items-start gap-3 text-[17px]">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[#2e7d32]"
                checked={coches.has(v.id)}
                disabled={!pdf || occupe}
                onChange={(e) =>
                  setCoches((c) => {
                    const n = new Set(c);
                    if (e.target.checked) n.add(v.id);
                    else n.delete(v.id);
                    return n;
                  })
                }
              />
              <span>
                {v.avant}
                <strong>{v.gras}</strong>
              </span>
            </label>
          ))}
          <div className="mt-2 flex flex-col gap-1 border-t border-bordure pt-3 text-[15px] text-texte-doux">
            <span>Sera rangé sous</span>
            <span className="font-mono text-sm font-semibold break-all text-encre" data-testid="chemin-prevu">
              {acte.chemin}
            </span>
            <span data-testid="resume-document">
              {pdf
                ? `${pages.length} page${pages.length > 1 ? "s" : ""} · ${formaterTaille(pdf.octets.length)} après compression · version ${acte.version}`
                : `Version ${acte.version}`}
            </span>
          </div>
        </fieldset>

        {refaire && (
          <div className="flex flex-col gap-1.5 rounded-[10px] border border-bordure bg-surface p-5">
            <label htmlFor={`${ids}-motif`} className="font-bold">
              Pourquoi refaire le scan ?
            </label>
            <textarea
              id={`${ids}-motif`}
              rows={3}
              maxLength={300}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              aria-invalid={erreur?.champ === "motif" || undefined}
              placeholder="Ex. « Page 2 illisible », « Mauvais document joint »"
              className="rounded-lg border border-bordure-champ px-3 py-2 text-[17px] aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
            <span className="text-sm text-texte-doux">La version actuelle est gardée ; la nouvelle fera foi.</span>
          </div>
        )}

        {doublon && (
          <p role="alert" className="rounded-[10px] border border-[#e8a3a3] bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="doublon">
            {doublon}
          </p>
        )}
        {tropLourd && pdf && (
          <p role="alert" className="rounded-[10px] border border-[#e8a3a3] bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
            Le document fait {formaterTaille(pdf.octets.length)} : 15 Mo au plus. Retirez des pages ou scannez en plus basse résolution.
          </p>
        )}
        {erreur && (
          <p role="alert" className="rounded-[10px] border border-[#e8a3a3] bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="erreur-archivage">
            {erreur.message}
          </p>
        )}

        {envoi.etat !== "repos" && (
          <div role="status" className="flex flex-col gap-2 rounded-[10px] border border-bordure bg-surface p-4">
            {envoi.etat === "envoi" ? (
              <>
                <span className="font-semibold">
                  Envoi : {pourcentage} % ({formaterTaille(envoi.envoye)} sur {formaterTaille(envoi.total)})
                </span>
                <progress max={100} value={pourcentage} className="h-2 w-full accent-[#0d47a1]" aria-label="Progression de l'envoi" />
                <span className="text-sm text-texte-doux">Si la connexion coupe, l&apos;envoi reprend tout seul.</span>
              </>
            ) : (
              <span className="font-semibold">Vérification et enregistrement du scan…</span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={valider}
          disabled={!pret}
          className="h-14 rounded-[10px] bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-not-allowed disabled:opacity-50"
        >
          {envoi.etat === "repos" ? "Valider l'archivage" : "Archivage en cours…"}
        </button>
        {manque.length > 0 && envoi.etat === "repos" && (
          <p className="text-center text-[15px] text-texte-doux" data-testid="manque">
            Pour valider : {manque.join(" · ")}.
          </p>
        )}
        <Link href={acte.retour} className="self-center font-semibold">
          Annuler
        </Link>
      </aside>
    </div>
  );
}
