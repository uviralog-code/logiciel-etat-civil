//go:build !windows

package main

import "os/exec"

func cacherFenetre(*exec.Cmd) {}
