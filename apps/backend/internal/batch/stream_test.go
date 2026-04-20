package batch

import "testing"

func TestStreamBrokerBroadcastsToMultipleSubscribersAndClosesBatch(t *testing.T) {
	t.Parallel()

	broker := NewStreamBroker()
	subscriptionA := broker.Subscribe("batch-1")
	subscriptionB := broker.Subscribe("batch-1")
	defer subscriptionA.Close()
	defer subscriptionB.Close()

	errorMessage := "gateway error"

	broker.PublishPaymentStatus("batch-1", "payment-1", "processing", nil)
	assertStreamEvent(t, <-subscriptionA.Events(), EventTypePaymentUpdated, "batch-1", "payment-1", "processing", nil)
	assertStreamEvent(t, <-subscriptionB.Events(), EventTypePaymentUpdated, "batch-1", "payment-1", "processing", nil)

	broker.PublishPaymentStatus("batch-1", "payment-1", "failed", &errorMessage)
	assertStreamEvent(t, <-subscriptionA.Events(), EventTypePaymentUpdated, "batch-1", "payment-1", "failed", &errorMessage)
	assertStreamEvent(t, <-subscriptionB.Events(), EventTypePaymentUpdated, "batch-1", "payment-1", "failed", &errorMessage)

	broker.PublishBatchDone("batch-1", 2, 2)
	assertStreamEvent(t, <-subscriptionA.Events(), EventTypeBatchDone, "batch-1", "", "", nil)
	assertStreamEvent(t, <-subscriptionB.Events(), EventTypeBatchDone, "batch-1", "", "", nil)

	if _, ok := <-subscriptionA.Events(); ok {
		t.Fatal("subscription A remained open after batch_done")
	}
	if _, ok := <-subscriptionB.Events(); ok {
		t.Fatal("subscription B remained open after batch_done")
	}
}

func assertStreamEvent(t *testing.T, event StreamEvent, wantType, wantBatchID, wantPaymentID, wantStatus string, wantError *string) {
	t.Helper()

	if event.Type != wantType {
		t.Fatalf("event type = %s, want %s", event.Type, wantType)
	}
	if event.BatchID != wantBatchID {
		t.Fatalf("event batch_id = %s, want %s", event.BatchID, wantBatchID)
	}
	if event.PaymentID != wantPaymentID {
		t.Fatalf("event payment_id = %s, want %s", event.PaymentID, wantPaymentID)
	}
	if event.Status != wantStatus {
		t.Fatalf("event status = %s, want %s", event.Status, wantStatus)
	}

	switch {
	case wantError == nil && event.ErrorMessage != nil:
		t.Fatalf("event error_message = %q, want nil", *event.ErrorMessage)
	case wantError != nil && event.ErrorMessage == nil:
		t.Fatalf("event error_message = nil, want %q", *wantError)
	case wantError != nil && event.ErrorMessage != nil && *event.ErrorMessage != *wantError:
		t.Fatalf("event error_message = %q, want %q", *event.ErrorMessage, *wantError)
	}
}
