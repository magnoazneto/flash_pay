import { Link } from 'react-router-dom'
import type { BatchSummary, BatchStatusCount } from '@/features/batches/types'

type BatchHistoryCardProps = {
  batches: BatchSummary[]
  isLoading?: boolean
  isFetching?: boolean
  errorMessage?: string | null
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const getCompletedPayments = (statusCount: BatchStatusCount) =>
  statusCount.success + statusCount.failed

const getProgressPercent = (batch: BatchSummary) => {
  if (batch.total_payments === 0) {
    return 0
  }

  return Math.min(
    100,
    Math.round(
      (getCompletedPayments(batch.status_count) / batch.total_payments) * 100,
    ),
  )
}

const getBatchStatusLabel = (batch: BatchSummary) => {
  const { pending, processing, success, failed } = batch.status_count

  if (processing > 0) {
    return 'Em processamento'
  }

  if (pending > 0 && success === 0 && failed === 0) {
    return 'Aguardando processamento'
  }

  if (failed > 0 && pending === 0 && processing === 0) {
    return 'Concluido com falhas'
  }

  if (success === batch.total_payments && batch.total_payments > 0) {
    return 'Concluido'
  }

  return 'Atualizado'
}

const getStatusDetail = (batch: BatchSummary) => {
  const completedPayments = getCompletedPayments(batch.status_count)

  return `${completedPayments}/${batch.total_payments} processados`
}

export default function BatchHistoryCard({
  batches,
  isLoading = false,
  isFetching = false,
  errorMessage = null,
}: BatchHistoryCardProps) {
  return (
    <section className="status-card batch-history-card" aria-label="Historico de lotes">
      <div className="card-header">
        <div>
          <p className="section-kicker">Historico</p>
          <h2>Lotes recentes</h2>
        </div>
        {isFetching && batches.length > 0 ? (
          <p className="batch-history-refresh">Atualizando...</p>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="submit-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? <p className="upload-meta">Carregando historico...</p> : null}

      {!isLoading && !errorMessage && batches.length === 0 ? (
        <p className="upload-meta batch-history-empty">
          Nenhum lote enviado ainda. O historico vai aparecer aqui apos o
          primeiro upload.
        </p>
      ) : null}

      {batches.length > 0 ? (
        <ul className="batch-history-list">
          {batches.map((batch) => {
            const hasProgress = batch.status_count.processing > 0
            const progressPercent = getProgressPercent(batch)
            const createdAt = dateFormatter.format(new Date(batch.created_at))

            return (
              <li key={batch.id}>
                <Link to={`/batches/${batch.id}`} className="batch-history-item">
                  <div className="batch-history-main">
                    <div className="batch-history-title-row">
                      <h3>{batch.file_name}</h3>
                      <span className="batch-history-pill">
                        {getBatchStatusLabel(batch)}
                      </span>
                    </div>

                    <dl className="batch-history-meta-grid">
                      <div>
                        <dt>Data</dt>
                        <dd>{createdAt}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{batch.total_payments}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{getStatusDetail(batch)}</dd>
                      </div>
                    </dl>
                  </div>

                  {hasProgress ? (
                    <div className="batch-history-progress">
                      <div
                        className="batch-history-meter"
                        role="progressbar"
                        aria-label="Progresso compacto do lote"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPercent}
                      >
                        <div
                          className="batch-history-fill"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p>{progressPercent}% concluido</p>
                    </div>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
