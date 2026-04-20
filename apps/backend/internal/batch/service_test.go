package batch

import (
	"context"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/internal/payment"
)

type stubBatchRepository struct {
	record BatchRecord
	err    error
}

func (s stubBatchRepository) CreateBatch(context.Context, string, string, int) (string, time.Time, error) {
	return "", time.Time{}, nil
}

func (s stubBatchRepository) FindByUserID(context.Context, string, int, int) ([]BatchRecord, int, error) {
	return nil, 0, nil
}

func (s stubBatchRepository) FindByID(context.Context, string) (BatchRecord, error) {
	if s.err != nil {
		return BatchRecord{}, s.err
	}

	return s.record, nil
}

func (s stubBatchRepository) FindAll(context.Context, string, int, int) ([]BatchRecord, int, error) {
	return nil, 0, nil
}

type stubPaymentRepository struct {
	count payment.StatusCount
}

func (s stubPaymentRepository) UpdateStatus(context.Context, string, string, *string) error {
	return nil
}

func (s stubPaymentRepository) SetProcessedAt(context.Context, string) error {
	return nil
}

func (s stubPaymentRepository) FindByBatchID(context.Context, string) ([]payment.Payment, error) {
	return nil, nil
}

func (s stubPaymentRepository) CountByStatus(context.Context, string) (payment.StatusCount, error) {
	return s.count, nil
}

func (s stubPaymentRepository) CreatePayments(context.Context, []payment.Payment) error {
	return nil
}

func TestServiceStreamRejectsForbiddenBatchAccess(t *testing.T) {
	t.Parallel()

	service := NewService(
		stubBatchRepository{record: BatchRecord{ID: "batch-1", UserID: "owner-1", TotalPayments: 2}},
		stubPaymentRepository{},
		nil,
		NewStreamBroker(),
	)

	_, err := service.Stream(context.Background(), "batch-1", "operator-2", "operator")
	if err != domain.ErrForbidden {
		t.Fatalf("stream error = %v, want %v", err, domain.ErrForbidden)
	}
}

func TestServiceStreamReturnsBatchDoneForCompletedBatch(t *testing.T) {
	t.Parallel()

	service := NewService(
		stubBatchRepository{record: BatchRecord{ID: "batch-1", UserID: "owner-1", TotalPayments: 2}},
		stubPaymentRepository{count: payment.StatusCount{Success: 1, Failed: 1}},
		nil,
		NewStreamBroker(),
	)

	subscription, err := service.Stream(context.Background(), "batch-1", "owner-1", "operator")
	if err != nil {
		t.Fatalf("stream returned error: %v", err)
	}
	defer subscription.Close()

	event, ok := <-subscription.Events()
	if !ok {
		t.Fatal("subscription closed before batch_done event")
	}

	if event.Type != EventTypeBatchDone {
		t.Fatalf("event type = %s, want %s", event.Type, EventTypeBatchDone)
	}
	if event.BatchID != "batch-1" {
		t.Fatalf("event batch_id = %s, want batch-1", event.BatchID)
	}
	if event.TotalPayments != 2 || event.CompletedPayments != 2 {
		t.Fatalf("batch_done totals = (%d, %d), want (2, 2)", event.TotalPayments, event.CompletedPayments)
	}

	if _, ok := <-subscription.Events(); ok {
		t.Fatal("subscription remained open after synthetic batch_done")
	}
}
