import { useState } from 'react'
import type {
  BatchProgressState,
  BatchStreamState,
} from '@/features/batches/store/batchDetailsSlice'
import type {
  BatchDetail,
  BatchPayment,
  BatchPaymentStatus,
} from '@/features/batches/types'

type BatchProgressCardProps = {
  batchId: string
  detail: BatchDetail | null
  progress: BatchProgressState
  streamState: BatchStreamState
  isLoading?: boolean
  errorMessage?: string | null
  adminView?: boolean
}

const paymentStatusLabels: Record<BatchPaymentStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  success: 'Sucesso',
  failed: 'Falha',
}

const streamStatusLabels = {
  idle: 'Aguardando stream',
  connecting: 'Conectando',
  connected: 'Ao vivo',
  reconnecting: 'Reconectando',
  disconnected: 'Desconectado',
  completed: 'Concluido',
  error: 'Erro',
} as const

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`

const truncateErrorMessage = (value: string, maxLength = 72) => {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

export const buildFailedPaymentsCsv = (
  batchId: string,
  payments: BatchPayment[],
) => {
  const header = [
    'batch_id',
    'payment_id',
    'recipient',
    'amount',
    'status',
    'error_message',
    'processed_at',
  ].join(',')

  const rows = payments.map((payment) =>
    [
      batchId,
      payment.id,
      payment.recipient,
      payment.amount,
      payment.status,
      payment.error_message ?? '',
      payment.processed_at ?? '',
    ]
      .map(escapeCsvValue)
      .join(','),
  )

  return [header, ...rows].join('\n')
}

export default function BatchProgressCard({
  batchId,
  detail,
  progress,
  streamState,
  isLoading = false,
  errorMessage = null,
  adminView = false,
}: BatchProgressCardProps) {
  const [showOnlyFailedPayments, setShowOnlyFailedPayments] = useState(false)
  const statusCount = detail?.status_count
  const streamUpdatedAt = formatDateTime(streamState.lastEventAt)
  const payments = detail?.payments ?? []
  const failedPayments = payments.filter((payment) => payment.status === 'failed')
  const visiblePayments =
    adminView && showOnlyFailedPayments ? failedPayments : payments
  const hasFailedPayments = failedPayments.length > 0

  const handleExportFailedPayments = () => {
    if (!detail || failedPayments.length === 0) {
      return
    }

    const csv = buildFailedPaymentsCsv(batchId, failedPayments)
    const link = document.createElement('a')

    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
    link.download = `${batchId}-pagamentos-com-erro.csv`
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="status-card batch-progress-card" aria-label="Progresso do lote">
      <div className="card-header">
        <div>
          <p className="section-kicker">Lote atual</p>
          <h2>{batchId || 'sem-id'}</h2>
        </div>
        <div className="batch-stream-summary">
          <p className="auth-footer">
            Stream:{' '}
            <span className={`stream-pill stream-pill--${streamState.status}`}>
              {streamStatusLabels[streamState.status]}
            </span>
          </p>
          {streamUpdatedAt ? (
            <p className="batch-stream-meta">Atualizado em {streamUpdatedAt}</p>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p className="submit-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isLoading && !detail ? <p className="upload-meta">Carregando lote...</p> : null}

      {detail ? (
        <>
          <p className="upload-meta">
            <strong>Arquivo:</strong> {detail.file_name}
          </p>

          <div className="batch-progress-panel">
            <div className="batch-progress-header">
              <div>
                <p className="section-kicker">Progresso</p>
                <h3>{progress.percentComplete}% concluido</h3>
              </div>
              <p className="batch-progress-meta">
                {progress.completedPayments} de {progress.totalPayments} pagamentos
                processados
              </p>
            </div>

            <div
              className="batch-progress-meter"
              role="progressbar"
              aria-label="Progresso do lote"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percentComplete}
            >
              <div
                className="batch-progress-fill"
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
          </div>

          {adminView ? (
            <div className="batch-detail-tools" aria-label="Ferramentas administrativas">
              <label className="batch-detail-filter">
                <input
                  type="checkbox"
                  checked={showOnlyFailedPayments}
                  onChange={(event) =>
                    setShowOnlyFailedPayments(event.target.checked)
                  }
                  disabled={!hasFailedPayments}
                />
                <span>Mostrar apenas erros</span>
              </label>

              <button
                className="ghost-button"
                type="button"
                onClick={handleExportFailedPayments}
                disabled={!hasFailedPayments}
              >
                Exportar erros CSV
              </button>
            </div>
          ) : null}

          {streamState.lastError ? (
            <p className="upload-meta">{streamState.lastError}</p>
          ) : null}

          <dl className="batch-counter-grid">
            <div className="batch-counter-card">
              <dt>Total</dt>
              <dd>{detail.total_payments}</dd>
            </div>
            <div className="batch-counter-card">
              <dt>Pendente</dt>
              <dd>{statusCount?.pending ?? 0}</dd>
            </div>
            <div className="batch-counter-card">
              <dt>Processando</dt>
              <dd>{statusCount?.processing ?? 0}</dd>
            </div>
            <div className="batch-counter-card">
              <dt>Sucesso</dt>
              <dd>{statusCount?.success ?? 0}</dd>
            </div>
            <div className="batch-counter-card">
              <dt>Falha</dt>
              <dd>{statusCount?.failed ?? 0}</dd>
            </div>
          </dl>

          {adminView && showOnlyFailedPayments && visiblePayments.length === 0 ? (
            <p className="upload-meta batch-payment-empty">
              Nenhum pagamento com erro encontrado.
            </p>
          ) : null}

          {visiblePayments.length > 0 ? (
            <div className="preview-table-wrapper">
              <table className="preview-table batch-payment-table">
                <thead>
                  <tr>
                    <th>Pagamento</th>
                    <th>Recebedor</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => {
                    const isFailed = payment.status === 'failed'

                    return (
                      <tr
                        key={payment.id}
                        className={isFailed ? 'payment-row payment-row--failed' : 'payment-row'}
                      >
                        <td>{payment.id}</td>
                        <td>{payment.recipient}</td>
                        <td>{payment.amount}</td>
                        <td>
                          <span
                            className={`payment-status-badge payment-status-badge--${payment.status}`}
                          >
                            {paymentStatusLabels[payment.status]}
                          </span>
                        </td>
                        <td className={isFailed ? 'payment-error-cell' : ''}>
                          {adminView && isFailed && payment.error_message ? (
                            <details className="payment-error-details" open>
                              <summary title={payment.error_message}>
                                Erro: {truncateErrorMessage(payment.error_message)}
                              </summary>
                              <p>{payment.error_message}</p>
                            </details>
                          ) : (
                            payment.error_message ?? '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="upload-meta">Nenhum pagamento carregado para este lote.</p>
          )}
        </>
      ) : null}
    </section>
  )
}
