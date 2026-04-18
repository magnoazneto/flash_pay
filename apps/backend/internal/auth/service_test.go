package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type stubUserRepository struct {
	findByEmailFn func(ctx context.Context, email string) (domain.User, error)
	createFn      func(ctx context.Context, user domain.User) (domain.User, error)
	listUsersFn   func(ctx context.Context, limit, offset int) ([]domain.User, int, error)
	updateRoleFn  func(ctx context.Context, userID, role string) error
	deleteUserFn  func(ctx context.Context, userID string) error
}

func (s stubUserRepository) FindByID(context.Context, string) (domain.User, error) {
	return domain.User{}, domain.ErrUserNotFound
}

func (s stubUserRepository) FindByEmail(ctx context.Context, email string) (domain.User, error) {
	return s.findByEmailFn(ctx, email)
}

func (s stubUserRepository) Create(ctx context.Context, user domain.User) (domain.User, error) {
	return s.createFn(ctx, user)
}

func (s stubUserRepository) ListUsers(ctx context.Context, limit, offset int) ([]domain.User, int, error) {
	if s.listUsersFn == nil {
		return nil, 0, nil
	}

	return s.listUsersFn(ctx, limit, offset)
}

func (s stubUserRepository) UpdateRole(ctx context.Context, userID, role string) error {
	if s.updateRoleFn == nil {
		return nil
	}

	return s.updateRoleFn(ctx, userID, role)
}

func (s stubUserRepository) DeleteUser(ctx context.Context, userID string) error {
	if s.deleteUserFn == nil {
		return nil
	}

	return s.deleteUserFn(ctx, userID)
}

func TestServiceRegister(t *testing.T) {
	t.Run("creates operator user and returns token", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{}, domain.ErrUserNotFound
			},
			createFn: func(_ context.Context, user domain.User) (domain.User, error) {
				if user.Role != "operator" {
					t.Fatalf("expected operator role, got %s", user.Role)
				}
				if user.PasswordHash == "supersecret" {
					t.Fatal("expected hashed password")
				}
				if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("supersecret")); err != nil {
					t.Fatalf("expected bcrypt hash: %v", err)
				}

				user.ID = "user-1"
				return user, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		response, err := service.Register(context.Background(), RegisterRequest{
			Name:     "Alice Doe",
			Email:    "Alice@example.com",
			Password: "supersecret",
		})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if response.Token == "" {
			t.Fatal("expected token")
		}
		claims := parseTokenClaims(t, response.Token, "12345678901234567890123456789012")
		if claims["user_id"] != "user-1" {
			t.Fatalf("expected user_id claim, got %v", claims["user_id"])
		}
		if claims["email"] != "alice@example.com" {
			t.Fatalf("expected email claim, got %v", claims["email"])
		}
		if claims["role"] != "operator" {
			t.Fatalf("expected role claim, got %v", claims["role"])
		}
		exp, ok := claims["exp"].(float64)
		if !ok {
			t.Fatalf("expected exp claim, got %T", claims["exp"])
		}
		iat, ok := claims["iat"].(float64)
		if !ok {
			t.Fatalf("expected iat claim, got %T", claims["iat"])
		}
		if time.Unix(int64(exp), 0).Sub(time.Unix(int64(iat), 0)) < 23*time.Hour {
			t.Fatalf("expected token expiration close to 24h, got %v", time.Unix(int64(exp), 0).Sub(time.Unix(int64(iat), 0)))
		}
		if response.User.Role != "operator" {
			t.Fatalf("expected operator role, got %s", response.User.Role)
		}
		if response.User.Email != "alice@example.com" {
			t.Fatalf("expected normalized email, got %s", response.User.Email)
		}
	})

	t.Run("returns duplicate email error", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{ID: "user-1"}, nil
			},
			createFn: func(context.Context, domain.User) (domain.User, error) {
				t.Fatal("create should not be called")
				return domain.User{}, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Register(context.Background(), RegisterRequest{
			Name:     "Alice Doe",
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if !errors.Is(err, domain.ErrEmailAlreadyExists) {
			t.Fatalf("expected ErrEmailAlreadyExists, got %v", err)
		}
	})

	t.Run("returns validation error for oversized password", func(t *testing.T) {
		repo := stubUserRepository{}
		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Register(context.Background(), RegisterRequest{
			Name:     "Alice Doe",
			Email:    "alice@example.com",
			Password: string(make([]byte, 73)),
		})
		var validationErrors ValidationErrors
		if !errors.As(err, &validationErrors) {
			t.Fatalf("expected validation error, got %v", err)
		}
		if validationErrors["password"] == "" {
			t.Fatal("expected password validation error")
		}
	})

	t.Run("propagates repository error", func(t *testing.T) {
		expectedErr := errors.New("database unavailable")
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{}, expectedErr
			},
		}
		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Register(context.Background(), RegisterRequest{
			Name:     "Alice Doe",
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if !errors.Is(err, expectedErr) {
			t.Fatalf("expected repository error, got %v", err)
		}
	})
}

func TestServiceLogin(t *testing.T) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("supersecret"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("failed to build password hash: %v", err)
	}

	t.Run("returns token for valid credentials", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{
					ID:           "user-1",
					Name:         "Alice Doe",
					Email:        "alice@example.com",
					PasswordHash: string(passwordHash),
					Role:         "operator",
				}, nil
			},
			createFn: func(context.Context, domain.User) (domain.User, error) {
				t.Fatal("create should not be called")
				return domain.User{}, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		response, err := service.Login(context.Background(), LoginRequest{
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if response.Token == "" {
			t.Fatal("expected token")
		}
	})

	t.Run("uses default expiration when configured with non-positive hours", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{
					ID:           "user-1",
					Name:         "Alice Doe",
					Email:        "alice@example.com",
					PasswordHash: string(passwordHash),
					Role:         "operator",
				}, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 0)

		response, err := service.Login(context.Background(), LoginRequest{
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		claims := parseTokenClaims(t, response.Token, "12345678901234567890123456789012")
		exp := time.Unix(int64(claims["exp"].(float64)), 0)
		iat := time.Unix(int64(claims["iat"].(float64)), 0)
		if exp.Sub(iat) < 23*time.Hour {
			t.Fatalf("expected default expiration close to 24h, got %v", exp.Sub(iat))
		}
	})

	t.Run("returns invalid credentials for unknown email", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{}, domain.ErrUserNotFound
			},
			createFn: func(context.Context, domain.User) (domain.User, error) {
				t.Fatal("create should not be called")
				return domain.User{}, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Login(context.Background(), LoginRequest{
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if !errors.Is(err, domain.ErrInvalidCredentials) {
			t.Fatalf("expected ErrInvalidCredentials, got %v", err)
		}
	})

	t.Run("returns invalid credentials for wrong password", func(t *testing.T) {
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{
					ID:           "user-1",
					Name:         "Alice Doe",
					Email:        "alice@example.com",
					PasswordHash: string(passwordHash),
					Role:         "operator",
				}, nil
			},
			createFn: func(context.Context, domain.User) (domain.User, error) {
				t.Fatal("create should not be called")
				return domain.User{}, nil
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Login(context.Background(), LoginRequest{
			Email:    "alice@example.com",
			Password: "wrong-password",
		})
		if !errors.Is(err, domain.ErrInvalidCredentials) {
			t.Fatalf("expected ErrInvalidCredentials, got %v", err)
		}
	})

	t.Run("propagates repository error", func(t *testing.T) {
		expectedErr := errors.New("database unavailable")
		repo := stubUserRepository{
			findByEmailFn: func(context.Context, string) (domain.User, error) {
				return domain.User{}, expectedErr
			},
		}

		service := NewService(repo, "12345678901234567890123456789012", 24)

		_, err := service.Login(context.Background(), LoginRequest{
			Email:    "alice@example.com",
			Password: "supersecret",
		})
		if !errors.Is(err, expectedErr) {
			t.Fatalf("expected repository error, got %v", err)
		}
	})
}

func parseTokenClaims(t *testing.T, tokenString string, secret string) jwt.MapClaims {
	t.Helper()

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse token: %v", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("expected map claims, got %T", token.Claims)
	}

	return claims
}
