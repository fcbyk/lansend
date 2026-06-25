package speedtest

import (
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/fcbyk/lansend/internal/response"
)

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/speedtest/download", func(w http.ResponseWriter, r *http.Request) {
		sizeMB := 50
		if v := r.URL.Query().Get("size"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				sizeMB = n
			}
		}
		if sizeMB > 500 {
			sizeMB = 500
		}

		sizeBytes := int64(sizeMB) * 1024 * 1024

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.FormatInt(sizeBytes, 10))
		w.Header().Set("Content-Disposition", "attachment; filename=speedtest.bin")

		chunkSize := 1024 * 1024
		zeroBuf := make([]byte, chunkSize)
		remaining := sizeBytes
		for remaining > 0 {
			toWrite := int64(chunkSize)
			if remaining < toWrite {
				toWrite = remaining
			}
			w.Write(zeroBuf[:toWrite])
			remaining -= toWrite
		}
	})

	mux.HandleFunc("POST /api/speedtest/upload", func(w http.ResponseWriter, r *http.Request) {
		contentLength := r.ContentLength
		if contentLength > 0 {
			remaining := contentLength
			buf := make([]byte, 1024*1024)
			for remaining > 0 {
				toRead := int64(len(buf))
				if remaining < toRead {
					toRead = remaining
				}
				n, err := r.Body.Read(buf[:toRead])
				if n > 0 {
					remaining -= int64(n)
				}
				if err != nil {
					break
				}
			}
		} else {
			buf := make([]byte, 1024*1024)
			for {
				_, err := r.Body.Read(buf)
				if err != nil {
					break
				}
			}
		}

		response.SuccessMsg(w, "upload test complete", nil)
	})
}

func init() {
	_ = fmt.Sprintf
	_ = io.EOF
}
