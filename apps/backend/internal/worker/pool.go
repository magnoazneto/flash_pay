package worker

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"sync"

	"github.com/flashpay/backend/internal/gateway"
)

const defaultWorkerPoolSize = 5

type PaymentRepository interface {
	UpdateStatus(ctx context.Context, paymentID, status string, errorMessage *string) error
	SetProcessedAt(ctx context.Context, paymentID string) error
}

type Broadcaster interface {
	PublishPaymentStatus(batchID, paymentID, status string, errorMessage *string)
	PublishBatchDone(batchID string, totalPayments, completedPayments int)
}

type Pool struct {
	repo       PaymentRepository
	gateway    gateway.GatewayClient
	broadcast  Broadcaster
	logger     *slog.Logger
	numWorkers int
}

func NewPool(repo PaymentRepository, gatewayClient gateway.GatewayClient, broadcast Broadcaster, logger *slog.Logger, numWorkers int) *Pool {
	if logger == nil {
		logger = slog.Default()
	}
	if numWorkers <= 0 {
		numWorkers = WorkerPoolSize()
	}

	return &Pool{
		repo:       repo,
		gateway:    gatewayClient,
		broadcast:  broadcast,
		logger:     logger,
		numWorkers: numWorkers,
	}
}

func WorkerPoolSize() int {
	value := os.Getenv("WORKER_POOL_SIZE")
	if value == "" {
		return defaultWorkerPoolSize
	}

	size, err := strconv.Atoi(value)
	if err != nil || size <= 0 {
		return defaultWorkerPoolSize
	}

	return size
}

func (p *Pool) Dispatch(batchID string, paymentIDs []string) {
	if len(paymentIDs) == 0 {
		p.publishBatchDone(batchID, 0)
		p.logger.Info("worker batch processed", "batch_id", batchID, "total", 0)
		return
	}

	ctx := context.Background()
	jobs := make(chan string, len(paymentIDs))
	wg := &sync.WaitGroup{}

	for range p.numWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()

			for paymentID := range jobs {
				p.process(ctx, batchID, paymentID)
			}
		}()
	}

	for _, paymentID := range paymentIDs {
		jobs <- paymentID
	}
	close(jobs)

	wg.Wait()
	p.publishBatchDone(batchID, len(paymentIDs))

	p.logger.Info("worker batch processed", "batch_id", batchID, "total", len(paymentIDs))
}

func (p *Pool) process(ctx context.Context, batchID, paymentID string) {
	if err := p.repo.UpdateStatus(ctx, paymentID, "processing", nil); err != nil {
		p.logger.Error("failed to update payment status to processing", "payment_id", paymentID, "error", err)
		return
	}
	p.publishPaymentStatus(batchID, paymentID, "processing", nil)

	result := p.gateway.ProcessPayment(ctx, paymentID)

	if result.Success {
		if err := p.repo.UpdateStatus(ctx, paymentID, "success", nil); err != nil {
			p.logger.Error("failed to update payment status to success", "payment_id", paymentID, "error", err)
			return
		}
		p.publishPaymentStatus(batchID, paymentID, "success", nil)
	} else {
		errorMessage := result.ErrorMessage
		if err := p.repo.UpdateStatus(ctx, paymentID, "failed", &errorMessage); err != nil {
			p.logger.Error("failed to update payment status to failed", "payment_id", paymentID, "error", err)
			return
		}
		p.publishPaymentStatus(batchID, paymentID, "failed", &errorMessage)
	}

	if err := p.repo.SetProcessedAt(ctx, paymentID); err != nil {
		p.logger.Error("failed to set payment processed_at", "payment_id", paymentID, "error", err)
	}
}

func (p *Pool) publishPaymentStatus(batchID, paymentID, status string, errorMessage *string) {
	if p.broadcast == nil {
		return
	}

	p.broadcast.PublishPaymentStatus(batchID, paymentID, status, errorMessage)
}

func (p *Pool) publishBatchDone(batchID string, completedPayments int) {
	if p.broadcast == nil {
		return
	}

	p.broadcast.PublishBatchDone(batchID, completedPayments, completedPayments)
}
