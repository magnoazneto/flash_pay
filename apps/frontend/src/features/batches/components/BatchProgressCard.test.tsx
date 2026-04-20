import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BatchProgressCard, { buildFailedPaymentsCsv } from './BatchProgressCard'
import type { BatchDetail } from '@/features/batches/types'
import type { BatchProgressState, BatchStreamState } from '@/features/batches/store/batchDetailsSlice'

afterEach(() => {
  cleanup()
})

const detail: BatchDetail = {
  id: 'batch-1',
  user_id: 'user-1',
  file_name: 'payments.csv',
  total_payments: 3,
  created_at: '2026-04-20T10:00:00Z',
  status_count: {
    pending: 1,
    processing: 1,
    success: 0,
    failed: 1,
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
      status: 'failed',
      error_message: 'Saldo insuficiente',
      processed_at: '2026-04-20T10:03:00Z',
    },
    {
      id: 'payment-3',
      recipient: 'Carol',
      amount: '30.00',
      status: 'processing',
      error_message: null,
      processed_at: null,
    },
  ],
}

const progress: BatchProgressState = {
  totalPayments: 3,
  completedPayments: 2,
  percentComplete: 67,
}

const streamState: BatchStreamState = {
  status: 'connected',
  retryCount: 0,
  lastEventAt: '2026-04-20T10:03:00Z',
  lastError: null,
}

describe('BatchProgressCard', () => {
  it('renders progress, counters and the payments table', () => {
    render(
      <BatchProgressCard
        batchId={detail.id}
        detail={detail}
        progress={progress}
        streamState={streamState}
      />,
    )

    expect(screen.getByRole('heading', { name: 'batch-1' })).toBeTruthy()
    expect(screen.getByText('67% concluido')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Progresso do lote' }).getAttribute('aria-valuenow')).toBe('67')
    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getAllByText('Falha').length).toBeGreaterThan(0)
    expect(screen.getByText('Saldo insuficiente')).toBeTruthy()
  })

  it('highlights failed payments with a visible error message', () => {
    render(
      <BatchProgressCard
        batchId={detail.id}
        detail={detail}
        progress={progress}
        streamState={streamState}
      />,
    )

    const failedPaymentRow = screen.getByText('payment-2').closest('tr')

    expect(failedPaymentRow?.className).toContain('payment-row--failed')
    expect(screen.getByText('Saldo insuficiente')).toBeTruthy()
  })

  it('shows loading and api error states when detail is unavailable', () => {
    render(
      <BatchProgressCard
        batchId={detail.id}
        detail={null}
        progress={progress}
        streamState={streamState}
        isLoading
        errorMessage="Nao foi possivel carregar o lote."
      />,
    )

    expect(screen.getByText('Carregando lote...')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Nao foi possivel carregar o lote.',
    )
  })

  it('filters failed payments and exports a csv in admin view', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <BatchProgressCard
        batchId={detail.id}
        detail={detail}
        progress={progress}
        streamState={streamState}
        adminView
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Mostrar apenas erros' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exportar erros CSV' })).toBeTruthy()
    expect(screen.getByText('Saldo insuficiente')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar apenas erros' }))

    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.queryByText('Carol')).toBeNull()
    expect(
      screen.queryByText('Nenhum pagamento com erro encontrado.'),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Exportar erros CSV' }))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('builds a csv export with the failed payments only', () => {
    const csv = buildFailedPaymentsCsv(detail.id, [detail.payments[1]])

    expect(csv).toContain('batch_id,payment_id,recipient,amount,status,error_message,processed_at')
    expect(csv).toContain('batch-1')
    expect(csv).toContain('payment-2')
    expect(csv).toContain('Saldo insuficiente')
  })
})
