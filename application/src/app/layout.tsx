import type { Metadata } from "next";
// Polices intégrées à l'application : elles s'affichent même sans internet
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Registre numérique de l'état civil — Uvira",
    template: "%s · État civil Uvira",
  },
  description:
    "Archivage des actes d'état civil et suivi des recettes : communes de Mulongwe, Kavimvira et Kalundu, chefferie des Bavira.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-fond text-encre">{children}</body>
    </html>
  );
}
