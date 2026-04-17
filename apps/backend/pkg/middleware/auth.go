package middleware

import "net/http"

// Auth is a placeholder for the JWT middleware that will be introduced in the auth tasks.
func Auth(next http.Handler) http.Handler {
	return next
}
