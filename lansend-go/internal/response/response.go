package response

import (
	"encoding/json"
	"net/http"
)

type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func Success(w http.ResponseWriter, data interface{}) {
	writeJSON(w, http.StatusOK, APIResponse{
		Code:    200,
		Message: "success",
		Data:    data,
	})
}

func SuccessMsg(w http.ResponseWriter, message string, data interface{}) {
	writeJSON(w, http.StatusOK, APIResponse{
		Code:    200,
		Message: message,
		Data:    data,
	})
}

func Error(w http.ResponseWriter, code int, message string) {
	writeJSON(w, code, APIResponse{
		Code:    code,
		Message: message,
		Data:    nil,
	})
}

func ErrorData(w http.ResponseWriter, code int, message string, data interface{}) {
	writeJSON(w, code, APIResponse{
		Code:    code,
		Message: message,
		Data:    data,
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}