package user

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/flashpay/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgconn"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) PostgresRepository {
	return PostgresRepository{db: db}
}

func (r PostgresRepository) FindByID(ctx context.Context, id string) (domain.User, error) {
	const query = `
		SELECT id, name, email, password_hash, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`

	return r.queryUser(ctx, query, id)
}

func (r PostgresRepository) FindByEmail(ctx context.Context, email string) (domain.User, error) {
	const query = `
		SELECT id, name, email, password_hash, role, created_at, updated_at
		FROM users
		WHERE email = $1
	`

	return r.queryUser(ctx, query, email)
}

func (r PostgresRepository) Create(ctx context.Context, user domain.User) (domain.User, error) {
	const query = `
		INSERT INTO users (name, email, password_hash, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, email, password_hash, role, created_at, updated_at
	`

	row := r.db.QueryRowContext(ctx, query, user.Name, user.Email, user.PasswordHash, user.Role)

	createdUser, err := scanUser(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.User{}, domain.ErrEmailAlreadyExists
		}

		return domain.User{}, err
	}

	return createdUser, nil
}

func (r PostgresRepository) queryUser(ctx context.Context, query string, arg string) (domain.User, error) {
	row := r.db.QueryRowContext(ctx, query, arg)

	user, err := scanUser(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}

		return domain.User{}, err
	}

	return user, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanUser(row scanner) (domain.User, error) {
	var user domain.User

	err := row.Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return domain.User{}, err
	}

	return user, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return strings.Contains(strings.ToLower(err.Error()), "duplicate key value violates unique constraint")
	}

	return pgErr.Code == "23505"
}
