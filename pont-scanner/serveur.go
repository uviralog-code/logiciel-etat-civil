// Le pont : un petit serveur local (127.0.0.1) que seules les pages du logiciel d'état civil peuvent utiliser.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Version du pont (affichée dans l'écran du scan).
const Version = "1.0.0"

// Pont : l'état du pont et ses réglages.
type Pont struct {
	cfg         Config
	scanneur    Scanneur
	naps2Trouve bool
	journal     *log.Logger
	maintenant  func() time.Time

	scan sync.Mutex // un seul scan à la fois

	mu          sync.Mutex
	listeLe     time.Time
	scanners    []string
	erreurListe string
}

// NouveauPont prépare le pont.
func NouveauPont(cfg Config, s Scanneur, naps2Trouve bool, journal *log.Logger) *Pont {
	return &Pont{cfg: cfg, scanneur: s, naps2Trouve: naps2Trouve, journal: journal, maintenant: time.Now}
}

// Etat : ce que l'écran du scan affiche (« Scanner HP du bureau · prêt »).
type Etat struct {
	Version     string   `json:"version"`
	Naps2       bool     `json:"naps2"`
	Pilote      string   `json:"pilote"`
	Scanners    []string `json:"scanners"`
	Scanner     *string  `json:"scanner"`
	Dossier     string   `json:"dossier"`
	Pret        bool     `json:"pret"`
	ScanEnCours bool     `json:"scanEnCours"`
	Message     string   `json:"message"`
}

func (p *Pont) etat(ctx context.Context, rafraichir bool) Etat {
	p.mu.Lock()
	defer p.mu.Unlock()
	if rafraichir || p.listeLe.IsZero() || p.maintenant().Sub(p.listeLe) > time.Minute {
		c, annuler := context.WithTimeout(ctx, DelaiListe)
		l, err := p.scanneur.Peripheriques(c)
		annuler()
		p.scanners, p.erreurListe, p.listeLe = l, "", p.maintenant()
		if err != nil {
			p.scanners, p.erreurListe = nil, err.Error()
		}
	}
	e := Etat{Version: Version, Naps2: p.naps2Trouve, Pilote: p.cfg.Pilote, Scanners: append([]string{}, p.scanners...), Dossier: p.cfg.Dossier}
	if s := p.choisirScanner(); s != "" {
		e.Scanner = &s
	}
	if p.scan.TryLock() {
		p.scan.Unlock()
	} else {
		e.ScanEnCours = true
	}
	switch {
	case !p.naps2Trouve:
		e.Message = "NAPS2 n'est pas installé sur cet ordinateur."
	case p.erreurListe != "":
		e.Message = "Le scanner ne répond pas : " + p.erreurListe
	case e.Scanner == nil && p.cfg.Scanner != "":
		e.Message = fmt.Sprintf("Le scanner « %s » n'est pas branché ou pas allumé.", p.cfg.Scanner)
	case e.Scanner == nil:
		e.Message = "Aucun scanner trouvé : vérifiez qu'il est branché et allumé."
	default:
		e.Pret = true
		e.Message = "prêt"
	}
	return e
}

// choisirScanner : celui des réglages s'il est présent, sinon le premier.
func (p *Pont) choisirScanner() string {
	if p.cfg.Scanner != "" {
		for _, s := range p.scanners {
			if strings.EqualFold(s, p.cfg.Scanner) || strings.Contains(strings.ToLower(s), strings.ToLower(p.cfg.Scanner)) {
				return s
			}
		}
		return ""
	}
	if len(p.scanners) > 0 {
		return p.scanners[0]
	}
	return ""
}

// ---------------------------------------------------------------------
// Sécurité
// ---------------------------------------------------------------------

func (p *Pont) origineAutorisee(o string) bool {
	for _, x := range p.cfg.Origines {
		if o == x {
			return true
		}
	}
	return false
}

// hoteLocal : protège contre le « DNS rebinding » (un site qui se ferait passer pour 127.0.0.1).
func (p *Pont) hoteLocal(hote string) bool {
	return hote == fmt.Sprintf("127.0.0.1:%d", p.cfg.Port) || hote == fmt.Sprintf("localhost:%d", p.cfg.Port)
}

func ecrireJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func erreur(w http.ResponseWriter, code int, message string) {
	ecrireJSON(w, code, map[string]string{"erreur": message})
}

// Handler : toutes les adresses du pont, derrière les contrôles de sécurité.
func (p *Pont) Handler() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/etat", p.servirEtat)
	api.HandleFunc("POST /api/scanner", p.servirScan)
	api.HandleFunc("GET /api/dossier", p.servirDossier)
	api.HandleFunc("GET /api/dossier/fichier", p.servirFichier)
	api.HandleFunc("POST /api/dossier/ranger", p.servirRanger)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !p.hoteLocal(r.Host) {
			http.Error(w, "Hôte refusé.", http.StatusMisdirectedRequest)
			return
		}
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			p.servirAccueil(w)
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		origine := r.Header.Get("Origin")
		autorisee := p.origineAutorisee(origine)
		if autorisee {
			w.Header().Set("Access-Control-Allow-Origin", origine)
			w.Header().Set("Access-Control-Expose-Headers", "X-Scanner")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			if !autorisee && !(r.URL.Path == "/api/etat" && origine != "") {
				http.Error(w, "Origine refusée.", http.StatusForbidden)
				return
			}
			// Pré-vérification du navigateur, y compris l'accès au réseau local (Chrome, Edge)
			w.Header().Set("Access-Control-Allow-Origin", origine)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if !autorisee {
			// L'écran du scan peut savoir POURQUOI le pont refuse (et afficher la marche à suivre) ;
			// tout le reste est refusé sans explication.
			if r.URL.Path == "/api/etat" && origine != "" {
				w.Header().Set("Access-Control-Allow-Origin", origine)
				erreur(w, http.StatusForbidden, fmt.Sprintf("Le pont n'autorise pas encore l'adresse %s.", origine))
				return
			}
			erreur(w, http.StatusForbidden, "Origine refusée.")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
		api.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------
// Adresses
// ---------------------------------------------------------------------

func (p *Pont) servirAccueil(w http.ResponseWriter) {
	e := p.etat(context.Background(), false)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	scanner := "aucun"
	if e.Scanner != nil {
		scanner = *e.Scanner
	}
	fmt.Fprintf(w, `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Pont scanner — État civil Uvira</title>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;line-height:1.5">
<h1>Pont scanner de l'état civil : en marche</h1>
<ul><li>Version : %s</li><li>NAPS2 : %s</li><li>Scanner : %s (%s)</li><li>Dossier surveillé : %s</li><li>Adresses autorisées : %s</li></ul>
<p>Cette page sert seulement à vérifier que le pont fonctionne. Le scan se fait depuis l'écran « Scan de l'acte » du logiciel.</p>`,
		Version, ouiNon(e.Naps2), html.EscapeString(scanner), html.EscapeString(e.Message), html.EscapeString(e.Dossier),
		html.EscapeString(strings.Join(p.cfg.Origines, ", ")))
}

func ouiNon(b bool) string {
	if b {
		return "trouvé"
	}
	return "non installé"
}

func (p *Pont) servirEtat(w http.ResponseWriter, r *http.Request) {
	ecrireJSON(w, http.StatusOK, p.etat(r.Context(), r.URL.Query().Get("rafraichir") == "1"))
}

func (p *Pont) servirScan(w http.ResponseWriter, r *http.Request) {
	if !p.scan.TryLock() {
		erreur(w, http.StatusConflict, "Un scan est déjà en cours sur cet ordinateur.")
		return
	}
	defer p.scan.Unlock()

	e := p.etat(r.Context(), true)
	if !e.Pret || e.Scanner == nil {
		erreur(w, http.StatusServiceUnavailable, e.Message)
		return
	}
	fichier, err := os.CreateTemp("", "etatcivil-scan-*.pdf")
	if err != nil {
		erreur(w, http.StatusInternalServerError, "Dossier temporaire inaccessible.")
		return
	}
	sortie := fichier.Name()
	fichier.Close()
	os.Remove(sortie)
	defer os.Remove(sortie)

	ctx, annuler := context.WithTimeout(r.Context(), DelaiScan)
	defer annuler()
	debut := p.maintenant()
	if err := p.scanneur.Scanner(ctx, *e.Scanner, sortie); err != nil {
		p.journal.Printf("scan échoué (%s) : %v", *e.Scanner, err)
		erreur(w, http.StatusBadGateway, "Le scan a échoué : "+err.Error())
		return
	}
	contenu, err := os.ReadFile(sortie)
	if err != nil || len(contenu) == 0 || len(contenu) > TailleMaximum {
		erreur(w, http.StatusBadGateway, "Le fichier scanné est vide ou dépasse 15 Mo.")
		return
	}
	p.journal.Printf("scan réussi (%s) : %d octets en %s", *e.Scanner, len(contenu), p.maintenant().Sub(debut).Round(time.Millisecond))
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Scanner", *e.Scanner)
	_, _ = w.Write(contenu)
}

func (p *Pont) servirDossier(w http.ResponseWriter, r *http.Request) {
	l, err := ListerDossier(p.cfg.Dossier, p.maintenant())
	if err != nil {
		erreur(w, http.StatusInternalServerError, "Dossier surveillé inaccessible : "+p.cfg.Dossier)
		return
	}
	ecrireJSON(w, http.StatusOK, map[string]any{"dossier": p.cfg.Dossier, "fichiers": l})
}

func (p *Pont) servirFichier(w http.ResponseWriter, r *http.Request) {
	nom := r.URL.Query().Get("nom")
	chemin, err := CheminFichier(p.cfg.Dossier, nom)
	if err != nil {
		erreur(w, http.StatusNotFound, err.Error())
		return
	}
	f, err := os.Open(chemin)
	if err != nil {
		erreur(w, http.StatusNotFound, "Fichier introuvable.")
		return
	}
	defer f.Close()
	info, _ := f.Stat()
	w.Header().Set("Content-Type", TypeDuFichier(nom))
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, "", info.ModTime(), f)
}

func (p *Pont) servirRanger(w http.ResponseWriter, r *http.Request) {
	var corps struct {
		Noms []string `json:"noms"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&corps); err != nil || len(corps.Noms) > 50 {
		erreur(w, http.StatusBadRequest, "Demande illisible.")
		return
	}
	n, err := Ranger(p.cfg.Dossier, corps.Noms, p.maintenant())
	if err != nil {
		erreur(w, http.StatusInternalServerError, "Rangement impossible : "+err.Error())
		return
	}
	p.journal.Printf("%d fichier(s) rangé(s) dans Joints", n)
	ecrireJSON(w, http.StatusOK, map[string]int{"ranges": n})
}
