package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "test-secret"

func TestAuth_MissingAuthorizationHeader(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertJSONError(t, rec, http.StatusUnauthorized, "missing authorization header")
}

func TestAuth_InvalidAuthorizationHeaderFormat(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Token abc")
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertJSONError(t, rec, http.StatusUnauthorized, "invalid authorization header format")
}

func TestAuth_InvalidSignature(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	token := mustSignToken(t, "another-secret", jwt.SigningMethodHS256, time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertJSONError(t, rec, http.StatusUnauthorized, "invalid or expired token")
}

func TestAuth_ExpiredToken(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	token := mustSignToken(t, testJWTSecret, jwt.SigningMethodHS256, time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertJSONError(t, rec, http.StatusUnauthorized, "invalid or expired token")
}

func TestAuth_UnexpectedAlgorithm(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	token := mustSignNoneToken(t, time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertJSONError(t, rec, http.StatusUnauthorized, "invalid or expired token")
}

func TestAuth_ValidTokenInjectsClaimsIntoContext(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	token := mustSignToken(t, testJWTSecret, jwt.SigningMethodHS256, time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := GetUserClaims(r.Context())
		if !ok {
			t.Fatal("expected user claims in context")
		}

		if claims.UserID != "user-123" {
			t.Fatalf("expected user id user-123, got %q", claims.UserID)
		}
		if claims.Email != "user@example.com" {
			t.Fatalf("expected email user@example.com, got %q", claims.Email)
		}
		if claims.Role != "customer" {
			t.Fatalf("expected role customer, got %q", claims.Role)
		}
		if got := GetUserID(r.Context()); got != "user-123" {
			t.Fatalf("expected GetUserID to return user-123, got %q", got)
		}
		if got := GetUserRole(r.Context()); got != "customer" {
			t.Fatalf("expected GetUserRole to return customer, got %q", got)
		}
		if got, _ := r.Context().Value(ContextKeyEmail).(string); got != "user@example.com" {
			t.Fatalf("expected context email user@example.com, got %q", got)
		}

		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestAuth_PublicRoutesAreNotAffected(t *testing.T) {
	SetJWTSecret(testJWTSecret)

	r := chi.NewRouter()
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})
	r.Route("/api", func(r chi.Router) {
		r.Use(Auth)
		r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	publicReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	publicRec := httptest.NewRecorder()
	r.ServeHTTP(publicRec, publicReq)

	if publicRec.Code != http.StatusOK {
		t.Fatalf("expected public route status 200, got %d", publicRec.Code)
	}

	protectedReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	protectedRec := httptest.NewRecorder()
	r.ServeHTTP(protectedRec, protectedReq)

	assertJSONError(t, protectedRec, http.StatusUnauthorized, "missing authorization header")
}

func mustSignToken(t *testing.T, secret string, method jwt.SigningMethod, exp time.Time) string {
	t.Helper()

	token := jwt.NewWithClaims(method, jwt.MapClaims{
		"user_id": "user-123",
		"email":   "user@example.com",
		"role":    "customer",
		"exp":     exp.Unix(),
	})

	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	return signed
}

func mustSignNoneToken(t *testing.T, exp time.Time) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"user_id": "user-123",
		"email":   "user@example.com",
		"role":    "customer",
		"exp":     exp.Unix(),
	})

	signed, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("failed to sign token with none algorithm: %v", err)
	}

	return signed
}

func assertJSONError(t *testing.T, rec *httptest.ResponseRecorder, expectedStatus int, expectedError string) {
	t.Helper()

	if rec.Code != expectedStatus {
		t.Fatalf("expected status %d, got %d", expectedStatus, rec.Code)
	}

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected content type application/json, got %q", got)
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if body["error"] != expectedError {
		t.Fatalf("expected error %q, got %q", expectedError, body["error"])
	}
}
