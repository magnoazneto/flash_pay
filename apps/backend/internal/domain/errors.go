package domain

import "errors"

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrValidation         = errors.New("validation error")
	ErrCannotDeleteSelf   = errors.New("cannot delete your own account")
	ErrNotFound           = errors.New("not found")
	ErrForbidden          = errors.New("forbidden")
)
