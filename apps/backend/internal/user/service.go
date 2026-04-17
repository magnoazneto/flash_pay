package user

import (
	"context"

	"github.com/flashpay/backend/internal/domain"
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) Service {
	return Service{repository: repository}
}

func (s Service) FindByID(ctx context.Context, id string) (domain.User, error) {
	return s.repository.FindByID(ctx, id)
}
