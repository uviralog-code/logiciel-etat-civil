import Link from "next/link";
import { ROLES } from "@/lib/charte";
import { nomCourt, type ListeComptes, type Ton } from "@/lib/comptes";
import { ActionsCompte } from "./actions-compte";

const STYLE_ETAT: Record<Ton, string> = {
  ok: "bg-succes-fond text-succes-texte",
  attention: "bg-attention-fond text-attention-texte",
  bloque: "bg-erreur-fond text-erreur-texte",
  eteint: "bg-[#eef0f3] text-[#374151]",
};

const LIBELLE_ROLE = { officier: "Officier", caissier: "Caissier", admin: ROLES.admin } as const;

/** Tableau des comptes, d'après la maquette « Comptes des agents ». */
export function TableauComptes({ liste }: { liste: ListeComptes }) {
  const { totaux } = liste;
  return (
    <section aria-labelledby="titre-tableau" className="min-w-0 overflow-hidden rounded-[10px] border border-bordure bg-surface">
      <h2 id="titre-tableau" className="sr-only">
        Liste des comptes
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
              {["Nom d'utilisateur", "Nom", "Rôle", "Entité", "Dernière connexion en ligne", "État"].map((t) => (
                <th key={t} scope="col" className="border-b border-bordure px-4 py-2.5">
                  {t}
                </th>
              ))}
              <th scope="col" className="border-b border-bordure px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {liste.rangees.map((r) =>
              r.type === "a-creer" ? (
                <tr key={`${r.entite.code}-${r.role}`} data-rangee="a-creer" className="bg-[#fffdf5]">
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 font-mono text-sm font-semibold text-texte-doux">—</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 text-texte-doux">—</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{LIBELLE_ROLE[r.role]}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{nomCourt(r.entite.nom)}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 text-texte-doux">—</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">
                    <span className={`rounded-full px-2.5 py-[3px] text-sm font-bold whitespace-nowrap ${STYLE_ETAT.attention}`}>
                      À créer
                    </span>
                  </td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 text-right">
                    <Link
                      href={`/admin/comptes?creer=${r.entite.code}-${r.role}#creer-compte`}
                      aria-label={`Créer le compte ${LIBELLE_ROLE[r.role].toLowerCase()} de ${nomCourt(r.entite.nom)}`}
                      className="inline-flex h-10 items-center rounded-lg border border-bleu-etat bg-surface px-3 font-bold whitespace-nowrap text-bleu-etat hover:bg-bleu-clair"
                    >
                      Créer
                    </Link>
                  </td>
                </tr>
              ) : (
                <tr
                  key={r.compte.id}
                  data-rangee={r.compte.actif ? "actif" : "desactive"}
                  className={r.compte.actif ? undefined : "text-[#6b7280]"}
                >
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 font-mono text-sm font-semibold">{r.compte.nom_utilisateur}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{r.compte.nom_complet}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{LIBELLE_ROLE[r.compte.role]}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{nomCourt(r.entite.nom)}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">{r.derniereConnexion}</td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5">
                    <span className={`rounded-full px-2.5 py-[3px] text-sm font-bold whitespace-nowrap ${STYLE_ETAT[r.etat.ton]}`}>
                      {r.etat.libelle}
                    </span>
                  </td>
                  <td className="border-b border-[#edf0f5] px-4 py-3.5 text-right">
                    {r.compte.actif && (
                      <ActionsCompte
                        id={r.compte.id}
                        nomUtilisateur={r.compte.nom_utilisateur}
                        nomComplet={r.compte.nom_complet}
                        poste={`${LIBELLE_ROLE[r.compte.role]} · ${r.entite.nom}`}
                      />
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-bordure px-4 py-3 text-sm text-texte-doux">
        {totaux.actifs} compte{totaux.actifs > 1 ? "s" : ""} actif{totaux.actifs > 1 ? "s" : ""}
        {" · "}
        {totaux.aCreer} poste{totaux.aCreer > 1 ? "s" : ""} à pourvoir
        {" · "}
        {totaux.desactives} ancien{totaux.desactives > 1 ? "s" : ""} compte{totaux.desactives > 1 ? "s" : ""} désactivé
        {totaux.desactives > 1 ? "s" : ""}
        {totaux.alertes > 0 && ` · ${totaux.alertes} à surveiller`}
      </p>
    </section>
  );
}
