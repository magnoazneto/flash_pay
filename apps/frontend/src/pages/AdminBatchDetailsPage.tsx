import { Link, useParams } from 'react-router-dom'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import BatchProgressCard from '@/features/batches/components/BatchProgressCard'
import { useBatchStream } from '@/features/batches/hooks/useBatchStream'
import { useGetBatchByIdQuery } from '@/features/batches/store/batchApi'
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

export default function AdminBatchDetailsPage() {
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
    <main className="dashboard-shell admin-batch-detail-shell">
      <section className="hero-panel">
        <p className="eyebrow">Administracao</p>
        <h1>Detalhes administrativos do lote</h1>
        <p className="lead">
          Veja o lote existente, filtre rapidamente os pagamentos com erro e
          exporte a lista em CSV sem sair da tela.
        </p>

        <div className="admin-batch-detail-header">
          <p className="admin-batch-detail-note">
            Volte para a lista administrativa quando quiser revisar outro lote.
          </p>
          <Link to="/admin/batches">Voltar para lotes administrativos</Link>
        </div>
      </section>

      <BatchProgressCard
        batchId={batchId}
        detail={detail}
        progress={progress}
        streamState={streamState}
        isLoading={isLoading}
        errorMessage={errorMessage}
        adminView
      />
    </main>
  )
}
