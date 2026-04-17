# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FlashPay is a monorepo for a payment platform. Stack: React + Vite + TypeScript (frontend), Go + Chi (backend), PostgreSQL, Docker Compose.

- Frontend: `apps/frontend/` → port 5173
- Backend: `apps/backend/` → port 8080
- Postgres: port 5432

## Commands

### Start / Stop

```bash
docker compose up --build     # Start all services (first time)
docker compose up             # Start all services
docker compose down           # Stop all services
make logs                     # Follow all logs
```

### Migrations

```bash
make migrate-up               # Apply all pending migrations
make migrate-down             # Rollback last migration
make migrate-status           # Check current version
make migrate-create name=<name>  # Generate new migration pair (up/down)
```

Migrations live in `apps/backend/migrations/` as numbered SQL files.

### Frontend (outside Docker)

```bash
cd apps/frontend
npm install
npm run dev                   # Dev server on 5173
npm run build                 # TypeScript check + Vite build
```

### Backend (outside Docker)

```bash
cd apps/backend
go build ./...
go test ./...
go test ./internal/user/...   # Single package
```

## Architecture

### Backend (`apps/backend/`)

Layered architecture within each domain module:

```
cmd/server/main.go            → entry point: router setup, migrations, DB init
internal/domain/              → shared domain types (User) and sentinel errors
internal/<module>/
  handler.go                  → HTTP handlers (Chi), request parsing, response encoding
  service.go                  → business logic, depends on repository interface
  repository.go               → interface + PostgresRepository implementation (pgx)
pkg/config/                   → env var loading and validation
pkg/database/                 → pgx connection helper
pkg/middleware/               → auth (JWT placeholder) and logging
migrations/                   → golang-migrate SQL files (numbered, up/down pairs)
```

Dependency direction: `Handler → Service → Repository interface ← PostgresRepository`

New domain modules follow the same pattern: create `internal/<module>/` with handler, service, repository.

### Frontend (`apps/frontend/`)

React 18 + TypeScript + Vite. API calls use `import.meta.env.VITE_API_BASE_URL` (defaults to `/api`). Vite proxies `/api` → backend in dev. No state management library yet.

### Environment Variables

Copy `.env.example` to `.env` before first run. Key vars:

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Full DSN used by both migrations and backend |
| `JWT_SECRET` | Sign/verify tokens — change in production |
| `CORS_ALLOWED_ORIGIN` | Frontend origin for CORS |
| `APP_ENV` | `development` or `production` |
| `GATEWAY_FAILURE_RATE` | Simulated payment failure rate (0–1) |

### Hot Reload

- Backend: Air (`.air.toml`) watches `.go` files and rebuilds to `./tmp/main`
- Frontend: Vite polling mode (Docker-compatible)

Both are configured automatically when running via `docker compose up`.

### Go Workspace

`go.work` at repo root declares the backend module. Run `go` commands from `apps/backend/` or use the workspace from root.
