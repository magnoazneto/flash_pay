package user

import (
	"context"
	"errors"
	"testing"

	"github.com/flashpay/backend/internal/domain"
)

type stubRepository struct {
	deleteUserFn func(ctx context.Context, userID string) error
}

func (s stubRepository) FindByID(context.Context, string) (domain.User, error) {
	return domain.User{}, domain.ErrUserNotFound
}

func (s stubRepository) FindByEmail(context.Context, string) (domain.User, error) {
	return domain.User{}, domain.ErrUserNotFound
}

func (s stubRepository) Create(context.Context, domain.User) (domain.User, error) {
	return domain.User{}, nil
}

func (s stubRepository) ListUsers(context.Context, int, int) ([]domain.User, int, error) {
	return nil, 0, nil
}

func (s stubRepository) UpdateRole(context.Context, string, string) error {
	return nil
}

func (s stubRepository) DeleteUser(ctx context.Context, userID string) error {
	if s.deleteUserFn == nil {
		return nil
	}

	return s.deleteUserFn(ctx, userID)
}

func TestServiceDeleteUser(t *testing.T) {
	t.Run("returns cannot delete self when requester and target IDs match", func(t *testing.T) {
		repo := stubRepository{
			deleteUserFn: func(context.Context, string) error {
				t.Fatal("DeleteUser repository should not be called")
				return nil
			},
		}
		service := NewService(repo)

		err := service.DeleteUser(context.Background(), "user-1", "user-1")
		if !errors.Is(err, domain.ErrCannotDeleteSelf) {
			t.Fatalf("expected ErrCannotDeleteSelf, got %v", err)
		}
	})

	t.Run("calls repository when requester and target IDs differ", func(t *testing.T) {
		called := false
		repo := stubRepository{
			deleteUserFn: func(_ context.Context, userID string) error {
				called = true
				if userID != "user-2" {
					t.Fatalf("expected target user ID user-2, got %s", userID)
				}
				return nil
			},
		}
		service := NewService(repo)

		err := service.DeleteUser(context.Background(), "user-1", "user-2")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !called {
			t.Fatal("expected repository DeleteUser to be called")
		}
	})

	t.Run("propagates user not found error", func(t *testing.T) {
		repo := stubRepository{
			deleteUserFn: func(context.Context, string) error {
				return domain.ErrUserNotFound
			},
		}
		service := NewService(repo)

		err := service.DeleteUser(context.Background(), "user-1", "user-2")
		if !errors.Is(err, domain.ErrUserNotFound) {
			t.Fatalf("expected ErrUserNotFound, got %v", err)
		}
	})
}
