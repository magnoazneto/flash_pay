package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/flashpay/backend/pkg/config"
	"github.com/flashpay/backend/pkg/database"
	apimiddleware "github.com/flashpay/backend/pkg/middleware"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type healthResponse struct {
	Service     string `json:"service"`
	Status      string `json:"status"`
	Environment string `json:"environment"`
}

func main() {
	cfg := config.Load()
	waitForDB(cfg.DatabaseURL)
	runMigrations(cfg.DatabaseURL)

	db, err := database.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to open database connection: %v", err)
	}
	defer db.Close()

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(apimiddleware.PrometheusMetrics)
	r.Get("/health", healthHandler)
	r.Handle("/metrics", promhttp.Handler())

	address := ":" + cfg.AppPort

	log.Printf("flashpay backend listening on %s", address)

	if err := http.ListenAndServe(address, withCORS(r, cfg.CORSAllowedOrigin)); err != nil {
		log.Fatal(err)
	}
}

func waitForDB(databaseURL string) {
	const maxAttempts = 10
	const delay = 2 * time.Second

	for i := range maxAttempts {
		db, err := database.OpenPostgres(databaseURL)
		if err == nil {
			db.Close()
			return
		}
		log.Printf("waiting for database (attempt %d/%d): %v", i+1, maxAttempts, err)
		time.Sleep(delay)
	}

	log.Fatal("database not reachable after maximum attempts")
}

func runMigrations(databaseURL string) {
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	m, err := migrate.New("file:///app/migrations", databaseURL)
	if err != nil {
		log.Fatalf("failed to initialize migrations: %v", err)
	}
	defer func() {
		sourceErr, databaseErr := m.Close()
		if sourceErr != nil {
			log.Printf("warning: failed to close migration source: %v", sourceErr)
		}
		if databaseErr != nil {
			log.Printf("warning: failed to close migration database: %v", databaseErr)
		}
	}()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("failed to run migrations: %v", err)
	}

	log.Println("migrations applied successfully")
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	response := healthResponse{
		Service:     "flashpay-backend",
		Status:      "ok",
		Environment: config.Environment(),
	}

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func withCORS(next http.Handler, origin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func init() {
	http.DefaultClient.Timeout = 5 * time.Second
}
