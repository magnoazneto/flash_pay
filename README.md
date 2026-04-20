# FlashPay Monorepo

FlashPay is a batch payment processing application built as a monorepo. It combines a Go backend, a React frontend, PostgreSQL, local observability tooling, and a real-time batch progress experience over SSE.

The project was developed incrementally, but the current state already covers a meaningful end-to-end flow:

- authentication and role-aware access
- CSV batch uploads
- asynchronous payment processing through a worker pool
- real-time batch progress updates
- admin visibility across all submitted batches
- local load testing and performance reporting

## Repository Structure

```text
.
|-- apps
|   |-- backend      # Go API
|   `-- frontend     # React + Vite application
|-- infra            # Local infrastructure and observability assets
|-- packages         # Reserved for future shared packages
|-- scripts          # Utility scripts, including load testing
|-- package.json     # JavaScript workspace root
|-- go.work          # Go workspace root
|-- docker-compose.yml
`-- .env.example
```

## Tech Stack

- Frontend: React + Vite
- Backend: Go
- Database: PostgreSQL
- Realtime updates: Server-Sent Events
- Observability: Prometheus + Grafana
- Local orchestration: Docker Compose

## Running Locally

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Start the local stack:

```bash
docker compose up --build
```

## Common Commands

Frontend:

```bash
npm run dev:frontend
npm run build:frontend
```

Backend:

```bash
go run ./apps/backend/cmd/server
```

Load testing:

```bash
npm run load:test -- --users 5 --batches-per-user 4 --rows 100
```

## Local Services

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- Backend health: `http://localhost:8080/health`
- Backend metrics: `http://localhost:8080/metrics`
- Prometheus: `http://localhost:9091`
- Grafana: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

## Notable Capabilities

### Batch Processing

- CSV uploads are accepted asynchronously.
- Payments are persisted and dispatched to a worker pool.
- Batch status is derived from payment status transitions.
- Final state consistency is validated through automated tests and load scenarios.

### Real-Time Progress

- Batch details update in real time using SSE.
- The frontend resynchronizes batch state when streams connect and when batches finish.
- The backend was hardened so middleware does not break streaming support.

### Admin Operations

- Admin users can list all batches across users.
- Filters such as `user_id` and `status` are handled server-side.
- User management hardening prevents invalid self-role mutations.

### Quality and Validation

- Backend includes unit and integration coverage around auth, batch flows, worker behavior, and CSV validation.
- Frontend includes component and hook tests around batch flows and streaming behavior.
- A local load harness is available under [scripts/load](/home/magno/projects/flash-pay/scripts/load/README.md).

## Load Testing

The repository includes a Node-based load harness designed to exercise:

- concurrent user registration
- concurrent CSV batch uploads
- SSE batch tracking
- final batch consistency checks
- comparative scenarios with and without the realtime stream

Relevant files:

- [scripts/load/README.md](/home/magno/projects/flash-pay/scripts/load/README.md)
- [scripts/load/RESULTS.md](/home/magno/projects/flash-pay/scripts/load/RESULTS.md)

## Notes

- The payment gateway is intentionally simulated in local environments, including failure-rate behavior.
- The `packages/` directory is reserved for future shared contracts, SDKs, or typed integrations.
- The current setup is optimized for fast local iteration rather than production deployment.
