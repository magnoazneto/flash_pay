package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/internal/user"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const maxPasswordBytes = 72

var defaultPasswordHash = mustGeneratePasswordHash()

type Service interface {
	Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error)
	Login(ctx context.Context, req LoginRequest) (*AuthResponse, error)
}

type service struct {
	userRepo           user.Repository
	jwtSecret          string
	jwtExpirationHours int
}

func NewService(userRepo user.Repository, jwtSecret string, jwtExpirationHours int) Service {
	if jwtExpirationHours <= 0 {
		jwtExpirationHours = 24
	}

	return &service{
		userRepo:           userRepo,
		jwtSecret:          jwtSecret,
		jwtExpirationHours: jwtExpirationHours,
	}
}

func (s *service) Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error) {
	if err := validateRegisterRequest(req); err != nil {
		return nil, err
	}

	email := normalizeEmail(req.Email)

	_, err := s.userRepo.FindByEmail(ctx, email)
	switch {
	case err == nil:
		return nil, domain.ErrEmailAlreadyExists
	case !errors.Is(err, domain.ErrUserNotFound):
		return nil, err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	createdUser, err := s.userRepo.Create(ctx, domain.User{
		Name:         strings.TrimSpace(req.Name),
		Email:        email,
		PasswordHash: string(passwordHash),
		Role:         "operator",
	})
	if err != nil {
		return nil, err
	}

	return s.buildAuthResponse(&createdUser)
}

func (s *service) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
	if err := validateLoginRequest(req); err != nil {
		return nil, err
	}

	userRecord, err := s.userRepo.FindByEmail(ctx, normalizeEmail(req.Email))
	if err != nil {
		if errors.Is(err, domain.ErrUserNotFound) {
			_ = bcrypt.CompareHashAndPassword(defaultPasswordHash, []byte(req.Password))
			return nil, domain.ErrInvalidCredentials
		}

		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(userRecord.PasswordHash), []byte(req.Password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}

	return s.buildAuthResponse(&userRecord)
}

func (s *service) buildAuthResponse(user *domain.User) (*AuthResponse, error) {
	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		Token: token,
		User: UserPayload{
			ID:    user.ID,
			Name:  user.Name,
			Email: user.Email,
			Role:  user.Role,
		},
	}, nil
}

func (s *service) generateToken(user *domain.User) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     now.Add(time.Duration(s.jwtExpirationHours) * time.Hour).Unix(),
		"iat":     now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString([]byte(s.jwtSecret))
}

func validateRegisterRequest(req RegisterRequest) error {
	validationErrors := ValidationErrors{}

	if trimmedName := strings.TrimSpace(req.Name); len(trimmedName) < 2 || len(trimmedName) > 100 {
		validationErrors["name"] = "must be between 2 and 100 characters"
	}

	if !isValidEmail(req.Email) {
		validationErrors["email"] = "must be a valid email"
	}

	if len(req.Password) < 8 {
		validationErrors["password"] = "must be at least 8 characters"
	}

	if len([]byte(req.Password)) > maxPasswordBytes {
		validationErrors["password"] = "must be at most 72 bytes"
	}

	if len(validationErrors) > 0 {
		return validationErrors
	}

	return nil
}

func validateLoginRequest(req LoginRequest) error {
	validationErrors := ValidationErrors{}

	if !isValidEmail(req.Email) {
		validationErrors["email"] = "must be a valid email"
	}

	if strings.TrimSpace(req.Password) == "" {
		validationErrors["password"] = "is required"
	}

	if len([]byte(req.Password)) > maxPasswordBytes {
		validationErrors["password"] = "must be at most 72 bytes"
	}

	if len(validationErrors) > 0 {
		return validationErrors
	}

	return nil
}

func isValidEmail(email string) bool {
	_, err := mail.ParseAddress(normalizeEmail(email))
	return err == nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func mustGeneratePasswordHash() []byte {
	hash, err := bcrypt.GenerateFromPassword([]byte("flashpay-default-password"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}

	return hash
}

func IsStrongSecret(secret string) bool {
	if utf8.RuneCountInString(secret) < 32 {
		return false
	}

	var hasLower bool
	var hasUpper bool
	var hasDigit bool
	var hasSymbol bool
	var allSame = true
	var first rune

	for idx, r := range secret {
		if idx == 0 {
			first = r
		} else if r != first {
			allSame = false
		}

		switch {
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsDigit(r):
			hasDigit = true
		default:
			hasSymbol = true
		}
	}

	categories := 0
	for _, present := range []bool{hasLower, hasUpper, hasDigit, hasSymbol} {
		if present {
			categories++
		}
	}

	return !allSame && categories >= 3
}
