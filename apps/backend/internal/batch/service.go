package batch

import (
	"context"
	"io"

	"github.com/flashpay/backend/internal/payment"
	"github.com/flashpay/backend/internal/worker"
	"github.com/google/uuid"
)

type Service interface {
	ProcessUpload(ctx context.Context, userID, fileName string, file io.Reader) (*UploadResponse, error)
}

type service struct {
	batchRepo   BatchRepository
	paymentRepo payment.Repository
	workerPool  *worker.Pool
}

func NewService(batchRepo BatchRepository, paymentRepo payment.Repository, workerPool *worker.Pool) Service {
	return &service{
		batchRepo:   batchRepo,
		paymentRepo: paymentRepo,
		workerPool:  workerPool,
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
