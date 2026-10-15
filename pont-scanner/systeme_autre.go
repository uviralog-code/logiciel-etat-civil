//go:build !windows

package main

import (
	"fmt"
	"os/exec"
)

// Hors de Windows (essais) : pas d'inscription au démarrage, messages dans la console.
func inscrireDemarrage(string) error { return nil }
func retirerDemarrage() error        { return nil }
func lancerEnArrierePlan(programme string) error {
	return exec.Command(programme).Start()
}
func afficherMessage(titre, texte string) { fmt.Printf("%s\n%s\n", titre, texte) }
