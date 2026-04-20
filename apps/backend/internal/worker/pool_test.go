package worker

import (
	"context"
	"errors"
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

type broadcastEvent struct {
	kind              string
	batchID           string
	paymentID         string
	status            string
	errorMessage      *string
	totalPayments     int
	completedPayments int
}

type mockBroadcaster struct {
	mu     sync.Mutex
	events []broadcastEvent
}

func (m *mockBroadcaster) PublishPaymentStatus(batchID, paymentID, status string, errorMessage *string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	event := broadcastEvent{
		kind:      "payment",
		batchID:   batchID,
		paymentID: paymentID,
		status:    status,
	}
	if errorMessage != nil {
		cloned := *errorMessage
		event.errorMessage = &cloned
	}

	m.events = append(m.events, event)
}

func (m *mockBroadcaster) PublishBatchDone(batchID string, totalPayments, completedPayments int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.events = append(m.events, broadcastEvent{
		kind:              "batch_done",
		batchID:           batchID,
		totalPayments:     totalPayments,
		completedPayments: completedPayments,
	})
}

func (m *mockBroadcaster) snapshot() []broadcastEvent {
	m.mu.Lock()
	defer m.mu.Unlock()

	cloned := make([]broadcastEvent, len(m.events))
	copy(cloned, m.events)
	return cloned
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
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false}, nil, newTestLogger(), 3)

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
		nil,
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
	pool := NewPool(repo, alternatingGateway{}, nil, newTestLogger(), 2)

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
	pool := NewPool(repo, gatewayClient, nil, newTestLogger(), 1)

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
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false, Delay: 10 * time.Millisecond}, nil, newTestLogger(), 4)

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

func TestPool_BroadcastsStatusUpdatesAndBatchDone(t *testing.T) {
	t.Parallel()

	paymentIDs := []string{"payment-1", "payment-2"}
	repo := newMockRepository(paymentIDs)
	broadcaster := &mockBroadcaster{}
	pool := NewPool(repo, alternatingGateway{}, broadcaster, newTestLogger(), 1)

	pool.Dispatch("batch-stream", paymentIDs)

	events := broadcaster.snapshot()
	if len(events) != 5 {
		t.Fatalf("broadcast event count = %d, want 5", len(events))
	}

	wantKinds := []string{"payment", "payment", "payment", "payment", "batch_done"}
	for index, event := range events {
		if event.kind != wantKinds[index] {
			t.Fatalf("event %d kind = %s, want %s", index, event.kind, wantKinds[index])
		}
		if event.batchID != "batch-stream" {
			t.Fatalf("event %d batch_id = %s, want batch-stream", index, event.batchID)
		}
	}

	if events[0].status != "processing" || events[1].status != "success" {
		t.Fatalf("first payment events = [%s, %s], want [processing, success]", events[0].status, events[1].status)
	}

	if events[2].status != "processing" || events[3].status != "failed" {
		t.Fatalf("second payment events = [%s, %s], want [processing, failed]", events[2].status, events[3].status)
	}

	if events[3].errorMessage == nil || *events[3].errorMessage != "gateway error" {
		t.Fatalf("failed payment error message = %v, want gateway error", events[3].errorMessage)
	}

	doneEvent := events[4]
	if doneEvent.totalPayments != len(paymentIDs) || doneEvent.completedPayments != len(paymentIDs) {
		t.Fatalf("batch_done totals = (%d, %d), want (%d, %d)", doneEvent.totalPayments, doneEvent.completedPayments, len(paymentIDs), len(paymentIDs))
	}
}

func TestWorkerPoolSizeUsesEnvAndFallsBackForInvalidValues(t *testing.T) {
	t.Setenv("WORKER_POOL_SIZE", "9")
	if got := WorkerPoolSize(); got != 9 {
		t.Fatalf("WorkerPoolSize() = %d, want 9", got)
	}

	t.Setenv("WORKER_POOL_SIZE", "invalid")
	if got := WorkerPoolSize(); got != defaultWorkerPoolSize {
		t.Fatalf("WorkerPoolSize() with invalid env = %d, want %d", got, defaultWorkerPoolSize)
	}

	t.Setenv("WORKER_POOL_SIZE", "0")
	if got := WorkerPoolSize(); got != defaultWorkerPoolSize {
		t.Fatalf("WorkerPoolSize() with zero env = %d, want %d", got, defaultWorkerPoolSize)
	}
}

func TestNewPoolFallsBackToEnvConfiguredWorkerCountAndDefaultLogger(t *testing.T) {
	t.Setenv("WORKER_POOL_SIZE", "7")
	pool := NewPool(newMockRepository(nil), gateway.MockGateway{}, nil, nil, 0)

	if pool.numWorkers != 7 {
		t.Fatalf("pool.numWorkers = %d, want 7", pool.numWorkers)
	}
	if pool.logger == nil {
		t.Fatal("expected logger to be initialized")
	}
}

func TestPool_DispatchWithNoPaymentsPublishesBatchDone(t *testing.T) {
	t.Parallel()

	broadcaster := &mockBroadcaster{}
	pool := NewPool(newMockRepository(nil), gateway.MockGateway{}, broadcaster, newTestLogger(), 0)

	pool.Dispatch("batch-empty", nil)

	events := broadcaster.snapshot()
	if len(events) != 1 {
		t.Fatalf("broadcast event count = %d, want 1", len(events))
	}
	if events[0].kind != "batch_done" {
		t.Fatalf("event kind = %s, want batch_done", events[0].kind)
	}
	if events[0].totalPayments != 0 || events[0].completedPayments != 0 {
		t.Fatalf("batch_done totals = (%d, %d), want (0, 0)", events[0].totalPayments, events[0].completedPayments)
	}
}

func TestPool_ProcessStopsWhenProcessingStatusUpdateFails(t *testing.T) {
	t.Parallel()

	repo := newMockRepository([]string{"payment-1"})
	repo.updateStatusErr["payment-1:processing"] = errors.New("boom")
	broadcaster := &mockBroadcaster{}
	pool := NewPool(repo, gateway.MockGateway{}, broadcaster, newTestLogger(), 1)

	pool.process(context.Background(), "batch-1", "payment-1")

	state := repo.snapshot("payment-1")
	if state.status != "pending" {
		t.Fatalf("payment status = %s, want pending", state.status)
	}
	if state.processedAt {
		t.Fatal("expected processedAt to remain false")
	}
	if len(broadcaster.snapshot()) != 0 {
		t.Fatal("expected no events when processing status update fails")
	}
}

func TestPool_ProcessStopsWhenTerminalStatusUpdateFails(t *testing.T) {
	t.Parallel()

	repo := newMockRepository([]string{"payment-1"})
	repo.updateStatusErr["payment-1:success"] = errors.New("boom")
	broadcaster := &mockBroadcaster{}
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false}, broadcaster, newTestLogger(), 1)

	pool.process(context.Background(), "batch-1", "payment-1")

	state := repo.snapshot("payment-1")
	if state.status != "processing" {
		t.Fatalf("payment status = %s, want processing", state.status)
	}
	if state.processedAt {
		t.Fatal("expected processedAt to remain false")
	}

	events := broadcaster.snapshot()
	if len(events) != 1 || events[0].status != "processing" {
		t.Fatalf("unexpected events after terminal update failure: %+v", events)
	}
}

func TestPool_ProcessContinuesWhenProcessedAtUpdateFails(t *testing.T) {
	t.Parallel()

	repo := newMockRepository([]string{"payment-1"})
	repo.setProcessedAtErr["payment-1"] = errors.New("boom")
	broadcaster := &mockBroadcaster{}
	pool := NewPool(repo, gateway.MockGateway{ShouldFail: false}, broadcaster, newTestLogger(), 1)

	pool.process(context.Background(), "batch-1", "payment-1")

	state := repo.snapshot("payment-1")
	if state.status != "success" {
		t.Fatalf("payment status = %s, want success", state.status)
	}
	if state.processedAt {
		t.Fatal("expected processedAt to remain false when SetProcessedAt fails")
	}

	events := broadcaster.snapshot()
	if len(events) != 2 {
		t.Fatalf("event count = %d, want 2", len(events))
	}
	if events[0].status != "processing" || events[1].status != "success" {
		t.Fatalf("unexpected event sequence: %+v", events)
	}
}
