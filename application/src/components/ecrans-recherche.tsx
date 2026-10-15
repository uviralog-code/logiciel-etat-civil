import Link from "next/link";
import { notFound } from "next/navigation";
import { CadreEspace } from "@/components/cadre-espace";
import { FicheActeVue } from "@/components/fiche-acte-vue";
import { LienRetour, retourDepuisAdresse } from "@/components/lien-retour";
import { RechercheActes } from "@/components/recherche-actes";
import { exigerEspace } from "@/lib/acces";
import { lireTypesActes } from "@/lib/catalogue";
import type { RoleUtilisateur } from "@/lib/charte";
import { lireFicheActe } from "@/lib/fiche-acte";
import { criteresDepuisAdresse, rechercherActes } from "@/lib/recherche";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira } from "@/lib/tarifs";

type Parametres = Promise<Record<string, string | string[] | undefined>>;
const ESPACE: Record<RoleUtilisateur, string> = { officier: "/officier", caissier: "/caissier", admin: "/admin" };

/**
 * Écran « Rechercher » d'un espace (fichier 32). Les droits sont ceux de la
 * personne connectée : son entité (officier, caissier) ou les 4 (administrateur).
 */
export async function EcranRecherche({ role, parametres }: { role: RoleUtilisateur; parametres: Parametres }) {
  const agent = await exigerEspace(role);
  const supabase = await creerClientServeur();
  const criteres = criteresDepuisAdresse(await parametres);
  const [reponse, types] = await Promise.all([
    // Un agent peut taper l'ID sans le code de son entité (« EXNAIS-2026-123 »)
    rechercherActes(supabase, criteres, role === "admin" ? null : (agent.profil.entite?.code ?? null)),
    lireTypesActes(supabase),
  ]);
  const base = `${ESPACE[role]}/recherche`;

  return (
    <CadreEspace agent={agent} actif={base}>
      <RechercheActes
        base={base}
        lienFiche={`${ESPACE[role]}/actes`}
        criteres={criteres}
        reponse={reponse}
        types={types}
        anneeEnCours={Number(aujourdhuiUvira().slice(0, 4))}
        avecEntite={role === "admin"}
      />
    </CadreEspace>
  );
}

/** Fiche d'un acte en lecture seule (Caissier, administrateur). */
export async function EcranFicheLecture({
  role,
  params,
  parametres,
}: {
  role: Exclude<RoleUtilisateur, "officier">;
  params: Promise<{ id: string }>;
  parametres: Parametres;
}) {
  const agent = await exigerEspace(role);
  const { id } = await params;
  // La base ne montre que ce que la personne a le droit de voir
  const fiche = await lireFicheActe(await creerClientServeur(), String(id));
  if (!fiche) notFound();
  const base = `${ESPACE[role]}/recherche`;
  return (
    <CadreEspace agent={agent} actif={base} enTete={<LienRetour retour={retourDepuisAdresse(await parametres, base)} accueil={ESPACE[role]} />}>
      <FicheActeVue
        fiche={fiche}
        espace={ESPACE[role] as "/caissier" | "/admin"}
        actions={
          // Le Caissier rouvre le reçu pour le réimprimer (fichier 39)
          role === "caissier" && fiche.recu ? (
            <Link
              href={`/caissier/recus/${fiche.recu.id}`}
              className="inline-flex h-12 items-center rounded-lg border border-bleu-etat bg-surface px-5 text-[17px] font-bold text-bleu-etat no-underline hover:bg-bleu-clair"
            >
              Voir le reçu {fiche.recu.numero_recu}
            </Link>
          ) : undefined
        }
      />
    </CadreEspace>
  );
}
