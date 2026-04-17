.PHONY: up down logs migrate-up migrate-down

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

migrate-up:
	docker compose exec backend migrate -path /app/migrations -database "$$DATABASE_URL" up

migrate-down:
	docker compose exec backend migrate -path /app/migrations -database "$$DATABASE_URL" down 1
