import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import batchDetailsReducer, {
  batchDetailHydrated,
  streamConnecting,
  streamEventReceived,
  type BatchRuntimeState,
} from './batchDetailsSlice'
import type { BatchDetail } from '../types'

const batchDetailFixture: BatchDetail = {
  id: 'batch-1',
  file_name: 'payments.csv',
  total_payments: 2,
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

const createStore = () =>
  configureStore({
    reducer: {
      batchDetails: batchDetailsReducer,
    },
  })

const getBatchState = (store: ReturnType<typeof createStore>) =>
  (store.getState().batchDetails.byId['batch-1'] ?? null) as BatchRuntimeState | null

describe('batchDetailsSlice', () => {
  it('hydrates batch detail and derives the initial progress snapshot', () => {
    const store = createStore()

    store.dispatch(batchDetailHydrated(batchDetailFixture))

    expect(getBatchState(store)).toMatchObject({
      detail: batchDetailFixture,
      progress: {
        totalPayments: 2,
        completedPayments: 0,
        percentComplete: 0,
      },
    })
  })

  it('applies payment_updated events to payments, counts and progress', () => {
    const store = createStore()

    store.dispatch(batchDetailHydrated(batchDetailFixture))
    store.dispatch(streamConnecting({ batchId: 'batch-1' }))
    store.dispatch(
      streamEventReceived({
        type: 'payment_updated',
        batch_id: 'batch-1',
        payment_id: 'payment-1',
        status: 'success',
        sent_at: '2026-04-20T10:01:00Z',
      }),
    )

    expect(getBatchState(store)).toMatchObject({
      detail: {
        status_count: {
          pending: 1,
          processing: 0,
          success: 1,
          failed: 0,
        },
        payments: [
          {
            id: 'payment-1',
            status: 'success',
          },
          {
            id: 'payment-2',
            status: 'pending',
          },
        ],
      },
      progress: {
        totalPayments: 2,
        completedPayments: 1,
        percentComplete: 50,
      },
      stream: {
        lastEventAt: '2026-04-20T10:01:00Z',
      },
    })
  })

  it('marks the stream as completed when batch_done arrives', () => {
    const store = createStore()

    store.dispatch(batchDetailHydrated(batchDetailFixture))
    store.dispatch(
      streamEventReceived({
        type: 'batch_done',
        batch_id: 'batch-1',
        total_payments: 2,
        completed_payments: 2,
        sent_at: '2026-04-20T10:02:00Z',
      }),
    )

    expect(getBatchState(store)).toMatchObject({
      progress: {
        totalPayments: 2,
        completedPayments: 2,
        percentComplete: 100,
      },
      stream: {
        status: 'completed',
        lastEventAt: '2026-04-20T10:02:00Z',
      },
    })
  })
})
