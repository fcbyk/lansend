package files

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/fcbyk/lansend/internal/response"
)

var rangeRe = regexp.MustCompile(`bytes=(\d+)-(\d*)`)

func RegisterRoutes(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/file/{filename...}", func(w http.ResponseWriter, r *http.Request) {
		filename := r.PathValue("filename")
		content, err := svc.ReadFileContent(filename)
		if err != nil {
			if err.Error() == "file not found" || strings.Contains(err.Error(), "invalid path") {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			response.Error(w, 500, err.Error())
			return
		}
		response.Success(w, content)
	})

	mux.HandleFunc("GET /api/tree", func(w http.ResponseWriter, r *http.Request) {
		base, err := svc.EnsureSharedDirectory()
		if err != nil {
			response.Error(w, 400, "Shared directory not specified")
			return
		}
		tree := svc.GetFileTree(base, "")
		response.Success(w, map[string]interface{}{"tree": tree})
	})

	mux.HandleFunc("GET /api/directory", func(w http.ResponseWriter, r *http.Request) {
		relPath := strings.Trim(r.URL.Query().Get("path"), "/")
		data, err := svc.GetDirectoryListing(relPath)
		if err != nil {
			if strings.Contains(err.Error(), "directory not found") {
				response.Error(w, 404, "Directory not found")
				return
			}
			response.Error(w, 400, "Shared directory not specified")
			return
		}
		response.Success(w, data)
	})

	mux.HandleFunc("GET /api/preview/{filename...}", func(w http.ResponseWriter, r *http.Request) {
		filename := r.PathValue("filename")
		filePath, err := svc.ResolveFilePath(filename)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}

		fileSize := info.Size()
		rangeHeader := r.Header.Get("Range")
		mimeType := mime.TypeByExtension(filepath.Ext(filePath))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}

		start := int64(0)
		end := fileSize - 1
		statusCode := http.StatusOK

		isMedia := strings.HasPrefix(mimeType, "video/") || strings.HasPrefix(mimeType, "audio/")

		if rangeHeader != "" || isMedia {
			effectiveRange := rangeHeader
			if effectiveRange == "" {
				effectiveRange = "bytes=0-"
			}
			matches := rangeRe.FindStringSubmatch(effectiveRange)
			if matches != nil {
				start, _ = strconv.ParseInt(matches[1], 10, 64)
				if matches[2] != "" {
					end, _ = strconv.ParseInt(matches[2], 10, 64)
				} else {
					end = fileSize - 1
				}

				if start >= fileSize || end >= fileSize {
					w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", fileSize))
					w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
					return
				}

				if isMedia {
					maxMediaChunk := int64(512 * 1024)
					if end > start+maxMediaChunk-1 {
						end = start + maxMediaChunk - 1
					}
				}

				length := end - start + 1
				w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
				w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
				statusCode = http.StatusPartialContent
			}
		}

		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Accept-Ranges", "bytes")
		if statusCode == http.StatusOK {
			w.Header().Set("Content-Length", strconv.FormatInt(fileSize, 10))
		}
		w.Header().Set("Cache-Control", "no-cache")

		f, err := os.Open(filePath)
		if err != nil {
			http.Error(w, "failed to open file", http.StatusInternalServerError)
			return
		}
		defer f.Close()

		f.Seek(start, io.SeekStart)
		w.WriteHeader(statusCode)
		io.CopyN(w, f, end-start+1)
	})

	mux.HandleFunc("GET /api/download/{filename...}", func(w http.ResponseWriter, r *http.Request) {
		filename := r.PathValue("filename")
		filePath, err := svc.ResolveFilePath(filename)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}

		fileSize := info.Size()
		rawName := filepath.Base(filePath)
		safeNameUTF8 := url.QueryEscape(rawName)
		fallbackName := rawName
		ext := filepath.Ext(rawName)
		for _, b := range []byte(fallbackName) {
			if b > 127 {
				fallbackName = ""
				break
			}
		}
		if fallbackName == "" || fallbackName == ext {
			if ext != "" {
				fallbackName = "download" + ext
			} else {
				fallbackName = "download"
			}
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.FormatInt(fileSize, 10))
		w.Header().Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, fallbackName, safeNameUTF8))
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Cache-Control", "no-cache")

		f, err := os.Open(filePath)
		if err != nil {
			http.Error(w, "failed to open file", http.StatusInternalServerError)
			return
		}
		defer f.Close()

		buf := make([]byte, 8192)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
	})

	mux.HandleFunc("POST /api/download-zip", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Error(w, 400, "invalid request body")
			return
		}
		if len(body.Paths) == 0 {
			response.Error(w, 400, "paths required")
			return
		}

		base, err := svc.EnsureSharedDirectory()
		if err != nil {
			response.Error(w, 400, "shared directory not set")
			return
		}

		type item struct {
			rel string
			abs string
		}
		var items []item
		for _, raw := range body.Paths {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				response.Error(w, 400, "invalid path")
				return
			}
			relPath := strings.Trim(strings.ReplaceAll(raw, "\\", "/"), "/")
			absPath, err := svc.ResolveFilePath(relPath)
			if err != nil {
				response.Error(w, 400, "invalid path")
				return
			}
			if _, err := os.Stat(absPath); err != nil {
				response.Error(w, 404, "file not found")
				return
			}
			items = append(items, item{rel: relPath, abs: absPath})
		}

		var zipName string
		if len(items) == 1 {
			baseName := filepath.Base(strings.TrimRight(items[0].rel, "/"))
			if baseName == "" || baseName == "." {
				baseName = "download"
			}
			zipName = baseName + ".zip"
		} else {
			zipName = "lansend.zip"
		}

		safeNameUTF8 := url.QueryEscape(zipName)
		fallbackName := zipName
		ext := filepath.Ext(zipName)
		for _, b := range []byte(fallbackName) {
			if b > 127 {
				fallbackName = ""
				break
			}
		}
		if fallbackName == "" || fallbackName == ext {
			if ext != "" {
				fallbackName = "download" + ext
			} else {
				fallbackName = "download"
			}
		}

		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, fallbackName, safeNameUTF8))
		w.Header().Set("Cache-Control", "no-cache")

		pr, pw := io.Pipe()
		go func() {
			zw := zip.NewWriter(pw)
			arcnameSet := make(map[string]bool)

			addFileToZip := func(zw *zip.Writer, arcname, fullPath string) error {
				if arcnameSet[arcname] {
					return nil
				}
				arcnameSet[arcname] = true
				f, err := os.Open(fullPath)
				if err != nil {
					return nil
				}
				defer f.Close()
				fi, err := f.Stat()
				if err != nil {
					return nil
				}
				fh, err := zip.FileInfoHeader(fi)
				if err != nil {
					return nil
				}
				fh.Name = arcname
				fh.Method = zip.Deflate
				w, err := zw.CreateHeader(fh)
				if err != nil {
					return nil
				}
				io.Copy(w, f)
				return nil
			}

			for _, it := range items {
				info, err := os.Stat(it.abs)
				if err != nil {
					continue
				}
				if info.IsDir() {
					filepath.Walk(it.abs, func(fullPath string, fi os.FileInfo, err error) error {
						if err != nil || fi.IsDir() {
							return nil
						}
						arcname, _ := filepath.Rel(base, fullPath)
						arcname = strings.ReplaceAll(arcname, "\\", "/")
						addFileToZip(zw, arcname, fullPath)
						return nil
					})
				} else {
					arcname := strings.ReplaceAll(it.rel, "\\", "/")
					addFileToZip(zw, arcname, it.abs)
				}
			}
			zw.Close()
			pw.Close()
		}()

		io.Copy(w, pr)
	})
}
