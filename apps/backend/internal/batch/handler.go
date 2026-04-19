package batch

import (
	"encoding/json"
	"errors"
	"net/http"

	apimiddleware "github.com/flashpay/backend/pkg/middleware"
)

const maxUploadBodyBytes int64 = 10 << 20

type Handler struct {
	service Service
}

func NewHandler(service Service) Handler {
	return Handler{service: service}
}

func (h Handler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBodyBytes)

	if err := r.ParseMultipartForm(maxUploadBodyBytes); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			respondError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}

		respondError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	userID := apimiddleware.GetUserID(r.Context())

	response, err := h.service.ProcessUpload(r.Context(), userID, header.Filename, file)
	if err != nil {
		var validationErr *ParseValidationError
		if errors.As(err, &validationErr) {
			respondJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":  "CSV inválido",
				"errors": validationErr.Details,
			})
			return
		}

		respondError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	respondJSON(w, http.StatusAccepted, response)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
