import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '@/store'
import { batchApi } from './batchApi'
import type {
  BatchDetail,
  BatchDoneEvent,
  BatchPaymentStatus,
  BatchStreamEvent,
} from '../types'

type BatchStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'completed'
  | 'error'

export interface BatchProgressState {
  totalPayments: number
  completedPayments: number
  percentComplete: number
}

export interface BatchStreamState {
  status: BatchStreamStatus
  retryCount: number
  lastEventAt: string | null
  lastError: string | null
}

export interface BatchRuntimeState {
  detail: BatchDetail | null
  progress: BatchProgressState
  stream: BatchStreamState
}

interface BatchDetailsState {
  byId: Record<string, BatchRuntimeState>
}

const createInitialProgressState = (): BatchProgressState => ({
  totalPayments: 0,
  completedPayments: 0,
  percentComplete: 0,
})

const createInitialStreamState = (): BatchStreamState => ({
  status: 'idle',
  retryCount: 0,
  lastEventAt: null,
  lastError: null,
})

const emptyProgressState: BatchProgressState = createInitialProgressState()
const emptyStreamState: BatchStreamState = createInitialStreamState()

const createBatchRuntimeState = (): BatchRuntimeState => ({
  detail: null,
  progress: createInitialProgressState(),
  stream: createInitialStreamState(),
})

const initialState: BatchDetailsState = {
  byId: {},
}

const isTerminalStatus = (status: BatchPaymentStatus) =>
  status === 'success' || status === 'failed'

const calculateCompletedPayments = (detail: BatchDetail) =>
  detail.status_count.success + detail.status_count.failed

const calculateProgress = (
  totalPayments: number,
  completedPayments: number,
): BatchProgressState => ({
  totalPayments,
  completedPayments,
  percentComplete:
    totalPayments === 0
      ? 0
      : Math.min(100, Math.round((completedPayments / totalPayments) * 100)),
})

const ensureBatchRuntimeState = (
  state: BatchDetailsState,
  batchId: string,
): BatchRuntimeState => {
  if (!state.byId[batchId]) {
    state.byId[batchId] = createBatchRuntimeState()
  }

  return state.byId[batchId]
}

const decrementStatusCount = (
  detail: BatchDetail,
  status: BatchPaymentStatus,
) => {
  detail.status_count[status] = Math.max(0, detail.status_count[status] - 1)
}

const incrementStatusCount = (
  detail: BatchDetail,
  status: BatchPaymentStatus,
) => {
  detail.status_count[status] += 1
}

const applyHydratedDetail = (
  state: BatchDetailsState,
  detail: BatchDetail,
) => {
  const batchState = ensureBatchRuntimeState(state, detail.id)

  batchState.detail = detail
  batchState.progress = calculateProgress(
    detail.total_payments,
    calculateCompletedPayments(detail),
  )
}

const applyBatchDoneState = (
  batchState: BatchRuntimeState,
  event: BatchDoneEvent,
) => {
  batchState.progress = calculateProgress(
    event.total_payments,
    event.completed_payments,
  )
  batchState.stream.status = 'completed'
  batchState.stream.retryCount = 0
  batchState.stream.lastEventAt = event.sent_at
  batchState.stream.lastError = null

  if (batchState.detail) {
    batchState.detail.total_payments = event.total_payments
    batchState.detail.status_count.pending = 0
    batchState.detail.status_count.processing = 0
  }
}

const batchDetailsSlice = createSlice({
  name: 'batchDetails',
  initialState,
  reducers: {
    batchDetailHydrated: (state, action: PayloadAction<BatchDetail>) => {
      applyHydratedDetail(state, action.payload)
    },
    initializeBatchRuntime: (state, action: PayloadAction<string>) => {
      ensureBatchRuntimeState(state, action.payload)
    },
    streamConnecting: (
      state,
      action: PayloadAction<{ batchId: string; retryCount?: number }>,
    ) => {
      const batchState = ensureBatchRuntimeState(state, action.payload.batchId)
      const retryCount = action.payload.retryCount ?? 0

      batchState.stream.status = retryCount > 0 ? 'reconnecting' : 'connecting'
      batchState.stream.retryCount = retryCount
    },
    streamConnected: (state, action: PayloadAction<{ batchId: string }>) => {
      const batchState = ensureBatchRuntimeState(state, action.payload.batchId)

      batchState.stream.status = 'connected'
      batchState.stream.retryCount = 0
      batchState.stream.lastError = null
    },
    streamReconnectScheduled: (
      state,
      action: PayloadAction<{
        batchId: string
        retryCount: number
        error: string
      }>,
    ) => {
      const batchState = ensureBatchRuntimeState(state, action.payload.batchId)

      batchState.stream.status = 'reconnecting'
      batchState.stream.retryCount = action.payload.retryCount
      batchState.stream.lastError = action.payload.error
    },
    streamFailed: (
      state,
      action: PayloadAction<{ batchId: string; error: string }>,
    ) => {
      const batchState = ensureBatchRuntimeState(state, action.payload.batchId)

      batchState.stream.status = 'error'
      batchState.stream.lastError = action.payload.error
    },
    streamDisconnected: (state, action: PayloadAction<{ batchId: string }>) => {
      const batchState = ensureBatchRuntimeState(state, action.payload.batchId)

      if (batchState.stream.status === 'completed') {
        return
      }

      batchState.stream.status = 'disconnected'
    },
    streamEventReceived: (state, action: PayloadAction<BatchStreamEvent>) => {
      const event = action.payload
      const batchState = ensureBatchRuntimeState(state, event.batch_id)

      batchState.stream.lastEventAt = event.sent_at
      batchState.stream.lastError = null

      if (event.type === 'batch_done') {
        applyBatchDoneState(batchState, event)
        return
      }

      const detail = batchState.detail

      if (!detail) {
        return
      }

      const payment = detail.payments.find(
        (currentPayment) => currentPayment.id === event.payment_id,
      )

      if (!payment) {
        return
      }

      if (payment.status !== event.status) {
        decrementStatusCount(detail, payment.status)
        incrementStatusCount(detail, event.status)
      }

      payment.status = event.status
      payment.error_message = event.error_message ?? null
      payment.processed_at = isTerminalStatus(event.status)
        ? payment.processed_at ?? event.sent_at
        : null

      batchState.progress = calculateProgress(
        detail.total_payments,
        calculateCompletedPayments(detail),
      )
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      batchApi.endpoints.getBatchById.matchFulfilled,
      (state, action) => {
        applyHydratedDetail(state, action.payload)
      },
    )
  },
})

export const {
  batchDetailHydrated,
  initializeBatchRuntime,
  streamConnected,
  streamConnecting,
  streamDisconnected,
  streamEventReceived,
  streamFailed,
  streamReconnectScheduled,
} = batchDetailsSlice.actions

export default batchDetailsSlice.reducer

export const selectBatchRuntimeState = (
  state: RootState,
  batchId: string,
): BatchRuntimeState | null => state.batchDetails?.byId?.[batchId] ?? null

export const selectBatchDetail = (state: RootState, batchId: string) =>
  selectBatchRuntimeState(state, batchId)?.detail ?? null

export const selectBatchProgress = (state: RootState, batchId: string) =>
  selectBatchRuntimeState(state, batchId)?.progress ?? emptyProgressState

export const selectBatchStreamState = (state: RootState, batchId: string) =>
  selectBatchRuntimeState(state, batchId)?.stream ?? emptyStreamState
