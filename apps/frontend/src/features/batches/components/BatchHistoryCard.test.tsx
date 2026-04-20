import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BatchHistoryCard from './BatchHistoryCard'
import type { BatchSummary } from '@/features/batches/types'

afterEach(() => {
  cleanup()
})

const batches: BatchSummary[] = [
  {
    id: 'batch-1',
    file_name: 'payments-january.csv',
    total_payments: 4,
    created_at: '2026-04-20T10:00:00Z',
    status_count: {
      pending: 1,
      processing: 1,
      success: 1,
      failed: 1,
    },
  },
  {
    id: 'batch-2',
    file_name: 'payments-february.csv',
    total_payments: 2,
    created_at: '2026-04-19T10:00:00Z',
    status_count: {
      pending: 0,
      processing: 0,
      success: 2,
      failed: 0,
    },
  },
]

const formattedBatchDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date('2026-04-20T10:00:00Z'))

describe('BatchHistoryCard', () => {
  it('renders batch history with link targets, summaries and compact progress', () => {
    render(
      <MemoryRouter>
        <BatchHistoryCard batches={batches} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Lotes recentes' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /payments-january\.csv/i }).getAttribute('href'),
    ).toBe('/batches/batch-1')
    expect(screen.getByText(formattedBatchDate)).toBeTruthy()
    expect(screen.getByText('Em processamento')).toBeTruthy()
    expect(screen.getByText('50% concluido')).toBeTruthy()
    expect(screen.getByText('2/4 processados')).toBeTruthy()
    expect(screen.getByText('Concluido')).toBeTruthy()
    expect(screen.getByText('2/2 processados')).toBeTruthy()
  })

  it('shows the empty state when there are no batches', () => {
    render(
      <MemoryRouter>
        <BatchHistoryCard batches={[]} />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(
        'Nenhum lote enviado ainda. O historico vai aparecer aqui apos o primeiro upload.',
      ),
    ).toBeTruthy()
  })
})
