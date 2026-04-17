package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

var (
	registerMetricsOnce sync.Once

	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests processed by the backend.",
		},
		[]string{"method", "path", "status_code"},
	)

	httpRequestDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5},
		},
		[]string{"method", "path"},
	)

	httpRequestsInFlight = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Current number of in-flight HTTP requests.",
		},
		[]string{"method", "path"},
	)
)

func init() {
	registerMetricsOnce.Do(func() {
		prometheus.MustRegister(
			httpRequestsTotal,
			httpRequestDurationSeconds,
			httpRequestsInFlight,
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}

	return w.ResponseWriter.Write(b)
}

func PrometheusMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		method := r.Method
		inFlightPath := routePatternOrUnknown(r)

		httpRequestsInFlight.WithLabelValues(method, inFlightPath).Inc()
		defer httpRequestsInFlight.WithLabelValues(method, inFlightPath).Dec()

		next.ServeHTTP(writer, r)

		path := routePatternOrFallback(r)
		statusCode := strconv.Itoa(writer.status)

		httpRequestsTotal.WithLabelValues(method, path, statusCode).Inc()
		httpRequestDurationSeconds.WithLabelValues(method, path).Observe(time.Since(start).Seconds())
	})
}

func routePatternOrUnknown(r *http.Request) string {
	if ctx := chi.RouteContext(r.Context()); ctx != nil {
		if pattern := ctx.RoutePattern(); pattern != "" {
			return pattern
		}
	}

	return "unknown"
}

func routePatternOrFallback(r *http.Request) string {
	if ctx := chi.RouteContext(r.Context()); ctx != nil {
		if pattern := ctx.RoutePattern(); pattern != "" {
			return pattern
		}
	}

	if r.URL.Path != "" {
		return r.URL.Path
	}

	return "unknown"
}
