package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/pkg/middleware"
	"github.com/go-chi/chi/v5"
)

const integrationJWTSecret = "IntegrationSecret-FlashPay-0123456789!"

type memoryUserRepository struct {
	mu      sync.Mutex
	byID    map[string]domain.User
	byEmail map[string]string
	nextID  int
}

func newMemoryUserRepository() *memoryUserRepository {
	return &memoryUserRepository{
		byID:    make(map[string]domain.User),
		byEmail: make(map[string]string),
	}
}

func (r *memoryUserRepository) FindByID(_ context.Context, id string) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	user, ok := r.byID[id]
	if !ok {
		return domain.User{}, domain.ErrUserNotFound
	}

	return user, nil
}

func (r *memoryUserRepository) FindByEmail(_ context.Context, email string) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id, ok := r.byEmail[email]
	if !ok {
		return domain.User{}, domain.ErrUserNotFound
	}

	return r.byID[id], nil
}

func (r *memoryUserRepository) Create(_ context.Context, user domain.User) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.nextID++
	now := time.Now().UTC()
	user.ID = fmt.Sprintf("user-%d", r.nextID)
	user.CreatedAt = now
	user.UpdatedAt = now
	r.byID[user.ID] = user
	r.byEmail[user.Email] = user.ID

	return user, nil
}

func (r *memoryUserRepository) ListUsers(context.Context, int, int) ([]domain.User, int, error) {
	return nil, 0, nil
}

func (r *memoryUserRepository) UpdateRole(_ context.Context, userID, role string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	user, ok := r.byID[userID]
	if !ok {
		return domain.ErrUserNotFound
	}

	user.Role = role
	user.UpdatedAt = time.Now().UTC()
	r.byID[userID] = user

	return nil
}

func (r *memoryUserRepository) DeleteUser(_ context.Context, userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	user, ok := r.byID[userID]
	if !ok {
		return domain.ErrUserNotFound
	}

	delete(r.byID, userID)
	delete(r.byEmail, user.Email)
	return nil
}

func authTestRouter(repo *memoryUserRepository) http.Handler {
	middleware.SetJWTSecret(integrationJWTSecret)

	service := NewService(repo, integrationJWTSecret, 24)
	handler := NewHandler(service)

	r := chi.NewRouter()
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", handler.Register)
		r.Post("/login", handler.Login)
	})
	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.Auth)
		r.Get("/protected", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
		r.With(middleware.RequireRole("admin")).Get("/admin-only", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	return r
}

func TestAuthHTTP_RegisterLoginAndAuthorizationFlow(t *testing.T) {
	repo := newMemoryUserRepository()
	router := authTestRouter(repo)

	registerBody := map[string]string{
		"name":     "Alice Doe",
		"email":    "alice@flashpay.test",
		"password": "supersecret",
	}

	registerRec := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", registerBody, "")
	if registerRec.Code != http.StatusCreated {
		t.Fatalf("register status = %d, want %d", registerRec.Code, http.StatusCreated)
	}

	var registerResponse AuthResponse
	decodeJSONResponse(t, registerRec, &registerResponse)
	if registerResponse.Token == "" {
		t.Fatal("expected JWT on register response")
	}
	if registerResponse.User.Role != "operator" {
		t.Fatalf("register role = %s, want operator", registerResponse.User.Role)
	}

	loginRec := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"email":    "alice@flashpay.test",
		"password": "supersecret",
	}, "")
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d", loginRec.Code, http.StatusOK)
	}

	var loginResponse AuthResponse
	decodeJSONResponse(t, loginRec, &loginResponse)
	if loginResponse.Token == "" {
		t.Fatal("expected JWT on login response")
	}

	duplicateRec := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", registerBody, "")
	if duplicateRec.Code != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, want %d", duplicateRec.Code, http.StatusConflict)
	}

	invalidLoginRec := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"email":    "alice@flashpay.test",
		"password": "wrong-secret",
	}, "")
	if invalidLoginRec.Code != http.StatusUnauthorized {
		t.Fatalf("invalid login status = %d, want %d", invalidLoginRec.Code, http.StatusUnauthorized)
	}

	protectedRec := performJSONRequest(t, router, http.MethodGet, "/api/protected", nil, "")
	if protectedRec.Code != http.StatusUnauthorized {
		t.Fatalf("protected route without token status = %d, want %d", protectedRec.Code, http.StatusUnauthorized)
	}

	adminOnlyRec := performJSONRequest(t, router, http.MethodGet, "/api/admin-only", nil, loginResponse.Token)
	if adminOnlyRec.Code != http.StatusForbidden {
		t.Fatalf("admin route with operator token status = %d, want %d", adminOnlyRec.Code, http.StatusForbidden)
	}
}

func performJSONRequest(t *testing.T, handler http.Handler, method, path string, payload any, token string) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatalf("failed to encode payload: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, &body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decodeJSONResponse(t *testing.T, rec *httptest.ResponseRecorder, dest any) {
	t.Helper()

	if err := json.Unmarshal(rec.Body.Bytes(), dest); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
}
