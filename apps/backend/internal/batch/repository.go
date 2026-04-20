package batch

import (
	"context"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BatchRepository interface {
	CreateBatch(ctx context.Context, userID, fileName string, totalPayments int) (string, time.Time, error)
	FindByUserID(ctx context.Context, userID string, limit, offset int) ([]BatchRecord, int, error)
	FindByID(ctx context.Context, id string) (BatchRecord, error)
	FindAll(ctx context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error)
}

type BatchRecord struct {
	ID            string
	UserID        string
	FileName      string
	TotalPayments int
	Status        string
	CreatedAt     time.Time
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) CreateBatch(ctx context.Context, userID, fileName string, totalPayments int) (string, time.Time, error) {
	const query = `
		INSERT INTO batches (user_id, file_name, total_payments)
		VALUES ($1, $2, $3)
		RETURNING id::text, created_at
	`

	var id string
	var createdAt time.Time

	err := r.pool.QueryRow(ctx, query, userID, fileName, totalPayments).Scan(&id, &createdAt)
	if err != nil {
		return "", time.Time{}, err
	}

	return id, createdAt, nil
}

func (r *PostgresRepository) FindByUserID(ctx context.Context, userID string, limit, offset int) ([]BatchRecord, int, error) {
	const query = `
		SELECT id::text,
		       user_id::text,
		       file_name,
		       total_payments,
		       status::text,
		       created_at,
		       COUNT(*) OVER()
		FROM batches
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	return scanBatchRows(rows)
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (BatchRecord, error) {
	const query = `
		SELECT id::text,
		       user_id::text,
		       file_name,
		       total_payments,
		       status::text,
		       created_at
		FROM batches
		WHERE id = $1
	`

	var batch BatchRecord
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&batch.ID,
		&batch.UserID,
		&batch.FileName,
		&batch.TotalPayments,
		&batch.Status,
		&batch.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return BatchRecord{}, domain.ErrNotFound
		}
		return BatchRecord{}, err
	}

	return batch, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error) {
	const query = `
		SELECT id::text,
		       user_id::text,
		       file_name,
		       total_payments,
		       status::text,
		       created_at,
		       COUNT(*) OVER()
		FROM batches
		WHERE ($1 = '' OR user_id = $1::uuid)
		  AND ($2 = '' OR status = $2::payment_status)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.pool.Query(ctx, query, filterUserID, filterStatus, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	return scanBatchRows(rows)
}

func scanBatchRows(rows pgx.Rows) ([]BatchRecord, int, error) {
	batches := make([]BatchRecord, 0)
	total := 0

	for rows.Next() {
		var batch BatchRecord
		var rowTotal int

		if err := rows.Scan(
			&batch.ID,
			&batch.UserID,
			&batch.FileName,
			&batch.TotalPayments,
			&batch.Status,
			&batch.CreatedAt,
			&rowTotal,
		); err != nil {
			return nil, 0, err
		}

		total = rowTotal
		batches = append(batches, batch)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return batches, total, nil
}
