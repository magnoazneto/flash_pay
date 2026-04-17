package middleware

import (
	"context"
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
			http.Error(w, "auth middleware not configured", http.StatusInternalServerError)
			return
		}

		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenString == "" {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		userClaims, ok := mapClaimsToUserClaims(claims)
		if !ok {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userClaimsContextKey, userClaims)))
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
