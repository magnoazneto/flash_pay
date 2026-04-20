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

func (s Service) ListUsers(ctx context.Context, limit, offset int) (*ListUsersResponse, error) {
	users, total, err := s.repository.ListUsers(ctx, limit, offset)
	if err != nil {
		return nil, err
	}

	responseUsers := make([]UserResponse, 0, len(users))
	for _, user := range users {
		responseUsers = append(responseUsers, toUserResponse(user))
	}

	return &ListUsersResponse{
		Users:  responseUsers,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

func (s Service) UpdateRole(ctx context.Context, requesterID, userID, role string) error {
	if requesterID == userID {
		return domain.ErrCannotModifyOwnRole
	}

	return s.repository.UpdateRole(ctx, userID, role)
}

func (s Service) DeleteUser(ctx context.Context, requesterID, targetID string) error {
	if requesterID == targetID {
		return domain.ErrCannotDeleteSelf
	}

	return s.repository.DeleteUser(ctx, targetID)
}
