package batch

import (
	"context"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/internal/payment"
)

type stubBatchRepository struct {
	record    BatchRecord
	err       error
	findAllFn func(ctx context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error)
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

func (s stubBatchRepository) FindAll(ctx context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error) {
	if s.findAllFn == nil {
		return nil, 0, nil
	}

	return s.findAllFn(ctx, filterUserID, filterStatus, limit, offset)
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
		stubBatchRepository{record: BatchRecord{ID: "batch-1", UserID: "owner-1", TotalPayments: 2, Status: "pending"}},
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
		stubBatchRepository{record: BatchRecord{ID: "batch-1", UserID: "owner-1", TotalPayments: 2, Status: "pending"}},
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

func TestServiceListAllIncludesAdminBatchFields(t *testing.T) {
	t.Parallel()

	repo := stubBatchRepository{
		findAllFn: func(_ context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error) {
			if filterUserID != "user-1" {
				t.Fatalf("filterUserID = %q, want user-1", filterUserID)
			}
			if filterStatus != "failed" {
				t.Fatalf("filterStatus = %q, want failed", filterStatus)
			}
			if limit != 50 || offset != 10 {
				t.Fatalf("pagination = (%d, %d), want (50, 10)", limit, offset)
			}

			return []BatchRecord{{
				ID:            "batch-1",
				UserID:        "user-1",
				FileName:      "payments.csv",
				TotalPayments: 3,
				Status:        "failed",
				CreatedAt:     time.Date(2026, time.April, 20, 10, 0, 0, 0, time.UTC),
			}}, 1, nil
		},
	}
	service := NewService(repo, stubPaymentRepository{count: payment.StatusCount{Failed: 2, Success: 1}}, nil, NewStreamBroker())

	response, err := service.ListAll(context.Background(), "user-1", "failed", 50, 10)
	if err != nil {
		t.Fatalf("ListAll returned error: %v", err)
	}

	if response.Total != 1 || response.Limit != 50 || response.Offset != 10 {
		t.Fatalf("response pagination = (%d, %d, %d), want (1, 50, 10)", response.Total, response.Limit, response.Offset)
	}
	if len(response.Batches) != 1 {
		t.Fatalf("expected 1 batch, got %d", len(response.Batches))
	}

	batch := response.Batches[0]
	if batch.ID != "batch-1" || batch.UserID != "user-1" || batch.Status != "failed" {
		t.Fatalf("unexpected batch summary: %+v", batch)
	}
	if batch.StatusCount.Failed != 2 || batch.StatusCount.Success != 1 {
		t.Fatalf("unexpected status counts: %+v", batch.StatusCount)
	}
}

func TestServiceGetByIDIncludesBatchStatusAndOwner(t *testing.T) {
	t.Parallel()

	service := NewService(
		stubBatchRepository{record: BatchRecord{ID: "batch-1", UserID: "owner-1", FileName: "payments.csv", TotalPayments: 2, Status: "processing"}},
		stubPaymentRepository{count: payment.StatusCount{Processing: 2}},
		nil,
		NewStreamBroker(),
	)

	response, err := service.GetByID(context.Background(), "batch-1", "owner-1", "operator")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if response.UserID != "owner-1" || response.Status != "processing" {
		t.Fatalf("unexpected detail response: %+v", response)
	}
}
