package gateway

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestSimulatedGatewayAlwaysFailsWhenFailureRateIsOne(t *testing.T) {
	gateway := New(Config{
		FailureRate: 1.0,
		MinDelay:    0,
		MaxDelay:    0,
	})

	for i := 0; i < 20; i++ {
		result := gateway.ProcessPayment(context.Background(), "payment-1")
		if result.Success {
			t.Fatalf("expected failure on iteration %d", i)
		}
		if result.ErrorMessage == "" {
			t.Fatalf("expected error message on iteration %d", i)
		}
	}
}

func TestSimulatedGatewayAlwaysSucceedsWhenFailureRateIsZero(t *testing.T) {
	gateway := New(Config{
		FailureRate: 0.0,
		MinDelay:    0,
		MaxDelay:    0,
	})

	for i := 0; i < 20; i++ {
		result := gateway.ProcessPayment(context.Background(), "payment-1")
		if !result.Success {
			t.Fatalf("expected success on iteration %d, got %q", i, result.ErrorMessage)
		}
		if result.ErrorMessage != "" {
			t.Fatalf("expected empty error message on success, got %q", result.ErrorMessage)
		}
	}
}

func TestSimulatedGatewayReturnsCancellationWhenContextIsCanceledBeforeDelay(t *testing.T) {
	gateway := New(Config{
		FailureRate: 0.0,
		MinDelay:    100 * time.Millisecond,
		MaxDelay:    100 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result := gateway.ProcessPayment(ctx, "payment-1")
	if result.Success {
		t.Fatal("expected canceled payment to fail")
	}
	if !strings.Contains(result.ErrorMessage, context.Canceled.Error()) {
		t.Fatalf("expected cancellation error message, got %q", result.ErrorMessage)
	}
}

func TestSimulatedGatewayErrorMessageIsFilledWhenFailureOccurs(t *testing.T) {
	gateway := New(Config{
		FailureRate: 1.0,
		MinDelay:    0,
		MaxDelay:    0,
	})

	result := gateway.ProcessPayment(context.Background(), "payment-1")
	if result.Success {
		t.Fatal("expected failure")
	}
	if result.ErrorMessage == "" {
		t.Fatal("expected error message for failure result")
	}
}

func TestMockGatewayReturnsFailureWhenConfiguredToFail(t *testing.T) {
	gateway := MockGateway{
		ShouldFail:   true,
		ErrorMessage: "gateway unavailable",
	}

	result := gateway.ProcessPayment(context.Background(), "payment-1")
	if result.Success {
		t.Fatal("expected mock gateway failure")
	}
	if result.ErrorMessage != "gateway unavailable" {
		t.Fatalf("expected custom error message, got %q", result.ErrorMessage)
	}
}

func TestSimulatedGatewayCancelsDuringDelay(t *testing.T) {
	gateway := New(Config{
		FailureRate: 0.0,
		MinDelay:    200 * time.Millisecond,
		MaxDelay:    200 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	result := gateway.ProcessPayment(ctx, "payment-1")
	if result.Success {
		t.Fatal("expected failure on context cancellation during delay")
	}
	if result.ErrorMessage == "" {
		t.Fatal("expected error message on context cancellation")
	}
}

func TestSimulatedGatewayConcurrentAccess(t *testing.T) {
	gateway := New(Config{
		FailureRate: 0.5,
		MinDelay:    0,
		MaxDelay:    1 * time.Millisecond,
	})

	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			result := gateway.ProcessPayment(context.Background(), "payment")
			if !result.Success && result.ErrorMessage == "" {
				t.Errorf("expected error message on failure for goroutine %d", index)
			}
		}(i)
	}

	wg.Wait()
}
