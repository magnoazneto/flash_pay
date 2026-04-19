package batch

import "time"

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
