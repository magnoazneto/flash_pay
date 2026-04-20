import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState } from '@/features/auth/types'
import batchDetailsReducer, {
  batchDetailHydrated,
  type BatchRuntimeState,
} from '@/features/batches/store/batchDetailsSlice'
import type { BatchDetail } from '@/features/batches/types'
import { baseApi } from '@/store/baseApi'
import { useBatchStream } from './useBatchStream'

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api')

const batchDetailFixture: BatchDetail = {
  id: 'batch-1',
  file_name: 'payments.csv',
  total_payments: 2,
  status: 'pending',
  user_id: 'user-1',
  created_at: '2026-04-20T10:00:00Z',
  status_count: {
    pending: 2,
    processing: 0,
    success: 0,
    failed: 0,
  },
  payments: [
    {
      id: 'payment-1',
      recipient: 'Alice',
      amount: '10.00',
      status: 'pending',
      error_message: null,
      processed_at: null,
    },
    {
      id: 'payment-2',
      recipient: 'Bob',
      amount: '20.00',
      status: 'pending',
      error_message: null,
      processed_at: null,
    },
  ],
}

const createTestStore = () =>
  configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
      batchDetails: batchDetailsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    preloadedState: {
      auth: {
        token: 'stream-token',
        user: {
          id: 'user-1',
          name: 'Operator User',
          email: 'operator@flashpay.test',
          role: 'operator',
        },
        isAuthenticated: true,
      } satisfies AuthState,
    },
  })

const HookProbe = ({ batchId }: { batchId: string }) => {
  useBatchStream(batchId)

  return null
}

const createSseResponse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  )

const getBatchState = (store: ReturnType<typeof createTestStore>) =>
  store.getState().batchDetails.byId['batch-1'] as BatchRuntimeState

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useBatchStream', () => {
  it('resynchronizes batch details after connecting and completing the stream', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)

        if (url.endsWith('/batches/batch-1/stream')) {
          return Promise.resolve(
            createSseResponse([
              'event: payment_updated\n',
              'data: {"type":"payment_updated","batch_id":"batch-1","payment_id":"payment-1","status":"success","sent_at":"2026-04-20T10:01:00Z"}\n\n',
              'event: batch_done\n',
              'data: {"type":"batch_done","batch_id":"batch-1","total_payments":2,"completed_payments":2,"sent_at":"2026-04-20T10:02:00Z"}\n\n',
            ]),
          )
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'batch-1',
              file_name: 'payments.csv',
              total_payments: 2,
              status: 'failed',
              user_id: 'user-1',
              created_at: '2026-04-20T10:00:00Z',
              status_count: {
                pending: 0,
                processing: 0,
                success: 1,
                failed: 1,
              },
              payments: [
                {
                  id: 'payment-1',
                  recipient: 'Alice',
                  amount: '10.00',
                  status: 'success',
                  error_message: null,
                  processed_at: '2026-04-20T10:01:00Z',
                },
                {
                  id: 'payment-2',
                  recipient: 'Bob',
                  amount: '20.00',
                  status: 'failed',
                  error_message: 'gateway error',
                  processed_at: '2026-04-20T10:02:00Z',
                },
              ],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
        )
      })

    const store = createTestStore()
    store.dispatch(batchDetailHydrated(batchDetailFixture))

    render(
      <Provider store={store}>
        <HookProbe batchId="batch-1" />
      </Provider>,
    )

    await waitFor(() => {
      expect(getBatchState(store).stream.status).toBe('completed')
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer stream-token',
      },
    })
    expect(getBatchState(store)).toMatchObject({
      detail: {
        status_count: {
          pending: 0,
          processing: 0,
          success: 1,
          failed: 1,
        },
      },
      progress: {
        totalPayments: 2,
        completedPayments: 2,
        percentComplete: 100,
      },
      stream: {
        status: 'completed',
      },
    })
  })

  it('reconnects with backoff after an unexpected disconnect', async () => {
    vi.useFakeTimers()

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => Promise.resolve(createSseResponse([])))
      .mockImplementationOnce(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify(batchDetailFixture),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            ),
          ),
      )
      .mockImplementationOnce(
        () =>
          Promise.resolve(
            createSseResponse([
              'event: batch_done\n',
              'data: {"type":"batch_done","batch_id":"batch-1","total_payments":2,"completed_payments":2,"sent_at":"2026-04-20T10:03:00Z"}\n\n',
            ]),
          ),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...batchDetailFixture,
              status: 'success',
              status_count: {
                pending: 0,
                processing: 0,
                success: 2,
                failed: 0,
              },
              payments: batchDetailFixture.payments.map((payment) => ({
                ...payment,
                status: 'success',
                processed_at: '2026-04-20T10:03:00Z',
              })),
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
        ),
      )

    const store = createTestStore()
    store.dispatch(batchDetailHydrated(batchDetailFixture))

    render(
      <Provider store={store}>
        <HookProbe batchId="batch-1" />
      </Provider>,
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(getBatchState(store).stream.status).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(1000)

    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(getBatchState(store).stream.status).toBe('completed')
  })
})
