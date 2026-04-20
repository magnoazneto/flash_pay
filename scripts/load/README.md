# FlashPay Load Harness

This directory contains a local load-testing harness for FlashPay. The goal is not synthetic benchmarking in isolation, but realistic end-to-end pressure against the application stack running on Docker Compose.

The harness is designed to exercise:

- concurrent user registration
- concurrent CSV uploads
- batch processing under pressure
- SSE-based realtime tracking
- final batch consistency validation
- comparative runs with and without realtime streaming

## Requirements

- Local stack running with `docker compose up -d`
- Backend reachable at `http://localhost:8080`
- Node 18+ available locally

## Running a Scenario

```bash
npm run load:test -- --users 5 --batches-per-user 4 --rows 100
```

## Main Options

- `--base-url <url>`: API base URL. Default: `http://localhost:8080`
- `--users <n>`: number of generated test users
- `--batches-per-user <n>`: batches submitted by each user
- `--rows <n>`: CSV rows per batch
- `--timeout-ms <n>`: timeout per batch
- `--stagger-ms <n>`: launch delay between batches, useful for ramping instead of burst traffic
- `--invalid-every <n>`: every Nth batch is sent as invalid CSV and is expected to return `422`
- `--no-stream`: disables SSE tracking and validates completion through final snapshot polling only
- `--password <value>`: password used for generated users
- `--verbose`: prints per-batch completion details

## Example Scenarios

Light validation:

```bash
npm run load:test -- --users 2 --batches-per-user 2 --rows 20 --verbose
```

Moderate concurrent load:

```bash
npm run load:test -- --users 5 --batches-per-user 4 --rows 100 --stagger-ms 100
```

Aggressive burst load:

```bash
npm run load:test -- --users 12 --batches-per-user 6 --rows 500 --stagger-ms 0 --timeout-ms 240000
```

Mixed valid and invalid input:

```bash
npm run load:test -- --users 4 --batches-per-user 4 --rows 50 --invalid-every 3
```

## What the Harness Validates

- successful user registration
- concurrent batch uploads
- SSE connectivity on `/api/batches/{id}/stream`
- receipt of `batch_done`
- final consistency of `/api/batches/{id}`
- matching totals between `total_payments` and `status_count`
- no batches left in `pending` or `processing`

## Understanding the Output

At the end of each run, the harness prints:

- total executed volume
- upload latency
- final snapshot latency
- processing latency
- end-to-end latency
- batch throughput and payment throughput
- stream latency to `batch_done`
- aggregate final payment statuses
- a compact failure list, when applicable

If any scenario fails validation, the process exits with code `1`.

## Results

Portfolio-oriented scenario writeups are available in [RESULTS.md](/home/magno/projects/flash-pay/scripts/load/RESULTS.md).
