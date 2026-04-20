package batch

import (
	"time"

	"github.com/shopspring/decimal"
)

type UploadResponse struct {
	BatchID       string    `json:"batch_id"`
	TotalPayments int       `json:"total_payments"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

type ValidationDetail struct {
	Line    int    `json:"line"`
	Column  string `json:"column"`
	Message string `json:"message"`
}

type ParseValidationError struct {
	Details []ValidationDetail
}

func (e *ParseValidationError) Error() string {
	return "csv validation failed"
}

type PaymentResponse struct {
	ID           string          `json:"id"`
	Recipient    string          `json:"recipient"`
	Amount       decimal.Decimal `json:"amount"`
	Status       string          `json:"status"`
	ErrorMessage *string         `json:"error_message,omitempty"`
	ProcessedAt  *time.Time      `json:"processed_at,omitempty"`
}

type StatusCountResponse struct {
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	Success    int `json:"success"`
	Failed     int `json:"failed"`
}

type BatchSummaryResponse struct {
	ID            string              `json:"id"`
	UserID        string              `json:"user_id"`
	FileName      string              `json:"file_name"`
	TotalPayments int                 `json:"total_payments"`
	Status        string              `json:"status"`
	StatusCount   StatusCountResponse `json:"status_count"`
	CreatedAt     time.Time           `json:"created_at"`
}

type BatchDetailResponse struct {
	ID            string              `json:"id"`
	Status        string              `json:"status"`
	FileName      string              `json:"file_name"`
	TotalPayments int                 `json:"total_payments"`
	UserID        string              `json:"user_id"`
	StatusCount   StatusCountResponse `json:"status_count"`
	Payments      []PaymentResponse   `json:"payments"`
	CreatedAt     time.Time           `json:"created_at"`
}

type BatchListResponse struct {
	Batches []BatchSummaryResponse `json:"batches"`
	Total   int                    `json:"total"`
	Limit   int                    `json:"limit"`
	Offset  int                    `json:"offset"`
}
