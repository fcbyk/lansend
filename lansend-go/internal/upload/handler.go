package upload

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/fcbyk/lansend/internal/response"
)

func RegisterRoutes(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/upload/init", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		password := r.Header.Get("X-Upload-Password")
		if password == "" {
			password = r.FormValue("password")
		}
		if ok, msg := svc.VerifyPassword(password); !ok {
			response.Error(w, 401, msg)
			return
		}

		filenameRaw := strings.TrimSpace(r.FormValue("filename"))
		size, _ := strconv.ParseInt(r.FormValue("size"), 10, 64)
		relPath := strings.Trim(r.FormValue("path"), "/")
		chunkSize, _ := strconv.ParseInt(r.FormValue("chunk_size"), 10, 64)
		if chunkSize <= 0 {
			chunkSize = 8 * 1024 * 1024
		}
		totalChunks, _ := strconv.Atoi(r.FormValue("total_chunks"))

		meta, err := svc.InitUpload(ip, filenameRaw, size, relPath, chunkSize, totalChunks)
		if err != nil {
			code := 400
			if strings.Contains(err.Error(), "not found") {
				code = 400
			}
			response.Error(w, code, err.Error())
			return
		}

		response.Success(w, map[string]interface{}{
			"upload_id":    meta.UploadID,
			"chunk_size":   meta.ChunkSize,
			"total_chunks": meta.TotalChunks,
			"filename":     meta.Filename,
			"renamed":      meta.Renamed,
		})
	})

	mux.HandleFunc("POST /api/upload/chunk", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		password := r.Header.Get("X-Upload-Password")
		if password == "" {
			password = r.FormValue("password")
		}
		if ok, msg := svc.VerifyPassword(password); !ok {
			response.Error(w, 401, msg)
			return
		}

		uploadID := svc.SafeUploadID(r.URL.Query().Get("upload_id"))
		index, err := strconv.Atoi(r.URL.Query().Get("index"))
		if uploadID == "" {
			response.Error(w, 400, "upload_id is required")
			return
		}
		if err != nil || index < 0 {
			response.Error(w, 400, "index is required")
			return
		}

		if err := svc.SaveChunk(uploadID, index, r.Body, ip); err != nil {
			code := 500
			if strings.Contains(err.Error(), "not found") {
				code = 404
			}
			response.Error(w, code, err.Error())
			return
		}

		response.SuccessMsg(w, "chunk uploaded", nil)
	})

	mux.HandleFunc("POST /api/upload/complete", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		password := r.Header.Get("X-Upload-Password")
		if password == "" {
			password = r.FormValue("password")
		}
		if ok, msg := svc.VerifyPassword(password); !ok {
			response.Error(w, 401, msg)
			return
		}

		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		uploadID := svc.SafeUploadID(getString(body, "upload_id"))
		if uploadID == "" {
			response.Error(w, 400, "upload_id is required")
			return
		}

		result, err := svc.CompleteUpload(uploadID, ip)
		if err != nil {
			code := 500
			if strings.Contains(err.Error(), "not found") {
				code = 404
			} else if strings.Contains(err.Error(), "missing chunks") {
				code = 400
			}
			response.Error(w, code, err.Error())
			return
		}

		response.SuccessMsg(w, "file uploaded", result)
	})

	mux.HandleFunc("POST /api/upload/abort", func(w http.ResponseWriter, r *http.Request) {
		password := r.Header.Get("X-Upload-Password")
		if password == "" {
			password = r.FormValue("password")
		}
		if ok, msg := svc.VerifyPassword(password); !ok {
			response.Error(w, 401, msg)
			return
		}

		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		uploadID := svc.SafeUploadID(getString(body, "upload_id"))
		if uploadID == "" {
			response.Error(w, 400, "upload_id is required")
			return
		}

		svc.AbortUpload(uploadID)
		response.SuccessMsg(w, "upload aborted", nil)
	})

	mux.HandleFunc("POST /upload", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		relPath := strings.Trim(r.FormValue("path"), "/")

		password := r.FormValue("password")
		if ok, msg := svc.VerifyPassword(password); !ok {
			svc.FileService.Config = svc.Config
			svc.logUpload(ip, 0, "failed (wrong or missing password)", relPath, 0)
			response.Error(w, 401, msg)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			svc.logUpload(ip, 0, "failed (no file field)", relPath, 0)
			response.Error(w, 400, "missing file")
			return
		}
		defer file.Close()

		if header.Filename == "" {
			svc.logUpload(ip, 0, "failed (no file selected)", relPath, 0)
			response.Error(w, 400, "no file selected")
			return
		}

		fileSize := header.Size
		if fileSize <= 0 {
			sizeHint, _ := strconv.ParseInt(r.FormValue("size"), 10, 64)
			if sizeHint > 0 {
				fileSize = sizeHint
			}
		}

		result, err := svc.SaveFile(ip, file, header.Filename, relPath, fileSize)
		if err != nil {
			code := 500
			if strings.Contains(err.Error(), "not found") {
				code = 400
			}
			response.Error(w, code, err.Error())
			return
		}

		response.SuccessMsg(w, "file uploaded", result)
	})
}

func getClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		host = host[:idx]
	}
	if host == "" {
		host = "unknown"
	}
	return host
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
