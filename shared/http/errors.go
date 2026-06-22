package http

import (
	"encoding/json"
	"net/http"
)

// ErrorResponse is the JSON error envelope (parity with TS error-handler.ts).
type ErrorResponse struct {
	StatusCode int    `json:"statusCode"`
	Error      string `json:"error"`
	Message    string `json:"message"`
}

// WriteJSON writes v as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Status and headers are already committed; the client likely
		// disconnected mid-write. Nothing further can be done.
		return
	}
}

// WriteError writes a JSON error. For 5xx the message is masked to avoid leaking
// internals (parity with the TS handler), otherwise the provided message is used.
func WriteError(w http.ResponseWriter, status int, name, message string) {
	if status >= http.StatusInternalServerError {
		name = "Internal Server Error"
		message = "An unexpected error occurred"
	}
	WriteJSON(w, status, ErrorResponse{StatusCode: status, Error: name, Message: message})
}

// NotFoundHandler returns a JSON 404 (chi NotFound).
func NotFoundHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		WriteError(w, http.StatusNotFound, "Not Found", "route not found")
	}
}

// MethodNotAllowedHandler returns a JSON 405 (chi MethodNotAllowed).
func MethodNotAllowedHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		WriteError(w, http.StatusMethodNotAllowed, "Method Not Allowed", "method not allowed")
	}
}
