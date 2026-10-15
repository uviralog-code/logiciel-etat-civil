// Réglages du pont, lus dans un fichier JSON (créé avec des valeurs par défaut au premier démarrage).
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config : tout ce qui peut être réglé par fichier (pont-scanner.json).
type Config struct {
	// Port local (127.0.0.1 seulement).
	Port int `json:"port"`
	// Adresses du logiciel d'état civil autorisées à utiliser le pont (ex. https://etatcivil.exemple.cd).
	Origines []string `json:"origines"`
	// Dossier surveillé : les fichiers scannés par NAPS2 ou par le bouton du scanner y sont déposés.
	Dossier string `json:"dossier"`
	// Chemin de NAPS2.Console.exe (vide : recherché aux emplacements habituels).
	Naps2 string `json:"naps2"`
	// Pilote du scanner : wia (par défaut), twain ou escl.
	Pilote string `json:"pilote"`
	// Nom du scanner (vide : le premier trouvé).
	Scanner string `json:"scanner"`
	// Réglage du scan : 200 ppp, en couleur (décision du fichier 35).
	Dpi     int    `json:"dpi"`
	Couleur string `json:"couleur"`
	// Source du papier : glass (vitre) ou feeder (chargeur).
	Source string `json:"source"`
}

// ConfigParDefaut : valeurs utilisées si le fichier n'existe pas encore.
func ConfigParDefaut(racine string) Config {
	return Config{
		Port:     47820,
		Origines: []string{},
		Dossier:  filepath.Join(racine, "Scans"),
		Pilote:   "wia",
		Dpi:      200,
		Couleur:  "color",
		Source:   "glass",
	}
}

// ChargerConfig lit le fichier ; s'il n'existe pas, il est créé avec les valeurs par défaut.
func ChargerConfig(chemin, racine string) (Config, error) {
	c := ConfigParDefaut(racine)
	contenu, err := os.ReadFile(chemin)
	if errors.Is(err, os.ErrNotExist) {
		return c, EnregistrerConfig(chemin, c)
	}
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(contenu, &c); err != nil {
		return c, fmt.Errorf("fichier de réglages illisible (%s) : %w", chemin, err)
	}
	return c, c.Verifier()
}

// EnregistrerConfig écrit le fichier, lisible et modifiable à la main.
func EnregistrerConfig(chemin string, c Config) error {
	if err := os.MkdirAll(filepath.Dir(chemin), 0o755); err != nil {
		return err
	}
	contenu, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(chemin, append(contenu, '\n'), 0o644)
}

// Verifier refuse les réglages dangereux ou impossibles.
func (c Config) Verifier() error {
	if c.Port < 1024 || c.Port > 65535 {
		return fmt.Errorf("port invalide : %d", c.Port)
	}
	for _, o := range c.Origines {
		if !OrigineValide(o) {
			return fmt.Errorf("origine invalide : %q (forme attendue : https://adresse-du-logiciel)", o)
		}
	}
	switch c.Pilote {
	case "wia", "twain", "escl", "sane", "apple":
	default:
		return fmt.Errorf("pilote inconnu : %q (wia, twain ou escl)", c.Pilote)
	}
	switch c.Couleur {
	case "color", "gray", "bw":
	default:
		return fmt.Errorf("couleur inconnue : %q (color, gray ou bw)", c.Couleur)
	}
	switch c.Source {
	case "glass", "feeder", "duplex":
	default:
		return fmt.Errorf("source inconnue : %q (glass, feeder ou duplex)", c.Source)
	}
	if c.Dpi < 75 || c.Dpi > 600 {
		return fmt.Errorf("résolution invalide : %d ppp", c.Dpi)
	}
	if c.Dossier == "" {
		return errors.New("dossier surveillé non renseigné")
	}
	return nil
}

// OrigineValide : https://hote[:port], ou http://localhost[:port] / http://127.0.0.1[:port] (essais).
func OrigineValide(o string) bool {
	if strings.HasSuffix(o, "/") || strings.ContainsAny(o, " *?#") {
		return false
	}
	if strings.HasPrefix(o, "https://") {
		return len(o) > len("https://") && !strings.Contains(o[len("https://"):], "/")
	}
	for _, local := range []string{"http://localhost", "http://127.0.0.1"} {
		if o == local || strings.HasPrefix(o, local+":") {
			return !strings.Contains(o[len(local):], "/")
		}
	}
	return false
}

// AjouterOrigine ajoute une adresse autorisée (sans doublon).
func (c *Config) AjouterOrigine(o string) error {
	o = strings.TrimRight(strings.TrimSpace(o), "/")
	if !OrigineValide(o) {
		return fmt.Errorf("origine invalide : %q (forme attendue : https://adresse-du-logiciel)", o)
	}
	for _, x := range c.Origines {
		if x == o {
			return nil
		}
	}
	c.Origines = append(c.Origines, o)
	return nil
}
