package payment

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

type Payment struct {
	ID             string
	BatchID        string
	Recipient      string
	Amount         decimal.Decimal
	Description    *string
	PaymentMethod  string
	LastFourDigits *string
	Status         string
	ErrorMessage   *string
	ProcessedAt    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type StatusCount struct {
	Pending    int
	Processing int
	Success    int
	Failed     int
}

type Repository interface {
	UpdateStatus(ctx context.Context, paymentID, status string, errorMessage *string) error
	SetProcessedAt(ctx context.Context, paymentID string) error
	FindByBatchID(ctx context.Context, batchID string) ([]Payment, error)
	CountByStatus(ctx context.Context, batchID string) (StatusCount, error)
	CreatePayments(ctx context.Context, payments []Payment) error
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) UpdateStatus(ctx context.Context, paymentID, status string, errorMessage *string) error {
	const updatePaymentQuery = `
		UPDATE payments
		SET status = $2::payment_status,
		    error_message = NULLIF($3, ''),
		    updated_at = NOW()
		WHERE id = $1
	`

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, updatePaymentQuery, paymentID, status, errorMessage); err != nil {
		return err
	}

	const updateBatchStatusQuery = `
		UPDATE batches
		SET status = CASE
			WHEN counts.processing > 0 THEN 'processing'::payment_status
			WHEN counts.pending > 0 THEN 'pending'::payment_status
			WHEN counts.failed > 0 THEN 'failed'::payment_status
			ELSE 'success'::payment_status
		END,
		    updated_at = NOW()
		FROM (
			SELECT p.batch_id,
			       COUNT(*) FILTER (WHERE p.status = 'pending') AS pending,
			       COUNT(*) FILTER (WHERE p.status = 'processing') AS processing,
			       COUNT(*) FILTER (WHERE p.status = 'failed') AS failed
			FROM payments p
			WHERE p.batch_id = (
				SELECT batch_id
				FROM payments
				WHERE id = $1
			)
			GROUP BY p.batch_id
		) AS counts
		WHERE batches.id = counts.batch_id
	`

	if _, err := tx.Exec(ctx, updateBatchStatusQuery, paymentID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) SetProcessedAt(ctx context.Context, paymentID string) error {
	const query = `
		UPDATE payments
		SET processed_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, paymentID)
	return err
}

func (r *PostgresRepository) FindByBatchID(ctx context.Context, batchID string) ([]Payment, error) {
	const query = `
		SELECT id,
		       batch_id,
		       recipient,
		       amount::text,
		       description,
		       payment_method,
		       last_four_digits,
		       status::text,
		       error_message,
		       processed_at,
		       created_at,
		       updated_at
		FROM payments
		WHERE batch_id = $1
		ORDER BY created_at ASC, id ASC
	`

	rows, err := r.pool.Query(ctx, query, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	payments := make([]Payment, 0)
	for rows.Next() {
		payment, scanErr := scanPayment(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		payments = append(payments, payment)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return payments, nil
}

func (r *PostgresRepository) CountByStatus(ctx context.Context, batchID string) (StatusCount, error) {
	const query = `
		SELECT status::text, COUNT(*)
		FROM payments
		WHERE batch_id = $1
		GROUP BY status
	`

	rows, err := r.pool.Query(ctx, query, batchID)
	if err != nil {
		return StatusCount{}, err
	}
	defer rows.Close()

	var counts StatusCount

	for rows.Next() {
		var status string
		var total int

		if err := rows.Scan(&status, &total); err != nil {
			return StatusCount{}, err
		}

		switch status {
		case "pending":
			counts.Pending = total
		case "processing":
			counts.Processing = total
		case "success":
			counts.Success = total
		case "failed":
			counts.Failed = total
		}
	}

	if err := rows.Err(); err != nil {
		return StatusCount{}, err
	}

	return counts, nil
}

func (r *PostgresRepository) CreatePayments(ctx context.Context, payments []Payment) error {
	if len(payments) == 0 {
		return nil
	}

	const query = `
		INSERT INTO payments (
			id,
			batch_id,
			recipient,
			amount,
			description,
			payment_method,
			last_four_digits,
			status,
			error_message,
			processed_at
		) VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8::payment_status,
			$9,
			$10
		)
	`

	batch := &pgx.Batch{}
	for _, payment := range payments {
		status := payment.Status
		if status == "" {
			status = "pending"
		}

		batch.Queue(
			query,
			payment.ID,
			payment.BatchID,
			payment.Recipient,
			payment.Amount.String(),
			payment.Description,
			payment.PaymentMethod,
			payment.LastFourDigits,
			status,
			payment.ErrorMessage,
			payment.ProcessedAt,
		)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range payments {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}

	return br.Close()
}

func scanPayment(row pgx.Row) (Payment, error) {
	var payment Payment
	var amountText string

	err := row.Scan(
		&payment.ID,
		&payment.BatchID,
		&payment.Recipient,
		&amountText,
		&payment.Description,
		&payment.PaymentMethod,
		&payment.LastFourDigits,
		&payment.Status,
		&payment.ErrorMessage,
		&payment.ProcessedAt,
		&payment.CreatedAt,
		&payment.UpdatedAt,
	)
	if err != nil {
		return Payment{}, err
	}

	payment.Amount, err = decimal.NewFromString(amountText)
	if err != nil {
		return Payment{}, err
	}

	return payment, nil
}
