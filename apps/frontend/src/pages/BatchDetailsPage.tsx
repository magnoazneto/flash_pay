import { Link, useParams } from 'react-router-dom'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { useBatchStream } from '@/features/batches/hooks/useBatchStream'
import { useGetBatchByIdQuery } from '@/features/batches/store/batchApi'
import BatchProgressCard from '@/features/batches/components/BatchProgressCard'
import {
  type BatchProgressState,
  type BatchStreamState,
  selectBatchDetail,
  selectBatchProgress,
  selectBatchStreamState,
} from '@/features/batches/store/batchDetailsSlice'
import type { BatchApiErrorResponse } from '@/features/batches/types'
import { useAppSelector } from '@/hooks/store'

const getBatchErrorMessage = (error: unknown) => {
  const fallbackMessage = 'Nao foi possivel carregar o lote.'

  if (!error || typeof error !== 'object' || !('status' in error)) {
    return fallbackMessage
  }

  const fetchError = error as FetchBaseQueryError

  if ('error' in fetchError && typeof fetchError.error === 'string') {
    return fetchError.error
  }

  if (!fetchError.data || typeof fetchError.data !== 'object') {
    return fallbackMessage
  }

  const apiError = fetchError.data as BatchApiErrorResponse
  return apiError.error ?? fallbackMessage
}

export default function BatchDetailsPage() {
  const { id } = useParams()
  const batchId = id ?? ''
  const { data, error, isLoading } = useGetBatchByIdQuery(batchId, {
    skip: batchId.length === 0,
  })
  const detailFromState = useAppSelector((state) =>
    batchId ? selectBatchDetail(state, batchId) : null,
  )
  const progress = useAppSelector((state) =>
    batchId
      ? selectBatchProgress(state, batchId)
      : ({
          totalPayments: 0,
          completedPayments: 0,
          percentComplete: 0,
        } satisfies BatchProgressState),
  )
  const streamState = useAppSelector((state) =>
    batchId
      ? selectBatchStreamState(state, batchId)
      : ({
          status: 'idle',
          retryCount: 0,
          lastEventAt: null,
          lastError: null,
        } satisfies BatchStreamState),
  )

  useBatchStream(batchId)

  const detail = detailFromState ?? data ?? null
  const errorMessage = error ? getBatchErrorMessage(error) : null

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <p className="eyebrow">Batches</p>
        <h1>Detalhes do lote</h1>
        <p className="lead">
          Estado inicial do lote hidratado via API e atualizado em tempo real
          por SSE autenticado.
        </p>
        <div className="admin-batch-detail-header">
          <p className="admin-batch-detail-note">
            Volte ao dashboard para acompanhar outros lotes ou enviar um novo arquivo.
          </p>
          <Link to="/dashboard">Voltar ao dashboard</Link>
        </div>
      </section>

      <BatchProgressCard
        batchId={batchId}
        detail={detail}
        progress={progress}
        streamState={streamState}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />
    </main>
  )
}
