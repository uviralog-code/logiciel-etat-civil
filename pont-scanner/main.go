// EtatCivilScanner : pont entre le scanner du bureau (NAPS2) et l'écran « Scan de l'acte »
// du logiciel d'état civil (fichier 35). Voir GUIDE-INSTALLATION.md.
//
//	EtatCivilScanner.exe --installer --origine https://adresse-du-logiciel   (une seule fois)
//	EtatCivilScanner.exe                                                     (démarré avec Windows)
//	EtatCivilScanner.exe --desinstaller
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type listeOrigines []string

func (l *listeOrigines) String() string     { return strings.Join(*l, ",") }
func (l *listeOrigines) Set(v string) error { *l = append(*l, v); return nil }

func racineParDefaut() string {
	if runtime.GOOS == "windows" {
		return `C:\EtatCivil`
	}
	if d, err := os.UserHomeDir(); err == nil {
		return filepath.Join(d, "EtatCivil")
	}
	return "EtatCivil"
}

func main() {
	var origines listeOrigines
	racine := flag.String("racine", racineParDefaut(), "dossier du pont (réglages, journal, Scans)")
	installer := flag.Bool("installer", false, "installer le pont et le démarrer avec Windows")
	desinstaller := flag.Bool("desinstaller", false, "ne plus démarrer le pont avec Windows")
	flag.Var(&origines, "origine", "adresse du logiciel autorisée (ex. https://etatcivil.exemple.cd), répétable")
	flag.Parse()

	cheminConfig := filepath.Join(*racine, "pont-scanner.json")
	switch {
	case *installer:
		if err := installerPont(*racine, cheminConfig, origines); err != nil {
			afficherMessage("Pont scanner — erreur", "L'installation a échoué :\n"+err.Error())
			os.Exit(1)
		}
		return
	case *desinstaller:
		if err := retirerDemarrage(); err != nil {
			afficherMessage("Pont scanner — erreur", err.Error())
			os.Exit(1)
		}
		afficherMessage("Pont scanner", "Le pont ne démarrera plus avec Windows. Vous pouvez supprimer le dossier "+*racine+".")
		return
	}

	journal := ouvrirJournal(*racine)
	cfg, err := ChargerConfig(cheminConfig, *racine)
	if err != nil {
		journal.Fatalf("réglages : %v", err)
	}
	for _, o := range origines {
		if err := cfg.AjouterOrigine(o); err != nil {
			journal.Fatalf("%v", err)
		}
	}
	if err := demarrer(cfg, journal); err != nil {
		journal.Fatalf("%v", err)
	}
}

// demarrer : écoute sur 127.0.0.1 seulement. Si le port est déjà pris, le pont tourne déjà : on s'arrête sans bruit.
func demarrer(cfg Config, journal *log.Logger) error {
	if err := os.MkdirAll(cfg.Dossier, 0o755); err != nil {
		return fmt.Errorf("dossier surveillé %s : %w", cfg.Dossier, err)
	}
	chemin := TrouverNaps2(cfg.Naps2)
	naps2 := Naps2{Chemin: chemin, Pilote: cfg.Pilote, Dpi: cfg.Dpi, Couleur: cfg.Couleur, Source: cfg.Source}
	pont := NouveauPont(cfg, naps2, chemin != "", journal)

	ecoute, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", cfg.Port))
	if err != nil {
		journal.Printf("port %d déjà utilisé : le pont tourne sans doute déjà (%v)", cfg.Port, err)
		return nil
	}
	journal.Printf("pont %s démarré sur 127.0.0.1:%d ; NAPS2 : %q ; dossier : %s ; origines : %v", Version, cfg.Port, chemin, cfg.Dossier, cfg.Origines)
	serveur := &http.Server{Handler: pont.Handler(), ReadHeaderTimeout: 10 * time.Second, WriteTimeout: DelaiScan + time.Minute}
	if err := serveur.Serve(ecoute); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// ouvrirJournal : pont-scanner.log dans le dossier du pont (gardé petit : 1 Mo, puis .1).
func ouvrirJournal(racine string) *log.Logger {
	_ = os.MkdirAll(racine, 0o755)
	chemin := filepath.Join(racine, "pont-scanner.log")
	if info, err := os.Stat(chemin); err == nil && info.Size() > 1<<20 {
		_ = os.Rename(chemin, chemin+".1")
	}
	var sortie io.Writer = os.Stderr
	if f, err := os.OpenFile(chemin, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		sortie = io.MultiWriter(f, os.Stderr)
	}
	return log.New(sortie, "", log.LstdFlags)
}

// installerPont : copie le programme dans le dossier du pont, écrit les réglages,
// l'inscrit au démarrage de Windows, puis le lance.
func installerPont(racine, cheminConfig string, origines []string) error {
	if len(origines) == 0 {
		return errors.New("indiquez l'adresse du logiciel : --origine https://adresse-du-logiciel")
	}
	if err := os.MkdirAll(filepath.Join(racine, "Scans"), 0o755); err != nil {
		return err
	}
	cfg, err := ChargerConfig(cheminConfig, racine)
	if err != nil {
		return err
	}
	for _, o := range origines {
		if err := cfg.AjouterOrigine(o); err != nil {
			return err
		}
	}
	if err := EnregistrerConfig(cheminConfig, cfg); err != nil {
		return err
	}
	moi, err := os.Executable()
	if err != nil {
		return err
	}
	cible := filepath.Join(racine, filepath.Base(moi))
	if !strings.EqualFold(filepath.Clean(moi), filepath.Clean(cible)) {
		if err := copierFichier(moi, cible); err != nil {
			return fmt.Errorf("copie dans %s : %w", racine, err)
		}
	}
	if err := inscrireDemarrage(cible); err != nil {
		return err
	}
	if err := lancerEnArrierePlan(cible); err != nil {
		return err
	}
	chemin := TrouverNaps2(cfg.Naps2)
	naps2 := "trouvé : " + chemin
	if chemin == "" {
		naps2 = "PAS ENCORE INSTALLÉ — installez NAPS2 (voir le guide), puis redémarrez l'ordinateur"
	}
	afficherMessage("Pont scanner installé", fmt.Sprintf(
		"Le pont scanner est installé et démarré.\n\nIl démarrera seul avec Windows.\nDossier surveillé : %s\nAdresses autorisées : %s\nNAPS2 : %s",
		cfg.Dossier, strings.Join(cfg.Origines, ", "), naps2))
	return nil
}

func copierFichier(source, cible string) error {
	contenu, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return os.WriteFile(cible, contenu, 0o755)
}
