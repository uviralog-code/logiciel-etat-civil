// « Se déconnecter » contre le banc (vrai Supabase Auth)
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent } from "@/test/banc";
import { adresseInterne } from "@/lib/identifiants";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const client = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

describe("Déconnexion d'un poste", () => {
  it("la session de ce poste est fermée pour de bon ; celle d'un autre poste reste ouverte", async () => {
    const agent = await creerAgent({ role: "officier", entite: "BAV" });
    const [posteA, posteB] = [client(), client()];
    for (const poste of [posteA, posteB]) {
      await poste.auth.signInWithPassword({ email: adresseInterne(agent.nom), password: agent.motDePasse });
    }
    const jetonA = (await posteA.auth.getSession()).data.session!.refresh_token;

    expect((await posteA.auth.signOut({ scope: "local" })).error).toBeNull();
    expect((await posteA.auth.getSession()).data.session).toBeNull();

    // Le jeton de renouvellement du poste A ne sert plus à rien, même recopié ailleurs
    const pirate = client();
    expect((await pirate.auth.refreshSession({ refresh_token: jetonA })).error).not.toBeNull();
    // Le poste B n'est pas touché
    expect((await posteB.auth.refreshSession()).error).toBeNull();
  });
});
