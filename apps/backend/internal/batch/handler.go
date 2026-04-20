package batch

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/go-chi/chi/v5"

	apimiddleware "github.com/flashpay/backend/pkg/middleware"
)

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

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

func (h Handler) List(w http.ResponseWriter, r *http.Request) {
	limit, err := parseQueryInt(r, "limit", 20)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	offset, err := parseQueryInt(r, "offset", 0)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	userID := apimiddleware.GetUserID(r.Context())

	response, err := h.service.List(r.Context(), userID, limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	batchID := chi.URLParam(r, "id")
	userID := apimiddleware.GetUserID(r.Context())
	role := apimiddleware.GetUserRole(r.Context())

	response, err := h.service.GetByID(r.Context(), batchID, userID, role)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrForbidden):
			respondError(w, http.StatusForbidden, "forbidden")
			return
		case errors.Is(err, domain.ErrNotFound):
			respondError(w, http.StatusNotFound, "batch not found")
			return
		default:
			respondError(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	respondJSON(w, http.StatusOK, response)
}

func (h Handler) Stream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		respondError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	batchID := chi.URLParam(r, "id")
	userID := apimiddleware.GetUserID(r.Context())
	role := apimiddleware.GetUserRole(r.Context())

	subscription, err := h.service.Stream(r.Context(), batchID, userID, role)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrForbidden):
			respondError(w, http.StatusForbidden, "forbidden")
			return
		case errors.Is(err, domain.ErrNotFound):
			respondError(w, http.StatusNotFound, "batch not found")
			return
		default:
			respondError(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}
	defer subscription.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	keepAlive := time.NewTicker(15 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepAlive.C:
			if _, err := w.Write([]byte(": keep-alive\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-subscription.Events():
			if !ok {
				return
			}

			if err := writeSSEEvent(w, event); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h Handler) ListAll(w http.ResponseWriter, r *http.Request) {
	limit, err := parseQueryInt(r, "limit", 20)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	offset, err := parseQueryInt(r, "offset", 0)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	filterUserID := r.URL.Query().Get("user_id")
	if filterUserID != "" && !uuidRe.MatchString(filterUserID) {
		respondError(w, http.StatusBadRequest, "invalid user_id format")
		return
	}

	response, err := h.service.ListAll(r.Context(), filterUserID, limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func parseQueryInt(r *http.Request, key string, defaultValue int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return defaultValue, nil
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, errors.New("invalid " + key)
	}

	return value, nil
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeSSEEvent(w http.ResponseWriter, event StreamEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, payload)
	return err
}
