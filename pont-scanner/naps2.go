// Commande de NAPS2 (logiciel de scan libre) par sa version « console ».
package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"strings"
	"time"
)

// Scanneur : ce dont le pont a besoin (remplaçable dans les tests).
type Scanneur interface {
	Peripheriques(ctx context.Context) ([]string, error)
	Scanner(ctx context.Context, peripherique, sortie string) error
}

// Naps2 appelle NAPS2.Console.exe.
type Naps2 struct {
	Chemin  string
	Pilote  string
	Dpi     int
	Couleur string
	Source  string
}

// EmplacementsNaps2 : où NAPS2 s'installe habituellement sous Windows.
func EmplacementsNaps2() []string {
	var l []string
	for _, v := range []string{"ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"} {
		if d := os.Getenv(v); d != "" {
			l = append(l, filepath.Join(d, "NAPS2", "NAPS2.Console.exe"), filepath.Join(d, "Programs", "NAPS2", "NAPS2.Console.exe"))
		}
	}
	return l
}

// TrouverNaps2 : le chemin réglé, sinon le premier emplacement habituel qui existe.
func TrouverNaps2(regle string) string {
	if regle != "" {
		return regle
	}
	for _, c := range EmplacementsNaps2() {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// ErrNaps2Absent : NAPS2 n'est pas installé (ou pas trouvé).
var ErrNaps2Absent = errors.New("NAPS2 n'est pas installé sur cet ordinateur")

func (n Naps2) lancer(ctx context.Context, args ...string) (string, error) {
	if n.Chemin == "" {
		return "", ErrNaps2Absent
	}
	if _, err := os.Stat(n.Chemin); err != nil {
		return "", ErrNaps2Absent
	}
	cmd := exec.CommandContext(ctx, n.Chemin, args...)
	cacherFenetre(cmd)
	var sortie bytes.Buffer
	cmd.Stdout = &sortie
	cmd.Stderr = &sortie
	err := cmd.Run()
	texte := strings.TrimSpace(strings.ReplaceAll(sortie.String(), "\r", ""))
	if ctx.Err() != nil {
		return texte, errors.New("le scanner ne répond pas (délai dépassé)")
	}
	return texte, err
}

// Peripheriques : noms des scanners vus par le pilote (un par ligne dans la sortie de NAPS2).
func (n Naps2) Peripheriques(ctx context.Context) ([]string, error) {
	texte, err := n.lancer(ctx, "--driver", n.Pilote, "--listdevices")
	if err != nil {
		return nil, erreurNaps2(texte, err)
	}
	var l []string
	for _, ligne := range strings.Split(texte, "\n") {
		if ligne = strings.TrimSpace(ligne); ligne != "" {
			l = append(l, ligne)
		}
	}
	return l, nil
}

// Scanner : une page (ou le chargeur) vers un PDF. NAPS2 ne signale pas toujours ses
// échecs par son code de sortie : on vérifie donc que le PDF existe vraiment.
func (n Naps2) Scanner(ctx context.Context, peripherique, sortie string) error {
	texte, err := n.lancer(ctx,
		"--noprofile", "--driver", n.Pilote, "--device", peripherique,
		"--source", n.Source, "--dpi", fmt.Sprint(n.Dpi), "--bitdepth", n.Couleur,
		"--output", sortie, "--force")
	if err != nil {
		return erreurNaps2(texte, err)
	}
	info, errStat := os.Stat(sortie)
	if errStat != nil || info.Size() == 0 {
		if texte == "" {
			texte = "aucune page reçue du scanner"
		}
		return fmt.Errorf("le scan n'a rien donné : %s", derniereLigne(texte))
	}
	return nil
}

func erreurNaps2(texte string, err error) error {
	if errors.Is(err, ErrNaps2Absent) {
		return err
	}
	if texte != "" {
		return errors.New(derniereLigne(texte))
	}
	return err
}

func derniereLigne(t string) string {
	l := strings.Split(strings.TrimSpace(t), "\n")
	return strings.TrimSpace(l[len(l)-1])
}

// DelaiScan : un scan à 200 ppp prend quelques secondes ; au-delà de 3 minutes, on abandonne.
const DelaiScan = 3 * time.Minute

// DelaiListe : la liste des scanners (WIA) peut prendre plusieurs secondes.
const DelaiListe = 30 * time.Second
