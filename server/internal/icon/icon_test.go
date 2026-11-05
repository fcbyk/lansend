package icon

import (
	"bytes"
	"os"
	"runtime"
	"testing"
)

func TestDataMatchesFile(t *testing.T) {
	name := "icon.png"
	if runtime.GOOS == "windows" {
		name = "icon.ico"
	}
	want, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	got := Data()
	if !bytes.Equal(got, want) {
		t.Fatalf("embedded bytes differ from %s (got %d bytes, want %d)", name, len(got), len(want))
	}
	t.Logf("ok: %s, %d bytes", name, len(got))
}
