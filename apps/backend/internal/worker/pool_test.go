package worker

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/gateway"
)

type mockPaymentState struct {
	status       string
	errorMessage *string
	processedAt  bool
}

type mockRepository struct {
	mu                 sync.Mutex
	payments           map[string]mockPaymentState
	updateStatusErr    map[string]error
	setProcessedAtErr  map[string]error
	processingObserved map[string]int
}

func newMockRepository(paymentIDs []string) *mockRepository {
	payments := make(map[string]mockPaymentState, len(paymentIDs))
	for _, id := range paymentIDs {
		payments[id] = mockPaymentState{status: "pending"}
	}

	return &mockRepository{
		payments:           payments,
		updateStatusErr:    make(map[string]error),
		setProcessedAtErr:  make(map[string]error),
		processingObserved: make(map[string]int),
	}
}

func (m *mockRepository) UpdateStatus(_ context.Context, paymentID, status string, errorMessage *string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err, ok := m.updateStatusErr[paymentID+":"+status]; ok {
		return err
	}

	payment := m.payments[paymentID]
	payment.status = status
	if errorMessage != nil {
		message := *errorMessage
		payment.errorMessage = &message
	} else {
		payment.errorMessage = nil
	}
	if status == "processing" {
		m.processingObserved[paymentID]++
	}
	m.payments[paymentID] = payment

	return nil
}

func (m *mockRepository) SetProcessedAt(_ context.Context, paymentID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err, ok := m.setProcessedAtErr[paymentID]; ok {
		return err
	}

	payment := m.payments[paymentID]
	payment.processedAt = true
	m.payments[paymentID] = payment

	return nil
}

func (m *mockRepository) snapshot(paymentID string) mockPaymentState {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.payments[paymentID]
}

func (m *mockRepository) snapshots() map[string]mockPaymentState {
	m.mu.Lock()
	defer m.mu.Unlock()

	cloned := make(map[string]mockPaymentState, len(m.payments))
	for id, state := range m.payments {
		cloned[id] = state
	}

	return cloned
}

type alternatingGateway struct{}

func (alternatingGateway) ProcessPayment(_ context.Context, paymentID string) gateway.GatewayResult {
	switch paymentID {
	case "payment-2", "payment-4":
		return gateway.GatewayResult{Success: false, ErrorMessage: "gateway error"}
	default:
		return gateway.GatewayResult{Success: true}
	}
}

type countingGateway struct {
	delay     time.Duration
	processed atomic.Int32
}

func (g *countingGateway) ProcessPayment(_ context.Context, paymentID string) gateway.GatewayResult {
	_ = paymentID

	time.Sleep(g.delay)
	g.processed.Add(1)

	return gateway.GatewayResult{Success: true}
}

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestPool_AllSuccess(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2", "payment-3", "payment-4", "payment-5"}
	repo := newMockRepository(paymentIDs)
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false}, newTestLogger(), 3)

	pool.Dispatch("batch-success", paymentIDs)

	for _, paymentID := range paymentIDs {
		state := repo.snapshot(paymentID)
		if state.status != "success" {
			t.Fatalf("payment %s status = %s, want success", paymentID, state.status)
		}
		if state.errorMessage != nil {
			t.Fatalf("payment %s error_message = %q, want nil", paymentID, *state.errorMessage)
		}
		if !state.processedAt {
			t.Fatalf("payment %s processedAt = false, want true", paymentID)
		}
	}
}

func TestPool_AllFail(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2", "payment-3", "payment-4", "payment-5"}
	repo := newMockRepository(paymentIDs)
	pool := NewPool(
		repo,
		gateway.MockGateway{ShouldFail: true, ErrorMessage: "gateway error"},
		newTestLogger(),
		3,
	)

	pool.Dispatch("batch-fail", paymentIDs)

	for _, paymentID := range paymentIDs {
		state := repo.snapshot(paymentID)
		if state.status != "failed" {
			t.Fatalf("payment %s status = %s, want failed", paymentID, state.status)
		}
		if state.errorMessage == nil {
			t.Fatalf("payment %s error_message = nil, want gateway error", paymentID)
		}
		if *state.errorMessage != "gateway error" {
			t.Fatalf("payment %s error_message = %q, want gateway error", paymentID, *state.errorMessage)
		}
		if !state.processedAt {
			t.Fatalf("payment %s processedAt = false, want true", paymentID)
		}
	}
}

func TestPool_MixedResults(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2", "payment-3", "payment-4", "payment-5"}
	repo := newMockRepository(paymentIDs)
	pool := NewPool(repo, alternatingGateway{}, newTestLogger(), 2)

	pool.Dispatch("batch-mixed", paymentIDs)

	wantStatus := map[string]string{
		"payment-1": "success",
		"payment-2": "failed",
		"payment-3": "success",
		"payment-4": "failed",
		"payment-5": "success",
	}

	for _, paymentID := range paymentIDs {
		state := repo.snapshot(paymentID)
		if state.status != wantStatus[paymentID] {
			t.Fatalf("payment %s status = %s, want %s", paymentID, state.status, wantStatus[paymentID])
		}

		if wantStatus[paymentID] == "failed" {
			if state.errorMessage == nil || *state.errorMessage != "gateway error" {
				t.Fatalf("payment %s error_message = %v, want gateway error", paymentID, state.errorMessage)
			}
			continue
		}

		if state.errorMessage != nil {
			t.Fatalf("payment %s error_message = %q, want nil", paymentID, *state.errorMessage)
		}
	}
}

func TestPool_DispatchReturnsAfterAllProcessed(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2", "payment-3", "payment-4", "payment-5"}
	repo := newMockRepository(paymentIDs)
	gatewayClient := &countingGateway{delay: 25 * time.Millisecond}
	pool := NewPool(repo, gatewayClient, newTestLogger(), 1)

	start := time.Now()
	pool.Dispatch("batch-sync", paymentIDs)
	elapsed := time.Since(start)

	if gatewayClient.processed.Load() != int32(len(paymentIDs)) {
		t.Fatalf("processed = %d, want %d", gatewayClient.processed.Load(), len(paymentIDs))
	}
	if elapsed < gatewayClient.delay*time.Duration(len(paymentIDs)) {
		t.Fatalf("dispatch returned too early: elapsed = %v, want at least %v", elapsed, gatewayClient.delay*time.Duration(len(paymentIDs)))
	}
}

func TestPool_NoPendingAfterDispatch(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2", "payment-3", "payment-4", "payment-5"}
	repo := newMockRepository(paymentIDs)
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false, Delay: 10 * time.Millisecond}, newTestLogger(), 4)

	pool.Dispatch("batch-no-pending", paymentIDs)

	for paymentID, state := range repo.snapshots() {
		if state.status == "processing" {
			t.Fatalf("payment %s remained in processing after dispatch", paymentID)
		}
		if state.status == "pending" {
			t.Fatalf("payment %s remained in pending after dispatch", paymentID)
		}
	}
}
