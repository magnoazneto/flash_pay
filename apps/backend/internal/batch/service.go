package batch

import (
	"context"
	"io"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/internal/payment"
	"github.com/flashpay/backend/internal/worker"
	"github.com/google/uuid"
)

type Service interface {
	ProcessUpload(ctx context.Context, userID, fileName string, file io.Reader) (*UploadResponse, error)
	List(ctx context.Context, userID string, limit, offset int) (*BatchListResponse, error)
	GetByID(ctx context.Context, batchID, requesterID, requesterRole string) (*BatchDetailResponse, error)
	ListAll(ctx context.Context, filterUserID, filterStatus string, limit, offset int) (*BatchListResponse, error)
	Stream(ctx context.Context, batchID, requesterID, requesterRole string) (*Subscription, error)
}

type service struct {
	batchRepo   BatchRepository
	paymentRepo payment.Repository
	workerPool  *worker.Pool
	streams     StreamSource
}

func NewService(batchRepo BatchRepository, paymentRepo payment.Repository, workerPool *worker.Pool, streams StreamSource) Service {
	if streams == nil {
		streams = NewStreamBroker()
	}

	return &service{
		batchRepo:   batchRepo,
		paymentRepo: paymentRepo,
		workerPool:  workerPool,
		streams:     streams,
	}
}

func (s *service) ProcessUpload(ctx context.Context, userID, fileName string, file io.Reader) (*UploadResponse, error) {
	rows, parseErrors := payment.ParseCSV(file)
	if len(parseErrors) > 0 {
		return nil, &ParseValidationError{Details: mapParseErrors(parseErrors)}
	}

	if len(rows) == 0 {
		return nil, &ParseValidationError{
			Details: []ValidationDetail{{
				Message: "CSV não contém pagamentos",
			}},
		}
	}

	batchID, createdAt, err := s.batchRepo.CreateBatch(ctx, userID, fileName, len(rows))
	if err != nil {
		return nil, err
	}

	payments := make([]payment.Payment, 0, len(rows))
	paymentIDs := make([]string, 0, len(rows))

	for _, row := range rows {
		description := row.Description
		lastFourDigits := row.LastFourDigits

		p := payment.Payment{
			ID:             uuid.New().String(),
			BatchID:        batchID,
			Recipient:      row.Recipient,
			Amount:         row.Amount,
			Description:    &description,
			PaymentMethod:  row.PaymentMethod,
			LastFourDigits: &lastFourDigits,
			Status:         "pending",
		}

		payments = append(payments, p)
		paymentIDs = append(paymentIDs, p.ID)
	}

	if err := s.paymentRepo.CreatePayments(ctx, payments); err != nil {
		return nil, err
	}

	go s.workerPool.Dispatch(batchID, paymentIDs)

	return &UploadResponse{
		BatchID:       batchID,
		TotalPayments: len(rows),
		Status:        "pending",
		CreatedAt:     createdAt,
	}, nil
}

func (s *service) List(ctx context.Context, userID string, limit, offset int) (*BatchListResponse, error) {
	limit, offset = normalizePagination(limit, offset)

	batches, total, err := s.batchRepo.FindByUserID(ctx, userID, limit, offset)
	if err != nil {
		return nil, err
	}

	items, err := s.buildBatchSummaries(ctx, batches)
	if err != nil {
		return nil, err
	}

	return &BatchListResponse{
		Batches: items,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
	}, nil
}

func (s *service) GetByID(ctx context.Context, batchID, requesterID, requesterRole string) (*BatchDetailResponse, error) {
	batch, err := s.authorizeBatchAccess(ctx, batchID, requesterID, requesterRole)
	if err != nil {
		return nil, err
	}

	statusCount, err := s.paymentRepo.CountByStatus(ctx, batch.ID)
	if err != nil {
		return nil, err
	}

	payments, err := s.paymentRepo.FindByBatchID(ctx, batch.ID)
	if err != nil {
		return nil, err
	}

	return &BatchDetailResponse{
		ID:            batch.ID,
		Status:        batch.Status,
		FileName:      batch.FileName,
		TotalPayments: batch.TotalPayments,
		UserID:        batch.UserID,
		StatusCount:   mapStatusCount(statusCount),
		Payments:      mapPayments(payments),
		CreatedAt:     batch.CreatedAt,
	}, nil
}

func (s *service) ListAll(ctx context.Context, filterUserID, filterStatus string, limit, offset int) (*BatchListResponse, error) {
	limit, offset = normalizePagination(limit, offset)

	batches, total, err := s.batchRepo.FindAll(ctx, filterUserID, filterStatus, limit, offset)
	if err != nil {
		return nil, err
	}

	items, err := s.buildBatchSummaries(ctx, batches)
	if err != nil {
		return nil, err
	}

	return &BatchListResponse{
		Batches: items,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
	}, nil
}

func (s *service) Stream(ctx context.Context, batchID, requesterID, requesterRole string) (*Subscription, error) {
	batch, err := s.authorizeBatchAccess(ctx, batchID, requesterID, requesterRole)
	if err != nil {
		return nil, err
	}

	subscription := s.streams.Subscribe(batch.ID)

	statusCount, err := s.paymentRepo.CountByStatus(ctx, batch.ID)
	if err != nil {
		subscription.Close()
		return nil, err
	}

	done, completedPayments := batchProcessingComplete(statusCount, batch.TotalPayments)
	if done {
		subscription.Close()
		return NewSingleEventSubscription(NewBatchDoneEvent(batch.ID, batch.TotalPayments, completedPayments)), nil
	}

	return subscription, nil
}

func (s *service) buildBatchSummaries(ctx context.Context, batches []BatchRecord) ([]BatchSummaryResponse, error) {
	items := make([]BatchSummaryResponse, 0, len(batches))

	for _, batch := range batches {
		statusCount, err := s.paymentRepo.CountByStatus(ctx, batch.ID)
		if err != nil {
			return nil, err
		}

		items = append(items, BatchSummaryResponse{
			ID:            batch.ID,
			UserID:        batch.UserID,
			FileName:      batch.FileName,
			TotalPayments: batch.TotalPayments,
			Status:        batch.Status,
			StatusCount:   mapStatusCount(statusCount),
			CreatedAt:     batch.CreatedAt,
		})
	}

	return items, nil
}

func mapPayments(payments []payment.Payment) []PaymentResponse {
	items := make([]PaymentResponse, 0, len(payments))
	for _, p := range payments {
		items = append(items, PaymentResponse{
			ID:           p.ID,
			Recipient:    p.Recipient,
			Amount:       p.Amount,
			Status:       p.Status,
			ErrorMessage: p.ErrorMessage,
			ProcessedAt:  p.ProcessedAt,
		})
	}
	return items
}

func mapStatusCount(count payment.StatusCount) StatusCountResponse {
	return StatusCountResponse{
		Pending:    count.Pending,
		Processing: count.Processing,
		Success:    count.Success,
		Failed:     count.Failed,
	}
}

func normalizePagination(limit, offset int) (int, int) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func (s *service) authorizeBatchAccess(ctx context.Context, batchID, requesterID, requesterRole string) (BatchRecord, error) {
	batch, err := s.batchRepo.FindByID(ctx, batchID)
	if err != nil {
		return BatchRecord{}, err
	}

	if batch.UserID != requesterID && requesterRole != "admin" {
		return BatchRecord{}, domain.ErrForbidden
	}

	return batch, nil
}

func batchProcessingComplete(statusCount payment.StatusCount, totalPayments int) (bool, int) {
	completedPayments := statusCount.Success + statusCount.Failed
	if totalPayments <= 0 {
		return true, completedPayments
	}

	return completedPayments >= totalPayments, completedPayments
}

func mapParseErrors(parseErrors []payment.ParseError) []ValidationDetail {
	details := make([]ValidationDetail, 0, len(parseErrors))
	for _, parseErr := range parseErrors {
		details = append(details, ValidationDetail{
			Line:    parseErr.Line,
			Column:  parseErr.Column,
			Message: parseErr.Message,
		})
	}

	return details
}
