package middleware

import (
	"encoding/json"
	"net/http"
)

// RequireRole returns 403 when the authenticated user does not have one of the allowed roles.
// It must be used after Auth middleware.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetUserRole(r.Context())
			if _, ok := allowed[role]; !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "insufficient permissions",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
