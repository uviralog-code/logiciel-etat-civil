//go:build !windows

package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Avec un faux NAPS2 qui accepte les mêmes options que le vrai (essais/faux-naps2.sh).
func TestNaps2(t *testing.T) {
	faux, _ := filepath.Abs("essais/faux-naps2.sh")
	dir := t.TempDir()
	pdf := filepath.Join(dir, "source.pdf")
	_ = os.WriteFile(pdf, []byte("%PDF-1.7 vrai contenu"), 0o644)
	args := filepath.Join(dir, "args.txt")
	t.Setenv("FAUX_NAPS2_PDF", pdf)
	t.Setenv("FAUX_NAPS2_ARGS", args)
	t.Setenv("FAUX_NAPS2_SCANNERS", "HP LaserJet MFP M28w (WIA);Canon LiDE 300")

	n := Naps2{Chemin: faux, Pilote: "wia", Dpi: 200, Couleur: "color", Source: "glass"}
	l, err := n.Peripheriques(context.Background())
	if err != nil || strings.Join(l, "|") != "HP LaserJet MFP M28w (WIA)|Canon LiDE 300" {
		t.Fatalf("liste : %v %v", l, err)
	}
	sortie := filepath.Join(dir, "scan.pdf")
	if err := n.Scanner(context.Background(), "HP LaserJet MFP M28w (WIA)", sortie); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(sortie); string(b) != "%PDF-1.7 vrai contenu" {
		t.Fatalf("PDF : %q", b)
	}
	recues, _ := os.ReadFile(args)
	attendu := "--noprofile --driver wia --device HP LaserJet MFP M28w (WIA) --source glass --dpi 200 --bitdepth color --output " + sortie + " --force"
	if lignes := strings.Split(strings.TrimSpace(string(recues)), "\n"); lignes[0] != "--driver wia --listdevices" || lignes[1] != attendu {
		t.Fatalf("options reçues par NAPS2 :\n%s", recues)
	}

	// NAPS2 n'a rien produit (il ne le signale pas par son code de sortie) : message clair
	t.Setenv("FAUX_NAPS2_ECHEC", "No scanned pages to save.")
	_ = os.Remove(sortie)
	if err := n.Scanner(context.Background(), "HP", sortie); err == nil || err.Error() != "le scan n'a rien donné : No scanned pages to save." {
		t.Fatalf("échec : %v", err)
	}
	if _, err := (Naps2{Chemin: filepath.Join(dir, "absent.exe")}).Peripheriques(context.Background()); err != ErrNaps2Absent {
		t.Fatalf("NAPS2 absent : %v", err)
	}
}
