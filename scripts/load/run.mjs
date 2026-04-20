import { performance } from 'node:perf_hooks'

const DEFAULTS = {
  baseUrl: 'http://localhost:8080',
  users: 3,
  batchesPerUser: 2,
  rows: 50,
  timeoutMs: 120_000,
  staggerMs: 250,
  invalidEvery: 0,
  openStream: true,
  password: 'FlashPay.LoadTest.123!',
  verbose: false,
}

function printHelp() {
  console.log(`FlashPay load harness

Usage:
  npm run load:test -- [options]

Options:
  --base-url <url>           API base URL. Default: ${DEFAULTS.baseUrl}
  --users <n>                Number of users to register. Default: ${DEFAULTS.users}
  --batches-per-user <n>     Batches uploaded per user. Default: ${DEFAULTS.batchesPerUser}
  --rows <n>                 CSV rows per batch. Default: ${DEFAULTS.rows}
  --timeout-ms <n>           Timeout per batch. Default: ${DEFAULTS.timeoutMs}
  --stagger-ms <n>           Delay between launches. Default: ${DEFAULTS.staggerMs}
  --invalid-every <n>        Every Nth batch is sent as invalid CSV and should return 422. Default: ${DEFAULTS.invalidEvery}
  --no-stream                Skip SSE and only poll final detail snapshot.
  --password <value>         Password used for generated users.
  --verbose                  Print per-batch details as they finish.
  --help                     Show this message.

Examples:
  npm run load:test -- --users 5 --batches-per-user 4 --rows 100
  npm run load:test -- --users 10 --batches-per-user 3 --rows 250 --stagger-ms 100
  npm run load:test -- --users 2 --batches-per-user 5 --rows 50 --invalid-every 3
`)
}

function parseArgs(argv) {
  const options = { ...DEFAULTS }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help') {
      options.help = true
      continue
    }

    if (arg === '--no-stream') {
      options.openStream = false
      continue
    }

    if (arg === '--verbose') {
      options.verbose = true
      continue
    }

    const next = argv[index + 1]
    if (next == null) {
      throw new Error(`Missing value for ${arg}`)
    }

    switch (arg) {
      case '--base-url':
        options.baseUrl = next
        index += 1
        break
      case '--users':
        options.users = parsePositiveInt(next, arg)
        index += 1
        break
      case '--batches-per-user':
        options.batchesPerUser = parsePositiveInt(next, arg)
        index += 1
        break
      case '--rows':
        options.rows = parsePositiveInt(next, arg)
        index += 1
        break
      case '--timeout-ms':
        options.timeoutMs = parsePositiveInt(next, arg)
        index += 1
        break
      case '--stagger-ms':
        options.staggerMs = parseNonNegativeInt(next, arg)
        index += 1
        break
      case '--invalid-every':
        options.invalidEvery = parseNonNegativeInt(next, arg)
        index += 1
        break
      case '--password':
        options.password = next
        index += 1
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

function parseNonNegativeInt(value, flag) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return parsed
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createCsv({ rows, invalid }) {
  const header = 'id,amount,recipient,description,payment_method,last_4_digits'
  const lines = [header]

  for (let index = 0; index < rows; index += 1) {
    const paymentId = `load-${Date.now()}-${Math.random().toString(16).slice(2, 10)}-${index + 1}`
    const amount = (10 + ((index % 17) * 3.17)).toFixed(2)
    const recipient = `Load Recipient ${index + 1}`
    const description = `Batch row ${index + 1}`
    const paymentMethod = index % 2 === 0 ? 'pix' : 'credit_card'
    const lastFourDigits = String(1000 + (index % 9000)).padStart(4, '0')

    if (invalid && index === rows - 1) {
      lines.push(`${paymentId},-1,${recipient},${description},${paymentMethod},12AB`)
      continue
    }

    lines.push(
      [paymentId, amount, recipient, description, paymentMethod, lastFourDigits]
        .map(escapeCsvValue)
        .join(','),
    )
  }

  return lines.join('\n')
}

function escapeCsvValue(value) {
  const stringValue = String(value)
  if (!/[",\n]/.test(stringValue)) {
    return stringValue
  }
  return `"${stringValue.replaceAll('"', '""')}"`
}

async function registerUser(baseUrl, password, userIndex) {
  const uniqueId = `${Date.now()}-${userIndex}-${Math.random().toString(16).slice(2, 8)}`
  const email = `load.${uniqueId}@flashpay.test`

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Load User ${userIndex + 1}`,
      email,
      password,
    }),
  })

  const payload = await safeJson(response)
  if (!response.ok) {
    throw new Error(`register failed (${response.status}): ${JSON.stringify(payload)}`)
  }

  return {
    email,
    token: payload.token,
    userId: payload.user?.id,
  }
}

async function uploadBatch(baseUrl, token, csvContent, fileName) {
  const form = new FormData()
  form.append('file', new Blob([csvContent], { type: 'text/csv' }), fileName)

  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}/api/batches/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  })
  const uploadMs = performance.now() - startedAt
  const payload = await safeJson(response)

  return {
    ok: response.ok,
    status: response.status,
    payload,
    uploadMs,
  }
}

async function fetchBatchDetail(baseUrl, token, batchId) {
  const response = await fetch(`${baseUrl}/api/batches/${batchId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await safeJson(response)
  if (!response.ok) {
    throw new Error(`detail failed (${response.status}): ${JSON.stringify(payload)}`)
  }

  return payload
}

async function waitForBatchFinalState(baseUrl, token, batchId, timeoutMs) {
  const startedAt = performance.now()

  while (performance.now() - startedAt < timeoutMs) {
    const detail = await fetchBatchDetail(baseUrl, token, batchId)
    const counts = detail.status_count ?? {}
    const pending = counts.pending ?? 0
    const processing = counts.processing ?? 0

    if (pending === 0 && processing === 0) {
      return {
        detail,
        durationMs: performance.now() - startedAt,
      }
    }

    await sleep(500)
  }

  throw new Error(`timeout waiting final state for batch ${batchId}`)
}

async function waitForBatchDoneStream(baseUrl, token, batchId, timeoutMs) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)
  const startedAt = performance.now()

  try {
    const response = await fetch(`${baseUrl}/api/batches/${batchId}/stream`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      signal: abortController.signal,
    })

    if (!response.ok || !response.body) {
      const body = await response.text()
      throw new Error(`stream failed (${response.status}): ${body}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let paymentUpdatedCount = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replaceAll('\r', '')
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (!event) {
          continue
        }

        if (event.type === 'payment_updated') {
          paymentUpdatedCount += 1
        }

        if (event.type === 'batch_done') {
          return {
            durationMs: performance.now() - startedAt,
            paymentUpdatedCount,
            event,
          }
        }
      }
    }

    throw new Error(`stream closed before batch_done for ${batchId}`)
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(`timeout waiting stream batch_done for batch ${batchId}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseSseBlock(block) {
  const lines = block.split('\n')
  let eventName = ''
  const dataLines = []

  for (const line of lines) {
    if (line.startsWith(':') || line.trim() === '') {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (!eventName || dataLines.length === 0) {
    return null
  }

  const payload = JSON.parse(dataLines.join('\n'))
  return payload.type === eventName ? payload : null
}

async function safeJson(response) {
  const text = await response.text()
  if (text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function summarizeDurations(results, field) {
  const values = results
    .map((result) => result[field])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)

  if (values.length === 0) {
    return null
  }

  return {
    min: roundMs(values[0]),
    p50: roundMs(percentile(values, 0.5)),
    p95: roundMs(percentile(values, 0.95)),
    max: roundMs(values[values.length - 1]),
  }
}

function percentile(values, p) {
  if (values.length === 1) {
    return values[0]
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1))
  return values[index]
}

function roundMs(value) {
  return Math.round(value * 100) / 100
}

function assertExpectedFinalState(result) {
  const detail = result.finalDetail
  if (!detail) {
    return 'missing final detail'
  }

  const counts = detail.status_count ?? {}
  const total =
    (counts.pending ?? 0) +
    (counts.processing ?? 0) +
    (counts.success ?? 0) +
    (counts.failed ?? 0)

  if (total !== detail.total_payments) {
    return `status_count sum ${total} != total_payments ${detail.total_payments}`
  }

  if ((counts.pending ?? 0) !== 0 || (counts.processing ?? 0) !== 0) {
    return 'batch finished with pending or processing payments'
  }

  return null
}

async function runBatchScenario({
  baseUrl,
  token,
  rows,
  timeoutMs,
  openStream,
  invalid,
  batchOrdinal,
  userIndex,
  verbose,
}) {
  const scenarioStartedAt = performance.now()
  const fileName = invalid ? `invalid-${batchOrdinal}.csv` : `load-${batchOrdinal}.csv`
  const csvContent = createCsv({ rows, invalid })
  const upload = await uploadBatch(baseUrl, token, csvContent, fileName)
  const acceptedAt = performance.now()

  if (invalid) {
    const expected = upload.status === 422
    return {
      kind: 'invalid',
      ok: expected,
      expected: 422,
      uploadStatus: upload.status,
      uploadMs: upload.uploadMs,
      endToEndMs: performance.now() - scenarioStartedAt,
      payload: upload.payload,
      batchOrdinal,
      userIndex,
      failureReason: expected ? null : `expected 422, got ${upload.status}`,
    }
  }

  if (!upload.ok) {
    return {
      kind: 'valid',
      ok: false,
      uploadStatus: upload.status,
      uploadMs: upload.uploadMs,
      endToEndMs: performance.now() - scenarioStartedAt,
      payload: upload.payload,
      batchOrdinal,
      userIndex,
      failureReason: `upload failed with ${upload.status}`,
    }
  }

  const batchId = upload.payload?.batch_id
  if (!batchId) {
    return {
      kind: 'valid',
      ok: false,
      uploadStatus: upload.status,
      uploadMs: upload.uploadMs,
      endToEndMs: performance.now() - scenarioStartedAt,
      payload: upload.payload,
      batchOrdinal,
      userIndex,
      failureReason: 'upload response missing batch_id',
    }
  }

  let streamResult = null
  try {
    if (openStream) {
      streamResult = await waitForBatchDoneStream(baseUrl, token, batchId, timeoutMs)
    }

    const finalState = await waitForBatchFinalState(baseUrl, token, batchId, timeoutMs)
    const result = {
      kind: 'valid',
      ok: true,
      batchId,
      batchOrdinal,
      userIndex,
      uploadStatus: upload.status,
      uploadMs: upload.uploadMs,
      streamMs: streamResult?.durationMs ?? null,
      streamPaymentUpdatedCount: streamResult?.paymentUpdatedCount ?? 0,
      finalStateMs: finalState.durationMs,
      processingMs: performance.now() - acceptedAt,
      endToEndMs: performance.now() - scenarioStartedAt,
      finalDetail: finalState.detail,
      failureReason: null,
    }

    const invariantError = assertExpectedFinalState(result)
    if (invariantError) {
      result.ok = false
      result.failureReason = invariantError
    }

    if (verbose) {
      const counts = result.finalDetail?.status_count ?? {}
      console.log(
        `[batch ${batchOrdinal}] user=${userIndex + 1} batch_id=${batchId} upload=${roundMs(result.uploadMs)}ms processing=${roundMs(result.processingMs)}ms end_to_end=${roundMs(result.endToEndMs)}ms success=${counts.success ?? 0} failed=${counts.failed ?? 0}`,
      )
    }

    return result
  } catch (error) {
    return {
      kind: 'valid',
      ok: false,
      batchId,
      batchOrdinal,
      userIndex,
      uploadStatus: upload.status,
      uploadMs: upload.uploadMs,
      streamMs: streamResult?.durationMs ?? null,
      finalStateMs: null,
      processingMs: performance.now() - acceptedAt,
      endToEndMs: performance.now() - scenarioStartedAt,
      finalDetail: null,
      failureReason: error instanceof Error ? error.message : String(error),
    }
  }
}

function summarizeFinalStatuses(results) {
  return results.reduce(
    (accumulator, result) => {
      const counts = result.finalDetail?.status_count ?? {}
      accumulator.pending += counts.pending ?? 0
      accumulator.processing += counts.processing ?? 0
      accumulator.success += counts.success ?? 0
      accumulator.failed += counts.failed ?? 0
      return accumulator
    },
    { pending: 0, processing: 0, success: 0, failed: 0 },
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const scenarioStartedAt = performance.now()
  console.log('Starting FlashPay load harness with configuration:')
  console.log(JSON.stringify(options, null, 2))

  const users = await Promise.all(
    Array.from({ length: options.users }, (_, index) =>
      registerUser(options.baseUrl, options.password, index),
    ),
  )

  console.log(`Registered ${users.length} user(s).`)

  const tasks = []
  let batchOrdinal = 0

  for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
    for (let batchIndex = 0; batchIndex < options.batchesPerUser; batchIndex += 1) {
      batchOrdinal += 1
      const ordinal = batchOrdinal
      const invalid = options.invalidEvery > 0 && ordinal % options.invalidEvery === 0
      const user = users[userIndex]

      tasks.push(
        (async () => {
          const launchDelay = options.staggerMs * (ordinal - 1)
          if (launchDelay > 0) {
            await sleep(launchDelay)
          }

          return runBatchScenario({
            baseUrl: options.baseUrl,
            token: user.token,
            rows: options.rows,
            timeoutMs: options.timeoutMs,
            openStream: options.openStream,
            invalid,
            batchOrdinal: ordinal,
            userIndex,
            verbose: options.verbose,
          })
        })(),
      )
    }
  }

  const results = await Promise.all(tasks)
  const totalDurationMs = performance.now() - scenarioStartedAt

  const validResults = results.filter((result) => result.kind === 'valid')
  const invalidResults = results.filter((result) => result.kind === 'invalid')
  const failures = results.filter((result) => !result.ok)
  const successfulValidResults = validResults.filter((result) => result.ok)
  const finalStatuses = summarizeFinalStatuses(successfulValidResults)
  const totalPaymentsProcessed = finalStatuses.success + finalStatuses.failed
  const scenarioDurationSeconds = totalDurationMs / 1000
  const successfulBatchesPerSecond =
    scenarioDurationSeconds > 0 ? roundMs(successfulValidResults.length / scenarioDurationSeconds) : null
  const paymentsPerSecond =
    scenarioDurationSeconds > 0 ? roundMs(totalPaymentsProcessed / scenarioDurationSeconds) : null

  const summary = {
    totalUsers: users.length,
    totalBatchesAttempted: results.length,
    validBatches: validResults.length,
    invalidBatches: invalidResults.length,
    successfulRuns: results.filter((result) => result.ok).length,
    failedRuns: failures.length,
    scenarioDurationMs: roundMs(totalDurationMs),
    successfulBatchesPerSecond,
    paymentsPerSecond,
    uploadLatencyMs: summarizeDurations(results, 'uploadMs'),
    finalStateSnapshotLatencyMs: summarizeDurations(validResults, 'finalStateMs'),
    processingLatencyMs: summarizeDurations(successfulValidResults, 'processingMs'),
    endToEndLatencyMs: summarizeDurations(results, 'endToEndMs'),
    streamLatencyMs: options.openStream ? summarizeDurations(successfulValidResults, 'streamMs') : null,
    finalStatuses,
  }

  console.log('\nSummary:')
  console.log(JSON.stringify(summary, null, 2))

  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const failure of failures.slice(0, 20)) {
      console.log(
        JSON.stringify(
          {
            batchOrdinal: failure.batchOrdinal,
            userIndex: failure.userIndex,
            kind: failure.kind,
            batchId: failure.batchId ?? null,
            uploadStatus: failure.uploadStatus,
            reason: failure.failureReason,
          },
          null,
          2,
        ),
      )
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
