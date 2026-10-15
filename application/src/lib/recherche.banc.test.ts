// Fichier 32 — recherche contre le banc (vrai Supabase + vraie base, fonction rechercher_actes du fichier 09)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { enregistrerActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { lireTypeParCode } from "./nouvel-acte";
import { rechercherActes, type CriteresRecherche, type ReponseRecherche } from "./recherche";
import { aujourdhuiUvira } from "./tarifs";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

async function agent(role: "officier" | "caissier", entite: "KAL" | "KAV"): Promise<SupabaseClient> {
  const a = await creerAgent({ role, entite });
  const client = nouveauClient();
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
async function administrateur(): Promise<SupabaseClient> {
  const a = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  const debut = await commencerMiseEnPlace(client);
  if (!debut.ok) throw new Error(debut.message);
  const r = await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: a.nom });
  if (!r.ok) throw new Error(r.message);
  return client;
}

// Un nom de famille propre à ce passage du banc (lettres seulement), pour ne trouver que nos actes
const lettres = "abcdefghijklmnopqrstuvwxyz";
const famille = `Kibu${Array.from({ length: 6 }, () => lettres[Math.floor(Math.random() * 26)]).join("")}`;
const C = (o: Partial<CriteresRecherche>): CriteresRecherche => ({ texte: "", typeActeId: null, annee: null, statut: null, ...o });
const ids = (r: ReponseRecherche) => (r.etat === "trouve" ? r.resultats.map((x) => x.identifiant) : r);

describe("Recherche (Kalundu)", () => {
  it("par nom (désordre, accents, faute de frappe), par ID sans zéros ni code d'entité, filtres ; chacun ne voit que son entité", async () => {
    const officier = await agent("officier", "KAL");
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const naissance: SaisieActe = {
      typeActeId: exnais.id, categorie: "national", titulaire: `${famille} Zawadi Élise`, titulaire2: "", demandeur: "Mugisho Pierre", telephone: "",
      observations: "", details: { sexe: "F", date_naissance: "2015-03-21", lieu_naissance: "Uvira", nom_mere: "Bahati Claire" },
    };
    const a1 = await enregistrerActe(officier, naissance, true, aujourdhuiUvira());
    if (!a1.ok) throw new Error(a1.message);
    const a2 = await enregistrerActe(officier, { ...naissance, typeActeId: atidc.id, titulaire: "Neema Furaha", demandeur: `${famille} Jean`, details: {} }, false, aujourdhuiUvira());
    if (!a2.ok) throw new Error(a2.message);
    const id1 = a1.acte.identifiant; // KAL-EXNAIS-2026-000123
    const annee = Number(id1.split("-")[2]);

    // Par nom : ordre inversé, sans accent, une faute de frappe ; le demandeur compte aussi
    expect(ids(await rechercherActes(officier, C({ texte: `elise zawadi ${famille}` }), "KAL"))).toEqual([id1]);
    expect(ids(await rechercherActes(officier, C({ texte: `${famille.slice(0, -1)}x Zawadi` }), "KAL"))).toEqual([id1]);
    expect(ids(await rechercherActes(officier, C({ texte: famille }), "KAL"))).toEqual(expect.arrayContaining([id1, a2.acte.identifiant]));

    // Par ID, sans les zéros et sans le code de l'entité
    const sansZeros = id1.replace(/^KAL-/, "").replace(/-0+(\d)/, "-$1");
    const r = await rechercherActes(officier, C({ texte: sansZeros.toLowerCase() }), "KAL");
    expect(r).toMatchObject({ etat: "trouve", tronque: false, resultats: [{ identifiant: id1, entiteCode: "KAL", correspondance: "id_exact", statut: "en_attente_paiement", scanne: false }] });

    // Filtres : type, année, statut
    expect(ids(await rechercherActes(officier, C({ texte: famille, typeActeId: atidc.id }), "KAL"))).toEqual([a2.acte.identifiant]);
    expect(ids(await rechercherActes(officier, C({ texte: famille, statut: "enregistre" }), "KAL"))).toEqual([a2.acte.identifiant]);
    expect(ids(await rechercherActes(officier, C({ texte: famille, annee: annee - 1 }), "KAL"))).toEqual([]);

    // Moins de 2 caractères : message clair (vérifié aussi par la base)
    expect(await rechercherActes(officier, C({ texte: "a" }), "KAL")).toEqual({ etat: "erreur", message: "Tapez au moins 2 caractères pour lancer une recherche." });
    expect(await rechercherActes(officier, C({ texte: "  " }), "KAL")).toEqual({ etat: "vide" });

    // Le Caissier de Kalundu trouve aussi ; Kavimvira ne trouve rien
    const caissier = await agent("caissier", "KAL");
    expect(ids(await rechercherActes(caissier, C({ texte: sansZeros }), "KAL"))).toEqual([id1]);
    const autre = await agent("officier", "KAV");
    expect(ids(await rechercherActes(autre, C({ texte: famille }), "KAV"))).toEqual([]);
    expect(ids(await rechercherActes(autre, C({ texte: id1 }), "KAV"))).toEqual([]);

    // L'administrateur cherche dans les 4 entités (ID complet), l'entité est indiquée
    const admin = await administrateur();
    expect(await rechercherActes(admin, C({ texte: id1 }), null)).toMatchObject({ etat: "trouve", resultats: [{ identifiant: id1, entiteCode: "KAL" }] });
    expect(ids(await rechercherActes(admin, C({ texte: `zawadi ${famille}` }), null))).toEqual([id1]);
  });
});
