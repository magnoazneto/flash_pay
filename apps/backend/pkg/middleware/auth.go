package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type authContextKey string

const userClaimsContextKey authContextKey = "userClaims"

type UserClaims struct {
	UserID string
	Email  string
	Role   string
}

var jwtSecret []byte

func SetJWTSecret(secret string) {
	jwtSecret = []byte(secret)
}

func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(jwtSecret) == 0 {
			respondJSONError(w, http.StatusInternalServerError, "auth middleware not configured")
			return
		}

		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if authHeader == "" {
			respondUnauthorized(w, "missing authorization header")
			return
		}
		if !strings.HasPrefix(authHeader, "Bearer ") {
			respondUnauthorized(w, "invalid authorization header format")
			return
		}

		tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenString == "" {
			respondUnauthorized(w, "invalid authorization header format")
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			respondUnauthorized(w, "invalid or expired token")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			respondUnauthorized(w, "invalid token claims")
			return
		}

		userClaims, ok := mapClaimsToUserClaims(claims)
		if !ok {
			respondUnauthorized(w, "invalid token claims")
			return
		}

		ctx := context.WithValue(r.Context(), userClaimsContextKey, userClaims)
		ctx = context.WithValue(ctx, ContextKeyUserID, userClaims.UserID)
		ctx = context.WithValue(ctx, ContextKeyEmail, userClaims.Email)
		ctx = context.WithValue(ctx, ContextKeyRole, userClaims.Role)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserClaims(ctx context.Context) (UserClaims, bool) {
	claims, ok := ctx.Value(userClaimsContextKey).(UserClaims)
	return claims, ok
}

func mapClaimsToUserClaims(claims jwt.MapClaims) (UserClaims, bool) {
	userID, ok := claims["user_id"].(string)
	if !ok || userID == "" {
		return UserClaims{}, false
	}

	email, ok := claims["email"].(string)
	if !ok || email == "" {
		return UserClaims{}, false
	}

	role, ok := claims["role"].(string)
	if !ok || role == "" {
		return UserClaims{}, false
	}

	return UserClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
	}, true
}

func respondUnauthorized(w http.ResponseWriter, msg string) {
	respondJSONError(w, http.StatusUnauthorized, msg)
}

func respondJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
