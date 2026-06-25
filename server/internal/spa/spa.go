package spa

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/fcbyk/lansend/embeddist"
)

func RegisterRoutes(mux *http.ServeMux) {
	assetFS, err := fs.Sub(embeddist.DistSubFS, "assets")
	if err != nil {
		panic("failed to init embedded assets fs: " + err.Error())
	}

	assetHandler := http.FileServer(http.FS(assetFS))
	mux.Handle("/assets/", http.StripPrefix("/assets/", assetHandler))

	indexHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")

		data, err := fs.ReadFile(embeddist.DistSubFS, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Write(data)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		urlPath := r.URL.Path

		if strings.HasPrefix(urlPath, "/api/") {
			http.NotFound(w, r)
			return
		}

		if urlPath == "/" || strings.HasPrefix(urlPath, "/assets/") {
			if urlPath == "/" {
				indexHandler.ServeHTTP(w, r)
			}
			return
		}

		ext := path.Ext(urlPath)
		if ext == "" {
			indexHandler.ServeHTTP(w, r)
			return
		}

		filePath := strings.TrimPrefix(urlPath, "/")
		f, err := embeddist.DistSubFS.Open(filePath)
		if err != nil {
			indexHandler.ServeHTTP(w, r)
			return
		}
		f.Close()
		indexHandler.ServeHTTP(w, r)
	})
}
