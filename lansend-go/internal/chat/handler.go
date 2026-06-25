package chat

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fcbyk/lansend/internal/response"
)

func RegisterRoutes(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/chat/messages", func(w http.ResponseWriter, r *http.Request) {
		response.Success(w, map[string]interface{}{
			"messages":   svc.ListMessages(),
			"current_ip": getClientIP(r),
		})
	})

	mux.HandleFunc("POST /api/chat/send", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Error(w, 400, "message is required")
			return
		}

		text := strings.TrimRight(body.Message, " \t\n\r")
		if strings.TrimSpace(text) == "" {
			response.Error(w, 400, "message cannot be empty")
			return
		}

		msg := svc.SendMessage(getClientIP(r), text)
		response.SuccessMsg(w, "message sent", msg)
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
