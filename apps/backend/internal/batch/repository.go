package batch

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type BatchRepository interface {
	CreateBatch(ctx context.Context, userID, fileName string, totalPayments int) (string, time.Time, error)
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
