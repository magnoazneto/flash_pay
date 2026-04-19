package gateway

import (
	"context"
	"log"
	"math/rand"
	"os"
	"strconv"
	"sync"
	"time"
)

const (
	defaultFailureRate = 0.05
	defaultMinDelay    = 100 * time.Millisecond
	defaultMaxDelay    = 500 * time.Millisecond
	defaultFailMessage = "payment processing failed"
)

type GatewayResult struct {
	Success      bool
	ErrorMessage string
}

type GatewayClient interface {
	ProcessPayment(ctx context.Context, paymentID string) GatewayResult
}

type Config struct {
	FailureRate float64
	MinDelay    time.Duration
	MaxDelay    time.Duration
}

type SimulatedGateway struct {
	cfg Config
	rng *rand.Rand
	mu  sync.Mutex
}

type MockGateway struct {
	ShouldFail   bool
	ErrorMessage string
	Delay        time.Duration
}

func DefaultConfig() Config {
	failureRate := getEnvFloat("GATEWAY_FAILURE_RATE", defaultFailureRate)
	if failureRate < 0.0 || failureRate > 1.0 {
		log.Printf("warning: invalid GATEWAY_FAILURE_RATE %v, using default %v", failureRate, defaultFailureRate)
		failureRate = defaultFailureRate
	}

	minDelay := getEnvDuration("GATEWAY_MIN_DELAY_MS", defaultMinDelay)
	maxDelay := getEnvDuration("GATEWAY_MAX_DELAY_MS", defaultMaxDelay)
	if maxDelay < minDelay {
		log.Printf("warning: GATEWAY_MAX_DELAY_MS smaller than GATEWAY_MIN_DELAY_MS, using default max delay %v", defaultMaxDelay)
		maxDelay = defaultMaxDelay
		if maxDelay < minDelay {
			maxDelay = minDelay
		}
	}

	return Config{
		FailureRate: failureRate,
		MinDelay:    minDelay,
		MaxDelay:    maxDelay,
	}
}

func New(cfg Config) *SimulatedGateway {
	if cfg.FailureRate < 0.0 || cfg.FailureRate > 1.0 {
		cfg.FailureRate = defaultFailureRate
	}
	if cfg.MinDelay < 0 {
		cfg.MinDelay = defaultMinDelay
	}
	if cfg.MaxDelay < 0 {
		cfg.MaxDelay = defaultMaxDelay
	}
	if cfg.MaxDelay < cfg.MinDelay {
		cfg.MaxDelay = cfg.MinDelay
	}

	return &SimulatedGateway{
		cfg: cfg,
		rng: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (g *SimulatedGateway) ProcessPayment(ctx context.Context, paymentID string) GatewayResult {
	_ = paymentID

	delay := g.randomDelay()
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return GatewayResult{
			Success:      false,
			ErrorMessage: ctx.Err().Error(),
		}
	case <-timer.C:
	}

	if err := ctx.Err(); err != nil {
		return GatewayResult{
			Success:      false,
			ErrorMessage: err.Error(),
		}
	}

	if g.shouldFail() {
		return GatewayResult{
			Success:      false,
			ErrorMessage: defaultFailMessage,
		}
	}

	return GatewayResult{Success: true}
}

func (m MockGateway) ProcessPayment(ctx context.Context, paymentID string) GatewayResult {
	_ = paymentID

	if m.Delay > 0 {
		timer := time.NewTimer(m.Delay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return GatewayResult{Success: false, ErrorMessage: ctx.Err().Error()}
		case <-timer.C:
		}
	}

	if m.ShouldFail {
		message := m.ErrorMessage
		if message == "" {
			message = defaultFailMessage
		}

		return GatewayResult{
			Success:      false,
			ErrorMessage: message,
		}
	}

	return GatewayResult{Success: true}
}

func (g *SimulatedGateway) randomDelay() time.Duration {
	if g.cfg.MaxDelay <= g.cfg.MinDelay {
		return g.cfg.MinDelay
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	delta := g.cfg.MaxDelay - g.cfg.MinDelay
	return g.cfg.MinDelay + time.Duration(g.rng.Int63n(int64(delta)+1))
}

func (g *SimulatedGateway) shouldFail() bool {
	if g.cfg.FailureRate <= 0 {
		return false
	}
	if g.cfg.FailureRate >= 1 {
		return true
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	return g.rng.Float64() < g.cfg.FailureRate
}

func getEnvFloat(key string, defaultValue float64) float64 {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	parsedValue, err := strconv.ParseFloat(value, 64)
	if err != nil {
		log.Printf("warning: invalid %s value %q, using default %v", key, value, defaultValue)
		return defaultValue
	}

	return parsedValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	parsedValue, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsedValue < 0 {
		log.Printf("warning: invalid %s value %q, using default %v", key, value, defaultValue)
		return defaultValue
	}

	return time.Duration(parsedValue) * time.Millisecond
}
