.PHONY: up down logs migrate-up migrate-down

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate-up:
	docker compose run --rm backend sh -c "echo 'No migration tool configured yet'; exit 0"

migrate-down:
	docker compose run --rm backend sh -c "echo 'No migration tool configured yet'; exit 0"
