package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const origine = "https://etatcivil.exemple.cd"

type fauxScanneur struct {
	scanners []string
	erreur   error
	pdf      []byte
	attente  chan struct{}
	appels   []string
}

func (f *fauxScanneur) Peripheriques(context.Context) ([]string, error) { return f.scanners, f.erreur }
func (f *fauxScanneur) Scanner(_ context.Context, p, sortie string) error {
	f.appels = append(f.appels, p)
	if f.attente != nil {
		<-f.attente
	}
	if f.pdf == nil {
		return errors.New("Bourrage papier")
	}
	return os.WriteFile(sortie, f.pdf, 0o644)
}

func nouveau(t *testing.T, s Scanneur, modif func(*Config)) (*Pont, Config) {
	t.Helper()
	cfg := ConfigParDefaut(t.TempDir())
	cfg.Origines = []string{origine}
	if modif != nil {
		modif(&cfg)
	}
	return NouveauPont(cfg, s, true, log.New(io.Discard, "", 0)), cfg
}

func requete(p *Pont, methode, chemin, orig string, corps string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(methode, chemin, strings.NewReader(corps))
	r.Host = "127.0.0.1:47820"
	if orig != "" {
		r.Header.Set("Origin", orig)
	}
	w := httptest.NewRecorder()
	p.Handler().ServeHTTP(w, r)
	return w
}

func TestSecurite(t *testing.T) {
	p, _ := nouveau(t, &fauxScanneur{scanners: []string{"HP"}}, nil)

	// Hôte étranger (DNS rebinding) : refusé
	r := httptest.NewRequest("GET", "/api/etat", nil)
	r.Host = "pirate.exemple:47820"
	r.Header.Set("Origin", origine)
	w := httptest.NewRecorder()
	p.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusMisdirectedRequest {
		t.Fatalf("hôte étranger : %d", w.Code)
	}

	// Site non autorisé : l'état dit pourquoi (pour l'écran), le reste est refusé sans CORS
	w = requete(p, "GET", "/api/etat", "https://autre-site.exemple", "")
	if w.Code != 403 || !strings.Contains(w.Body.String(), "n'autorise pas encore l'adresse https://autre-site.exemple") || w.Header().Get("Access-Control-Allow-Origin") != "https://autre-site.exemple" {
		t.Fatalf("état, origine refusée : %d %s", w.Code, w.Body)
	}
	for _, c := range []struct{ m, chemin string }{{"POST", "/api/scanner"}, {"GET", "/api/dossier"}, {"GET", "/api/dossier/fichier?nom=a.pdf"}, {"POST", "/api/dossier/ranger"}} {
		w = requete(p, c.m, c.chemin, "https://autre-site.exemple", "")
		if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("%s %s depuis un autre site : %d", c.m, c.chemin, w.Code)
		}
		w = requete(p, c.m, c.chemin, "", "")
		if w.Code != 403 {
			t.Fatalf("%s %s sans origine : %d", c.m, c.chemin, w.Code)
		}
	}

	// Pré-vérification du navigateur (réseau local) pour le logiciel
	w = requete(p, "OPTIONS", "/api/scanner", origine, "")
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Private-Network") != "true" || w.Header().Get("Access-Control-Allow-Origin") != origine {
		t.Fatalf("pré-vérification : %d %v", w.Code, w.Header())
	}
	if w = requete(p, "OPTIONS", "/api/scanner", "https://autre-site.exemple", ""); w.Code != 403 {
		t.Fatalf("pré-vérification d'un autre site : %d", w.Code)
	}

	// Page d'accueil (vérification à la main dans le navigateur)
	w = requete(p, "GET", "/", "", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Pont scanner de l'état civil : en marche") {
		t.Fatalf("accueil : %d", w.Code)
	}
}

func TestEtat(t *testing.T) {
	lire := func(w *httptest.ResponseRecorder) Etat {
		var e Etat
		_ = json.Unmarshal(w.Body.Bytes(), &e)
		return e
	}
	p, _ := nouveau(t, &fauxScanneur{scanners: []string{"HP LaserJet MFP M28w (WIA)", "Canon"}}, nil)
	e := lire(requete(p, "GET", "/api/etat", origine, ""))
	if !e.Pret || *e.Scanner != "HP LaserJet MFP M28w (WIA)" || e.Message != "prêt" || e.Version != Version {
		t.Fatalf("prêt : %+v", e)
	}
	p, _ = nouveau(t, &fauxScanneur{scanners: []string{"HP LaserJet", "Canon LiDE 300"}}, func(c *Config) { c.Scanner = "canon" })
	if e = lire(requete(p, "GET", "/api/etat", origine, "")); *e.Scanner != "Canon LiDE 300" {
		t.Fatalf("scanner choisi : %+v", e)
	}
	p, _ = nouveau(t, &fauxScanneur{}, nil)
	if e = lire(requete(p, "GET", "/api/etat", origine, "")); e.Pret || e.Message != "Aucun scanner trouvé : vérifiez qu'il est branché et allumé." {
		t.Fatalf("aucun scanner : %+v", e)
	}
	p, _ = nouveau(t, &fauxScanneur{erreur: errors.New("WIA indisponible")}, nil)
	if e = lire(requete(p, "GET", "/api/etat", origine, "")); e.Pret || e.Message != "Le scanner ne répond pas : WIA indisponible" {
		t.Fatalf("erreur WIA : %+v", e)
	}
	p, _ = nouveau(t, &fauxScanneur{scanners: []string{"HP"}}, nil)
	p.naps2Trouve = false
	if e = lire(requete(p, "GET", "/api/etat", origine, "")); e.Pret || e.Message != "NAPS2 n'est pas installé sur cet ordinateur." {
		t.Fatalf("sans NAPS2 : %+v", e)
	}
}

func TestScan(t *testing.T) {
	pdf := []byte("%PDF-1.7 page scannée")
	s := &fauxScanneur{scanners: []string{"HP"}, pdf: pdf}
	p, _ := nouveau(t, s, nil)
	w := requete(p, "POST", "/api/scanner", origine, "")
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), pdf) || w.Header().Get("Content-Type") != "application/pdf" || w.Header().Get("X-Scanner") != "HP" {
		t.Fatalf("scan : %d %s", w.Code, w.Body)
	}
	if w.Header().Get("Access-Control-Expose-Headers") != "X-Scanner" {
		t.Fatalf("en-tête X-Scanner non lisible par la page")
	}

	// Échec du scanner : message clair
	s.pdf = nil
	if w = requete(p, "POST", "/api/scanner", origine, ""); w.Code != 502 || !strings.Contains(w.Body.String(), "Le scan a échoué : Bourrage papier") {
		t.Fatalf("échec : %d %s", w.Code, w.Body)
	}

	// Un seul scan à la fois
	s.pdf = pdf
	s.attente = make(chan struct{})
	fini := make(chan *httptest.ResponseRecorder)
	go func() { fini <- requete(p, "POST", "/api/scanner", origine, "") }()
	time.Sleep(100 * time.Millisecond)
	if w = requete(p, "POST", "/api/scanner", origine, ""); w.Code != 409 {
		t.Fatalf("deuxième scan simultané : %d", w.Code)
	}
	var e Etat
	_ = json.Unmarshal(requete(p, "GET", "/api/etat", origine, "").Body.Bytes(), &e)
	if !e.ScanEnCours {
		t.Fatalf("état pendant le scan : %+v", e)
	}
	close(s.attente)
	if w = <-fini; w.Code != 200 {
		t.Fatalf("premier scan : %d", w.Code)
	}
}

func TestDossier(t *testing.T) {
	p, cfg := nouveau(t, &fauxScanneur{}, nil)
	ecrire := func(nom string, age time.Duration) {
		chemin := filepath.Join(cfg.Dossier, nom)
		_ = os.MkdirAll(cfg.Dossier, 0o755)
		_ = os.WriteFile(chemin, []byte("%PDF-1.7 "+nom), 0o644)
		_ = os.Chtimes(chemin, time.Now().Add(-age), time.Now().Add(-age))
	}
	ecrire("scan-ancien.pdf", 2*time.Hour)
	ecrire("scan-recent.PDF", 10*time.Minute)
	ecrire("photo.jpg", time.Hour)
	ecrire("en-cours.pdf", 0)                // encore en écriture : attend
	ecrire("tres-vieux.pdf", 8*24*time.Hour) // plus de 7 jours
	ecrire("notes.txt", time.Hour)           // pas un document
	ecrire(".cache.pdf", time.Hour)          // caché

	var l struct {
		Fichiers []FichierDossier `json:"fichiers"`
	}
	w := requete(p, "GET", "/api/dossier", origine, "")
	_ = json.Unmarshal(w.Body.Bytes(), &l)
	var noms []string
	for _, f := range l.Fichiers {
		noms = append(noms, f.Nom)
	}
	if strings.Join(noms, ",") != "scan-recent.PDF,photo.jpg,scan-ancien.pdf" {
		t.Fatalf("liste : %v", noms)
	}

	w = requete(p, "GET", "/api/dossier/fichier?nom=scan-recent.PDF", origine, "")
	if w.Code != 200 || w.Body.String() != "%PDF-1.7 scan-recent.PDF" || w.Header().Get("Content-Type") != "application/pdf" {
		t.Fatalf("lecture : %d %s", w.Code, w.Header())
	}
	for _, nom := range []string{"../pont-scanner.json", `..\secret.pdf`, "C:secret.pdf", "notes.txt", "absent.pdf"} {
		if w = requete(p, "GET", "/api/dossier/fichier?nom="+nom, origine, ""); w.Code != 404 {
			t.Fatalf("nom %q : %d", nom, w.Code)
		}
	}

	// Rangement après l'archivage : déplacé dans Joints\AAAA-MM, rien n'est effacé
	ecrire("joint.pdf", time.Hour)
	_ = os.MkdirAll(filepath.Join(cfg.Dossier, "Joints", time.Now().Format("2006-01")), 0o755)
	_ = os.WriteFile(filepath.Join(cfg.Dossier, "Joints", time.Now().Format("2006-01"), "joint.pdf"), []byte("ancien"), 0o644)
	w = requete(p, "POST", "/api/dossier/ranger", origine, `{"noms":["joint.pdf","photo.jpg","../x.pdf","absent.pdf"]}`)
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"ranges":2}` {
		t.Fatalf("rangement : %d %s", w.Code, w.Body)
	}
	mois := filepath.Join(cfg.Dossier, "Joints", time.Now().Format("2006-01"))
	for _, nom := range []string{"joint.pdf", "joint (2).pdf", "photo.jpg"} {
		if _, err := os.Stat(filepath.Join(mois, nom)); err != nil {
			t.Fatalf("%s absent de Joints : %v", nom, err)
		}
	}
	if _, err := os.Stat(filepath.Join(cfg.Dossier, "joint.pdf")); !os.IsNotExist(err) {
		t.Fatalf("joint.pdf toujours dans le dossier")
	}
}

func TestConfig(t *testing.T) {
	racine := t.TempDir()
	chemin := filepath.Join(racine, "pont-scanner.json")
	c, err := ChargerConfig(chemin, racine)
	if err != nil || c.Port != 47820 || c.Dpi != 200 || c.Couleur != "color" || c.Pilote != "wia" || c.Dossier != filepath.Join(racine, "Scans") {
		t.Fatalf("défauts : %+v %v", c, err)
	}
	if _, err := os.Stat(chemin); err != nil {
		t.Fatalf("fichier de réglages non créé")
	}
	for o, ok := range map[string]bool{
		"https://etatcivil.exemple.cd": true, "http://localhost:3000": true, "http://127.0.0.1:3000": true,
		"http://etatcivil.exemple.cd": false, "https://*.exemple.cd": false, "https://a.cd/chemin": false, "https://": false, "localhost": false,
	} {
		if OrigineValide(o) != ok {
			t.Errorf("OrigineValide(%q) = %v", o, !ok)
		}
	}
	if err := c.AjouterOrigine("https://etatcivil.exemple.cd/"); err != nil || len(c.Origines) != 1 || c.Origines[0] != "https://etatcivil.exemple.cd" {
		t.Fatalf("ajout : %v %v", c.Origines, err)
	}
	_ = c.AjouterOrigine("https://etatcivil.exemple.cd")
	if len(c.Origines) != 1 {
		t.Fatalf("doublon ajouté")
	}
	c.Dpi = 1200
	if c.Verifier() == nil {
		t.Fatalf("résolution absurde acceptée")
	}
}
