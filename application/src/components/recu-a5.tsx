import { dateRecu, enTeteRecu, lignesRecu, MENTION_RECU, montantPayeEnLettres, montantPayeRecu, type RecuDetaille } from "@/lib/recus";

/**
 * Reçu de paiement A5 (maquette « Caissier — Reçu »), en millimètres pour une
 * impression fidèle. Même contenu que le PDF (lib/recu-pdf.ts).
 * `qrSvg` : QR code de vérification, préparé par le serveur.
 */
export function RecuA5({ recu, qrSvg, mention }: { recu: RecuDetaille; qrSvg: string; mention: string | null }) {
  const [pays, lieu, entite, bureau] = enTeteRecu(recu.entite);
  const annule = recu.statut === "annule";
  return (
    <div
      className="relative flex h-[210mm] w-[148mm] flex-col overflow-hidden bg-white px-[10.5mm] pt-[9mm] pb-[9mm] font-sans text-[#111111]"
      data-testid="recu-a5"
    >
      <div className="flex flex-col items-center gap-[0.6mm] text-center">
        <span className="text-[10pt] font-bold tracking-[0.04em] uppercase">{pays}</span>
        <span className="text-[9pt] text-[#374151]">{lieu}</span>
        <span className="text-[12.5pt] font-bold">{entite}</span>
        <span className="text-[9.5pt] text-[#374151]">{bureau}</span>
      </div>
      <div className="mt-[2.5mm] h-[0.6mm] bg-[#111111]" />

      <div className="mt-[4mm] flex items-start justify-between gap-[3mm]">
        <div className="flex flex-col gap-[0.8mm]">
          <span className="text-[15pt] leading-none font-bold">REÇU DE PAIEMENT</span>
          <span className="text-[9.5pt] text-[#374151]">{dateRecu(recu)}</span>
        </div>
        <div className="flex flex-col items-end gap-[1.5mm]">
          <span className="font-mono text-[11.5pt] font-semibold" data-testid="numero-recu">
            {recu.numero}
          </span>
          {mention && (
            <span className="border-[0.4mm] border-[#b42318] px-[2mm] py-[0.5mm] text-[9.5pt] font-bold text-[#b42318]" data-testid="mention-duplicata">
              {mention}
            </span>
          )}
        </div>
      </div>

      <div className="mt-[2.5mm] flex flex-col">
        {lignesRecu(recu).map(([cle, valeur]) => (
          <div key={cle} className="flex justify-between gap-[4mm] border-b border-dotted border-[#9aa3af] py-[1.15mm] text-[9.5pt]">
            <span className="shrink-0 text-[#374151]">{cle}</span>
            <span className={`text-right font-semibold break-words ${cle === "ID de l'acte" ? "font-mono" : ""}`}>{valeur}</span>
          </div>
        ))}
      </div>

      <div className="mt-[3.5mm] flex items-center justify-between rounded-[1mm] border-[0.55mm] border-[#0b3d91] px-[3.5mm] py-[2.5mm] text-[#0b3d91]">
        <span className="text-[11pt] font-bold">Montant payé</span>
        <span className="text-[18pt] font-bold" data-testid="montant-paye">
          {montantPayeRecu(recu)}
        </span>
      </div>
      <span className="mt-[2mm] text-[9.5pt] italic" data-testid="montant-lettres">
        {montantPayeEnLettres(recu)}
      </span>

      <div className="mt-[4mm] flex items-start justify-between gap-[4mm]">
        <div className="flex flex-col">
          <span className="text-[9pt] text-[#374151]">Le Caissier</span>
          <span className="text-[10.5pt] font-bold">{recu.caissier ?? "—"}</span>
          <span className="mt-[8mm] w-[52mm] border-t border-[#374151] pt-[0.8mm] text-[8.5pt] text-[#374151]">Signature</span>
        </div>
        <div className="flex h-[20mm] w-[42mm] items-center justify-center border border-dashed border-[#9aa3af] text-[8.5pt] text-[#374151]">
          Cachet du bureau
        </div>
      </div>

      <div className="mt-auto flex items-end gap-[4mm] border-t border-[#9aa3af] pt-[3mm]">
        {/* QR code généré par le serveur (bibliothèque qrcode), sans contenu venant d'un utilisateur */}
        <div className="size-[22.5mm] shrink-0 [&>svg]:size-full" aria-label="QR code de vérification du reçu" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div className="flex flex-col gap-[1mm]">
          <span className="text-[8.5pt] font-bold">Vérifier ce reçu : scannez le code</span>
          <p className="text-[7.5pt] leading-snug text-[#374151]">{MENTION_RECU}</p>
        </div>
      </div>

      {annule && (
        <div
          aria-label="Reçu annulé"
          data-testid="tampon-annule"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] text-[62pt] font-black tracking-[0.06em] text-[#b42318] opacity-35"
        >
          ANNULÉ
        </div>
      )}
    </div>
  );
}
