package config

import (
	"log"
	"os"
	"strconv"

	"github.com/flashpay/backend/internal/auth"
)

type Config struct {
	AppPort            string
	AppEnv             string
	DatabaseURL        string
	JWTSecret          string
	JWTExpirationHours int
	CORSAllowedOrigin  string
}

func Load() Config {
	databaseURL := getEnvOrDefault("DATABASE_URL", "")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	jwtSecret := getEnvOrDefault("JWT_SECRET", "")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	if !auth.IsStrongSecret(jwtSecret) {
		log.Fatal("JWT_SECRET must be at least 32 chars and include a strong mix of character classes")
	}

	corsAllowedOrigin := getEnvOrDefault("CORS_ALLOWED_ORIGIN", "http://localhost:5173")
	if getEnvOrDefault("APP_ENV", "development") == "production" && corsAllowedOrigin == "*" {
		log.Fatal("CORS_ALLOWED_ORIGIN cannot be '*' in production")
	}

	return Config{
		AppPort:            getEnvOrDefault("APP_PORT", "8080"),
		AppEnv:             getEnvOrDefault("APP_ENV", "development"),
		DatabaseURL:        databaseURL,
		JWTSecret:          jwtSecret,
		JWTExpirationHours: getEnvAsInt("JWT_EXPIRATION_HOURS", 24),
		CORSAllowedOrigin:  corsAllowedOrigin,
	}
}

func Environment() string {
	return getEnvOrDefault("APP_ENV", "development")
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	parsedValue, err := strconv.Atoi(value)
	if err != nil || parsedValue <= 0 {
		return defaultValue
	}

	return parsedValue
}
