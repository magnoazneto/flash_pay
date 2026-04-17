package auth

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/flashpay/backend/internal/domain"
)

const maxAuthBodyBytes int64 = 8 * 1024

type Handler struct {
	service Service
}

func NewHandler(service Service) Handler {
	return Handler{service: service}
}

func (h Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := decodeJSON(w, r, &req); err != nil {
		return
	}

	response, err := h.service.Register(r.Context(), req)
	if err != nil {
		h.writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, response)
}

func (h Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		return
	}

	response, err := h.service.Login(r.Context(), req)
	if err != nil {
		h.writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h Handler) writeError(w http.ResponseWriter, err error) {
	var validationErrors ValidationErrors

	switch {
	case errors.As(err, &validationErrors):
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"message": "validation failed",
			"errors":  validationErrors,
		})
	case errors.Is(err, domain.ErrEmailAlreadyExists):
		writeJSON(w, http.StatusConflict, map[string]any{
			"message": "email already exists",
		})
	case errors.Is(err, domain.ErrInvalidCredentials):
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"message": "invalid credentials",
		})
	default:
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"message": "internal server error",
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) error {
	if !isJSONContentType(r.Header.Get("Content-Type")) {
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]any{
			"message": "content type must be application/json",
		})
		return errors.New("unsupported content type")
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuthBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dest); err != nil {
		status := http.StatusBadRequest
		message := "invalid request body"

		switch {
		case errors.Is(err, io.EOF):
			message = "request body is required"
		case strings.Contains(err.Error(), "http: request body too large"):
			status = http.StatusRequestEntityTooLarge
			message = "request body too large"
		}

		writeJSON(w, status, map[string]any{
			"message": message,
		})
		return err
	}

	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"message": "request body must contain a single JSON object",
		})
		return errors.New("multiple json values")
	}

	return nil
}

func isJSONContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}

	return mediaType == "application/json"
}
