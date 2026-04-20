import { useEffect } from 'react'
import { logout } from '@/features/auth/store/authSlice'
import { useAppDispatch, useAppSelector } from '@/hooks/store'
import {
  batchDetailHydrated,
  initializeBatchRuntime,
  streamConnected,
  streamConnecting,
  streamDisconnected,
  streamEventReceived,
  streamFailed,
  streamReconnectScheduled,
} from '@/features/batches/store/batchDetailsSlice'
import type { BatchDetail, BatchStreamEvent } from '@/features/batches/types'

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL ?? '/api'

const buildBatchStreamUrl = (batchId: string) => {
  const baseUrl = getApiBaseUrl()
  const path = `/batches/${batchId}/stream`

  if (/^https?:\/\//.test(baseUrl)) {
    return new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`).toString()
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`
}

const buildBatchDetailUrl = (batchId: string) => {
  const baseUrl = getApiBaseUrl()
  const path = `/batches/${batchId}`

  if (/^https?:\/\//.test(baseUrl)) {
    return new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`).toString()
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`
}

const getReconnectDelay = (retryCount: number) =>
  RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)] ?? 8000

const waitForRetry = async (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms)

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      },
      { once: true },
    )
  })

const parseEventBlock = (block: string): BatchStreamEvent | null => {
  let eventName = ''
  const dataLines: string[] = []

  for (const rawLine of block.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd()

    if (line.length === 0 || line.startsWith(':')) {
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

  try {
    const parsed = JSON.parse(dataLines.join('\n')) as BatchStreamEvent

    return parsed.type === eventName ? parsed : null
  } catch {
    return null
  }
}

const consumeSseStream = async (
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: BatchStreamEvent) => void,
  signal: AbortSignal,
) => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r/g, '')

      const segments = buffer.split('\n\n')
      buffer = segments.pop() ?? ''

      for (const segment of segments) {
        const event = parseEventBlock(segment)

        if (event) {
          onEvent(event)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const getStreamErrorMessage = (
  error: unknown,
  fallbackMessage = 'Falha ao conectar ao stream do lote.',
) => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return fallbackMessage
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallbackMessage
}

export const useBatchStream = (batchId?: string) => {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.auth.token)

  useEffect(() => {
    if (!batchId || !token) {
      return
    }

    const abortController = new AbortController()
    let retryCount = 0
    let isCompleted = false

    dispatch(initializeBatchRuntime(batchId))

    const connect = async () => {
      const syncBatchDetail = async () => {
        try {
          const response = await fetch(buildBatchDetailUrl(batchId), {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })

          if (!response.ok) {
            return
          }

          const detail = (await response.json()) as BatchDetail
          dispatch(batchDetailHydrated(detail))
        } catch {
          // Keep the stream alive even if the snapshot refresh fails.
        }
      }

      while (!abortController.signal.aborted && !isCompleted) {
        dispatch(streamConnecting({ batchId, retryCount }))

        try {
          const response = await fetch(buildBatchStreamUrl(batchId), {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token}`,
            },
            signal: abortController.signal,
          })

          if (response.status === 401) {
            dispatch(streamFailed({ batchId, error: 'Sessao expirada.' }))
            dispatch(logout())
            return
          }

          if (response.status === 403) {
            dispatch(
              streamFailed({
                batchId,
                error: 'Voce nao tem permissao para acompanhar este lote.',
              }),
            )
            return
          }

          if (response.status === 404) {
            dispatch(streamFailed({ batchId, error: 'Lote nao encontrado.' }))
            return
          }

          if (!response.ok || !response.body) {
            throw new Error(`Falha ao abrir o stream (${response.status}).`)
          }

          retryCount = 0
          dispatch(streamConnected({ batchId }))
          void syncBatchDetail()

          await consumeSseStream(
            response.body,
            (event) => {
              dispatch(streamEventReceived(event))

              if (event.type === 'batch_done') {
                void syncBatchDetail()
                isCompleted = true
                abortController.abort()
              }
            },
            abortController.signal,
          )

          if (abortController.signal.aborted || isCompleted) {
            return
          }

          retryCount += 1
          dispatch(
            streamReconnectScheduled({
              batchId,
              retryCount,
              error: 'Conexao com o stream foi interrompida. Tentando novamente.',
            }),
          )
          try {
            await waitForRetry(getReconnectDelay(retryCount), abortController.signal)
          } catch {
            return
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            return
          }

          retryCount += 1
          dispatch(
            streamReconnectScheduled({
              batchId,
              retryCount,
              error: getStreamErrorMessage(error),
            }),
          )
          try {
            await waitForRetry(getReconnectDelay(retryCount), abortController.signal)
          } catch {
            return
          }
        }
      }
    }

    void connect()

    return () => {
      abortController.abort()

      if (!isCompleted) {
        dispatch(streamDisconnected({ batchId }))
      }
    }
  }, [batchId, dispatch, token])
}
