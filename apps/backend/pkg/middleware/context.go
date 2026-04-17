package middleware

import "context"

type contextKey string

const (
	ContextKeyUserID contextKey = "user_id"
	ContextKeyEmail  contextKey = "email"
	ContextKeyRole   contextKey = "role"
)

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value(ContextKeyUserID).(string)
	return v
}

func GetUserRole(ctx context.Context) string {
	v, _ := ctx.Value(ContextKeyRole).(string)
	return v
}
