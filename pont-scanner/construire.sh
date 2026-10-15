#!/bin/sh
# Fabrique EtatCivilScanner.exe (Windows 64 bits, sans fenêtre de console) et sa version Linux (essais).
# Prérequis : Go 1.24 ou plus récent.
set -e
cd "$(dirname "$0")"
go test ./...
mkdir -p dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H=windowsgui" -o dist/EtatCivilScanner.exe .
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/etatcivil-scanner-linux .
( cd dist && sha256sum EtatCivilScanner.exe > EtatCivilScanner.exe.sha256 )
ls -la dist
