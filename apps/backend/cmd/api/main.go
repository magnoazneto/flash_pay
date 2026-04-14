package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

type healthResponse struct {
	Service     string `json:"service"`
	Status      string `json:"status"`
	Environment string `json:"environment"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)

	port := envOrDefault("PORT", "8080")
	address := ":" + port

	log.Printf("flashpay backend listening on %s", address)

	if err := http.ListenAndServe(address, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	response := healthResponse{
		Service:     "flashpay-backend",
		Status:      "ok",
		Environment: envOrDefault("APP_ENV", "development"),
	}

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", envOrDefault("CORS_ALLOWED_ORIGIN", "http://localhost:5173"))
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
