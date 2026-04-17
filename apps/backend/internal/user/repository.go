package user

import (
	"context"

	"github.com/flashpay/backend/internal/domain"
)

type Repository interface {
	FindByID(ctx context.Context, id string) (domain.User, error)
}
