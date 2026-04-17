.PHONY: up down logs migrate-up migrate-down migrate-create migrate-status

ifneq (,$(wildcard .env))
  include .env
  export
endif

DB_URL=postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)?sslmode=disable
MIGRATE=docker compose exec backend migrate

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

migrate-up:
	$(MIGRATE) -path /app/migrations -database "$(DB_URL)" up

migrate-down:
	$(MIGRATE) -path /app/migrations -database "$(DB_URL)" down 1

migrate-create:
	@read -p "Nome da migration: " name; \
	$(MIGRATE) create -ext sql -dir /app/migrations -seq $$name

migrate-status:
	$(MIGRATE) -path /app/migrations -database "$(DB_URL)" version
