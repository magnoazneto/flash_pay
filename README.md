# FlashPay Monorepo

Base inicial do monorepo da FlashPay para a Semana 1 de infra.

## Estrutura

```text
.
|-- apps
|   |-- backend      # API Go
|   `-- frontend     # App React + Vite
|-- infra            # Artefatos de infraestrutura local
|-- packages         # Pacotes compartilhados futuros
|-- package.json     # Workspaces JS
|-- go.work          # Workspace Go
|-- docker-compose.yml
`-- .env.example
```

## Stack local

- Frontend: React + Vite
- Backend: Go
- Banco local: PostgreSQL
- Orquestração: Docker Compose

## Como subir

1. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

2. Suba o ambiente:

```bash
docker compose up --build
```

## Comandos uteis

```bash
npm run dev:frontend
npm run build:frontend
go run ./apps/backend/cmd/server
```

## Serviços

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- Healthcheck backend: `http://localhost:8080/health`
- Metrics backend: `http://localhost:8080/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

## Observações

- O backend foi mantido mínimo para garantir bootstrap rápido do monorepo.
- O frontend já consome a URL da API via `VITE_API_URL`.
- A pasta `packages` foi criada para compartilhamento futuro de contratos, tipos ou SDK interno.
