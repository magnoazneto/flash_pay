package user

import (
	"context"
	"database/sql"

	"github.com/flashpay/backend/internal/domain"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) PostgresRepository {
	return PostgresRepository{db: db}
}

func (r PostgresRepository) FindByID(_ context.Context, _ string) (domain.User, error) {
	return domain.User{}, domain.ErrUserNotFound
}
