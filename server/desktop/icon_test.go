package main

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestIconDataMatchesFile(t *testing.T) {
	name := "icon.png"
	if runtime.GOOS == "windows" {
		name = "icon.ico"
	}
	want, err := os.ReadFile(filepath.Join("assets", name))
	if err != nil {
		t.Fatal(err)
	}
	got := iconData()
	if !bytes.Equal(got, want) {
		t.Fatalf("embedded bytes differ from %s (got %d bytes, want %d)", name, len(got), len(want))
	}
	t.Logf("ok: %s, %d bytes", name, len(got))
}
