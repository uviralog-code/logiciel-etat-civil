// Le dossier surveillé : NAPS2 (ou le bouton du scanner) y dépose les fichiers scannés.
package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// TailleMaximum : comme l'espace « archives » du logiciel (15 Mo).
const TailleMaximum = 15 * 1024 * 1024

// FichierDossier : un fichier proposé à l'officier.
type FichierDossier struct {
	Nom     string    `json:"nom"`
	Taille  int64     `json:"taille"`
	Modifie time.Time `json:"modifie"`
}

var extensions = map[string]string{".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}

// TypeDuFichier : le type du fichier d'après son extension (vide si non accepté).
func TypeDuFichier(nom string) string { return extensions[strings.ToLower(filepath.Ext(nom))] }

// NomSur : un simple nom de fichier du dossier, jamais un chemin (« ..\ », « C:\ »…).
func NomSur(nom string) bool {
	return nom != "" && len(nom) <= 200 && !strings.ContainsAny(nom, `/\:*?"<>|`) && nom != "." && nom != ".." &&
		!strings.HasPrefix(nom, ".") && TypeDuFichier(nom) != ""
}

// ListerDossier : les fichiers récents (7 jours) du dossier, les plus récents d'abord (20 au plus).
// Un fichier modifié il y a moins de 2 secondes est peut-être encore en cours d'écriture : il attend.
func ListerDossier(dossier string, maintenant time.Time) ([]FichierDossier, error) {
	if err := os.MkdirAll(dossier, 0o755); err != nil {
		return nil, err
	}
	entrees, err := os.ReadDir(dossier)
	if err != nil {
		return nil, err
	}
	l := []FichierDossier{}
	for _, e := range entrees {
		if e.IsDir() || !NomSur(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil || info.Size() == 0 || info.Size() > TailleMaximum {
			continue
		}
		age := maintenant.Sub(info.ModTime())
		if age < 2*time.Second || age > 7*24*time.Hour {
			continue
		}
		l = append(l, FichierDossier{Nom: e.Name(), Taille: info.Size(), Modifie: info.ModTime().UTC().Truncate(time.Second)})
	}
	sort.Slice(l, func(i, j int) bool { return l[i].Modifie.After(l[j].Modifie) })
	if len(l) > 20 {
		l = l[:20]
	}
	return l, nil
}

// CheminFichier : le chemin d'un fichier du dossier, après contrôle du nom.
func CheminFichier(dossier, nom string) (string, error) {
	if !NomSur(nom) {
		return "", errors.New("nom de fichier refusé")
	}
	chemin := filepath.Join(dossier, nom)
	info, err := os.Stat(chemin)
	if err != nil || info.IsDir() {
		return "", errors.New("fichier introuvable dans le dossier")
	}
	if info.Size() > TailleMaximum {
		return "", errors.New("fichier trop lourd (15 Mo au plus)")
	}
	return chemin, nil
}

// Ranger : après l'archivage, les fichiers joints vont dans « Joints\AAAA-MM » (rien n'est effacé).
func Ranger(dossier string, noms []string, maintenant time.Time) (int, error) {
	cible := filepath.Join(dossier, "Joints", maintenant.Format("2006-01"))
	if err := os.MkdirAll(cible, 0o755); err != nil {
		return 0, err
	}
	n := 0
	for _, nom := range noms {
		source, err := CheminFichier(dossier, nom)
		if err != nil {
			continue // déjà rangé ou supprimé : rien à faire
		}
		dest := filepath.Join(cible, nom)
		ext := filepath.Ext(nom)
		for i := 2; ; i++ {
			if _, err := os.Stat(dest); errors.Is(err, os.ErrNotExist) {
				break
			}
			dest = filepath.Join(cible, fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(nom, ext), i, ext))
		}
		if err := os.Rename(source, dest); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}
