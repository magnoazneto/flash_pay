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

func (r PostgresRepository) ListUsers(ctx context.Context, limit, offset int) ([]domain.User, int, error) {
	const query = `
		SELECT id, name, email, password_hash, role, created_at, updated_at, COUNT(*) OVER()
		FROM users
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	users := make([]domain.User, 0, limit)
	total := 0

	for rows.Next() {
		var user domain.User
		if err := rows.Scan(
			&user.ID,
			&user.Name,
			&user.Email,
			&user.PasswordHash,
			&user.Role,
			&user.CreatedAt,
			&user.UpdatedAt,
			&total,
		); err != nil {
			return nil, 0, err
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	if len(users) == 0 {
		const countQuery = `SELECT COUNT(*) FROM users`
		if err := r.db.QueryRowContext(ctx, countQuery).Scan(&total); err != nil {
			return nil, 0, err
		}
	}

	return users, total, nil
}

func (r PostgresRepository) UpdateRole(ctx context.Context, userID, role string) error {
	const query = `
		UPDATE users
		SET role = $2, updated_at = NOW()
		WHERE id = $1
	`

	result, err := r.db.ExecContext(ctx, query, userID, role)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}

func (r PostgresRepository) DeleteUser(ctx context.Context, userID string) error {
	const query = `DELETE FROM users WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
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

func toUserResponse(user domain.User) UserResponse {
	return UserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}
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
