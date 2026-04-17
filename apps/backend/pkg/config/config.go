package config

import (
	"log"
	"os"
)

type Config struct {
	AppPort           string
	AppEnv            string
	DatabaseURL       string
	JWTSecret         string
	CORSAllowedOrigin string
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

	return Config{
		AppPort:           getEnvOrDefault("APP_PORT", "8080"),
		AppEnv:            getEnvOrDefault("APP_ENV", "development"),
		DatabaseURL:       databaseURL,
		JWTSecret:         jwtSecret,
		CORSAllowedOrigin: getEnvOrDefault("CORS_ALLOWED_ORIGIN", "http://localhost:5173"),
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
