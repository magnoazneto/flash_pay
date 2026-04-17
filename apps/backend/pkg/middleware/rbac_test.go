package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireRole_AdminCanAccessAdminRoute(t *testing.T) {
	rec := httptest.NewRecorder()
	req := requestWithRole(http.MethodGet, "/api/admin/users", "admin")

	RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestRequireRole_OperatorCannotAccessAdminRoute(t *testing.T) {
	rec := httptest.NewRecorder()
	req := requestWithRole(http.MethodGet, "/api/admin/users", "operator")

	RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertRBACForbidden(t, rec)
}

func TestRequireRole_AdminCanAccessMultiRoleRoute(t *testing.T) {
	rec := httptest.NewRecorder()
	req := requestWithRole(http.MethodGet, "/api/admin/users", "admin")

	RequireRole("admin", "operator")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestRequireRole_OperatorCanAccessMultiRoleRoute(t *testing.T) {
	rec := httptest.NewRecorder()
	req := requestWithRole(http.MethodGet, "/api/admin/users", "operator")

	RequireRole("admin", "operator")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestRequireRole_EmptyRoleIsForbidden(t *testing.T) {
	rec := httptest.NewRecorder()
	req := requestWithRole(http.MethodGet, "/api/admin/users", "")

	RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})).ServeHTTP(rec, req)

	assertRBACForbidden(t, rec)
}

func requestWithRole(method, target, role string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	ctx := context.WithValue(req.Context(), ContextKeyRole, role)
	return req.WithContext(ctx)
}

func assertRBACForbidden(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", rec.Code)
	}

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected content type application/json, got %q", got)
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if body["error"] != "insufficient permissions" {
		t.Fatalf("expected error %q, got %q", "insufficient permissions", body["error"])
	}
}
