package user

import (
	"context"

	"github.com/flashpay/backend/internal/domain"
)

type Repository interface {
	FindByID(ctx context.Context, id string) (domain.User, error)
	FindByEmail(ctx context.Context, email string) (domain.User, error)
	Create(ctx context.Context, user domain.User) (domain.User, error)
	ListUsers(ctx context.Context, limit, offset int) ([]domain.User, int, error)
	UpdateRole(ctx context.Context, userID, role string) error
	DeleteUser(ctx context.Context, userID string) error
}
