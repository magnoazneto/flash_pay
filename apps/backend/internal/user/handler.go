package user

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/flashpay/backend/internal/domain"
	apimiddleware "github.com/flashpay/backend/pkg/middleware"
	"github.com/go-chi/chi/v5"
)

const (
	defaultListUsersLimit  int   = 20
	maxListUsersLimit      int   = 100
	maxUpdateRoleBodyBytes int64 = 1024
)

type Handler struct {
	service Service
}

func NewHandler(service Service) Handler {
	return Handler{service: service}
}

func (h Handler) Health() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	limit, err := parseIntQuery(r, "limit", defaultListUsersLimit)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if limit > maxListUsersLimit {
		limit = maxListUsersLimit
	}

	offset, err := parseIntQuery(r, "offset", 0)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	response, err := h.service.ListUsers(r.Context(), limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	var req UpdateRoleRequest
	if err := decodeJSON(w, r, &req); err != nil {
		return
	}

	role := strings.TrimSpace(req.Role)
	if role != "admin" && role != "operator" {
		respondError(w, http.StatusBadRequest, "role must be either admin or operator")
		return
	}

	userID := chi.URLParam(r, "id")
	if err := h.service.UpdateRole(r.Context(), userID, role); err != nil {
		h.writeError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "user role updated successfully",
	})
}

func (h Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	requesterID := apimiddleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "id")

	if err := h.service.DeleteUser(r.Context(), requesterID, targetID); err != nil {
		h.writeError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrCannotDeleteSelf):
		respondError(w, http.StatusUnprocessableEntity, domain.ErrCannotDeleteSelf.Error())
	case errors.Is(err, domain.ErrUserNotFound):
		respondError(w, http.StatusNotFound, domain.ErrUserNotFound.Error())
	default:
		respondError(w, http.StatusInternalServerError, "internal server error")
	}
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"message": msg})
}

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func parseIntQuery(r *http.Request, key string, defaultValue int) (int, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return defaultValue, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0, errors.New(key + " must be a non-negative integer")
	}

	return parsed, nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) error {
	if !isJSONContentType(r.Header.Get("Content-Type")) {
		respondError(w, http.StatusUnsupportedMediaType, "content type must be application/json")
		return errors.New("unsupported content type")
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUpdateRoleBodyBytes)
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

		respondError(w, status, message)
		return err
	}

	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		respondError(w, http.StatusBadRequest, "request body must contain a single JSON object")
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
