package embeddist

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var DistFS embed.FS

var DistSubFS fs.FS

func init() {
	var err error
	DistSubFS, err = fs.Sub(DistFS, "dist")
	if err != nil {
		panic("failed to init embedded dist fs: " + err.Error())
	}
}
