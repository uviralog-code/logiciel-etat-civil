//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

const cleDemarrage = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

// inscrireDemarrage : le pont démarre à l'ouverture de la session Windows (sans droits d'administrateur).
func inscrireDemarrage(programme string) error {
	cmd := exec.Command("reg", "add", cleDemarrage, "/v", "EtatCivilScanner", "/t", "REG_SZ", "/d", `"`+programme+`"`, "/f")
	cacherFenetre(cmd)
	return cmd.Run()
}

func retirerDemarrage() error {
	cmd := exec.Command("reg", "delete", cleDemarrage, "/v", "EtatCivilScanner", "/f")
	cacherFenetre(cmd)
	return cmd.Run()
}

func lancerEnArrierePlan(programme string) error {
	cmd := exec.Command(programme)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200} // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
	return cmd.Start()
}

// afficherMessage : une petite fenêtre Windows (le pont n'a pas de fenêtre de console).
func afficherMessage(titre, texte string) {
	t, _ := syscall.UTF16PtrFromString(titre)
	m, _ := syscall.UTF16PtrFromString(texte)
	syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40)
}
