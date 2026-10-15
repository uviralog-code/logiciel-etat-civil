//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// cacherFenetre : NAPS2.Console ne doit pas ouvrir de fenêtre noire à chaque scan.
func cacherFenetre(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}
