# FlashPay Load Test Results

This document consolidates FlashPay load-testing results in a portfolio-friendly format, with emphasis on throughput, operational stability, and realtime behavior under pressure.

## Evaluated Environment

- Local application stack running on Docker Compose
- Go backend
- React + Vite frontend
- Local PostgreSQL instance
- Node-based load harness: [run.mjs](/home/magno/projects/flash-pay/scripts/load/run.mjs)

## Important Note About Failure Rate

The application uses a **simulated payment gateway**, and failures are intentionally part of the local runtime behavior.

Code references:

- [apps/backend/internal/gateway/gateway.go](/home/magno/projects/flash-pay/apps/backend/internal/gateway/gateway.go)
- `defaultFailureRate = 0.05`
- `ProcessPayment(...)` calls `g.shouldFail()`
- `shouldFail()` returns `g.rng.Float64() < g.cfg.FailureRate`

In practice, the default environment runs with approximately **5% simulated payment failure**, plus a random delay between `100ms` and `500ms` per payment.

That means the failure counts below are aligned with the current gateway design, not with an unexpected regression in the batch workflow itself.

## Test Objectives

The scenarios below were executed to validate:

- concurrent CSV batch uploads
- parallel batch execution through the worker pool
- realtime visibility through SSE
- correctness of final batch state
- sustained throughput under burst load
- the cost of SSE compared with snapshot-only polling

## Scenario A: High Concurrency With SSE

Configuration:

```json
{
  "baseUrl": "http://localhost:8080",
  "users": 12,
  "batchesPerUser": 6,
  "rows": 500,
  "timeoutMs": 240000,
  "staggerMs": 0,
  "invalidEvery": 0,
  "openStream": true
}
```

Total volume:

- `72` batches
- `500` payments per batch
- `36,000` payments overall

Summary:

```json
{
  "totalUsers": 12,
  "totalBatchesAttempted": 72,
  "validBatches": 72,
  "invalidBatches": 0,
  "successfulRuns": 72,
  "failedRuns": 0,
  "scenarioDurationMs": 36270.76,
  "successfulBatchesPerSecond": 1.99,
  "paymentsPerSecond": 992.53,
  "uploadLatencyMs": {
    "min": 192.44,
    "p50": 410.55,
    "p95": 574.99,
    "max": 578.63
  },
  "finalStateSnapshotLatencyMs": {
    "min": 5.02,
    "p50": 7.21,
    "p95": 32.63,
    "max": 42.92
  },
  "processingLatencyMs": {
    "min": 34085.54,
    "p50": 34945.35,
    "p95": 35561.45,
    "max": 35748.66
  },
  "endToEndLatencyMs": {
    "min": 34354.85,
    "p50": 35357,
    "p95": 35899.18,
    "max": 36048.17
  },
  "streamLatencyMs": {
    "min": 34065.54,
    "p50": 34938.12,
    "p95": 35554,
    "max": 35742.25
  },
  "finalStatuses": {
    "pending": 0,
    "processing": 0,
    "success": 34234,
    "failed": 1766
  }
}
```

Technical reading:

- `0` harness executions failed.
- `0` batches were left in `pending` or `processing`.
- SSE remained stable across all batches.
- The system sustained approximately `992 payments/s` under burst load.
- Batch processing time stayed tightly grouped around `35s`, with low variance between `p50` and `p95`.

Conclusion:

The system handled high concurrency with SSE enabled while preserving strong latency predictability and full final-state consistency.

## Scenario B: High Concurrency Without SSE

Configuration:

```json
{
  "baseUrl": "http://localhost:8080",
  "users": 12,
  "batchesPerUser": 6,
  "rows": 500,
  "timeoutMs": 240000,
  "staggerMs": 0,
  "invalidEvery": 0,
  "openStream": false
}
```

Total volume:

- `72` batches
- `500` payments per batch
- `36,000` payments overall

Summary:

```json
{
  "totalUsers": 12,
  "totalBatchesAttempted": 72,
  "validBatches": 72,
  "invalidBatches": 0,
  "successfulRuns": 72,
  "failedRuns": 0,
  "scenarioDurationMs": 39975.25,
  "successfulBatchesPerSecond": 1.8,
  "paymentsPerSecond": 900.56,
  "uploadLatencyMs": {
    "min": 247.02,
    "p50": 469.05,
    "p95": 632.68,
    "max": 634.89
  },
  "finalStateSnapshotLatencyMs": {
    "min": 36477.65,
    "p50": 38109.83,
    "p95": 38669.13,
    "max": 39094.71
  },
  "processingLatencyMs": {
    "min": 36477.76,
    "p50": 38109.84,
    "p95": 38669.14,
    "max": 39094.72
  },
  "endToEndLatencyMs": {
    "min": 36953.45,
    "p50": 38587.46,
    "p95": 39217.4,
    "max": 39723.97
  },
  "streamLatencyMs": null,
  "finalStatuses": {
    "pending": 0,
    "processing": 0,
    "success": 34128,
    "failed": 1872
  }
}
```

Technical reading:

- The system also completed `100%` of batches without consistency issues.
- Throughput dropped to roughly `900 payments/s`.
- End-to-end latency was worse than the SSE-enabled run.
- Snapshot-only completion tracking turned out to be more expensive than keeping the realtime stream open.

Conclusion:

Disabling SSE **did not improve** system behavior under load. In this environment, realtime streaming performed better than relying exclusively on polling.

## Comparative Analysis

Direct comparison:

| Scenario | SSE | Total Payments | Duration | Payments/s | p50 Processing |
|---|---|---:|---:|---:|---:|
| A | Yes | 36,000 | 36.27s | 992.53 | 34.95s |
| B | No | 36,000 | 39.98s | 900.56 | 38.11s |

Key takeaways:

- SSE was **not** the bottleneck.
- The system performed better with the realtime stream enabled than with polling alone.
- The dominant bottleneck sits in backend processing, worker execution, and the simulated gateway, not in the realtime delivery layer.
- The realtime architecture was validated under substantial concurrency.

## Overall Assessment

Demonstrated strengths:

- functional stability under a burst of `72` concurrent batches
- full final-state consistency across all completed runs
- stable SSE behavior without manual refreshes
- high local throughput
- predictable behavior at saturation

What the results show from an engineering perspective:

- the system enters **controlled saturation**, not collapse
- latency grows, but remains bounded and predictable
- realtime progress updates continue to work under pressure
- the observed payment failures track the simulated gateway design, rather than indicating spontaneous workflow breakage

## Recommended Next Step

The next meaningful step would be a longer **soak test** focused on accumulated degradation, memory growth, and long-running database behavior rather than burst-only throughput.
