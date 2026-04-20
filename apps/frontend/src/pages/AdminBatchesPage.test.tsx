import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminBatchesPage from './AdminBatchesPage'

const mockUseGetAdminBatchesQuery = vi.fn()
const mockUseGetUsersQuery = vi.fn()

vi.mock('@/features/batches/store/batchApi', () => ({
  useGetAdminBatchesQuery: (...args: unknown[]) =>
    mockUseGetAdminBatchesQuery(...args),
}))

vi.mock('@/features/users/store/usersApi', () => ({
  useGetUsersQuery: (...args: unknown[]) => mockUseGetUsersQuery(...args),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const users = [
  {
    id: 'user-1',
    name: 'Ana Pereira',
    email: 'ana@flashpay.test',
    role: 'operator' as const,
    created_at: '2026-04-20T08:00:00Z',
    updated_at: '2026-04-20T08:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Bruno Costa',
    email: 'bruno@flashpay.test',
    role: 'operator' as const,
    created_at: '2026-04-20T08:30:00Z',
    updated_at: '2026-04-20T08:30:00Z',
  },
]

const allBatches = Array.from({ length: 12 }, (_, index) => {
  const batchNumber = index + 1
  const userId = batchNumber <= 8 ? 'user-1' : 'user-2'
  const isProcessing = batchNumber === 2 || batchNumber === 11
  const isFailed = batchNumber === 4 || batchNumber === 12

  return {
    id: `batch-${batchNumber}`,
    file_name: `lote-${batchNumber}.csv`,
    total_payments: 4,
    user_id: userId,
    created_at: `2026-04-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
    status_count: {
      pending: isProcessing || isFailed ? 0 : 4,
      processing: isProcessing ? 1 : 0,
      success: isFailed ? 3 : isProcessing ? 0 : 4,
      failed: isFailed ? 1 : 0,
    },
  }
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminBatchesPage />
    </MemoryRouter>,
  )

describe('AdminBatchesPage', () => {
  beforeEach(() => {
    mockUseGetUsersQuery.mockReset()
    mockUseGetAdminBatchesQuery.mockReset()

    mockUseGetUsersQuery.mockReturnValue({
      data: {
        users,
        total: users.length,
        limit: 100,
        offset: 0,
      },
      error: undefined,
      isLoading: false,
      isFetching: false,
    })

    mockUseGetAdminBatchesQuery.mockImplementation((args?: {
      userId?: string
    }) => {
      const filteredBatches = args?.userId
        ? allBatches.filter((batch) => batch.user_id === args.userId)
        : allBatches

      return {
        data: {
          batches: filteredBatches,
          total: filteredBatches.length,
          limit: 100,
          offset: 0,
        },
        error: undefined,
        isLoading: false,
        isFetching: false,
      }
    })
  })

  it('renders grouped batches with user labels and admin detail links', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Lotes administrativos' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'lote-1.csv' }).getAttribute('href'),
    ).toBe('/admin/batches/batch-1')
    expect(screen.getAllByText('Em processamento').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Concluido com falhas').length).toBeGreaterThan(0)
    expect(screen.getByText('Pagina 1 de 2')).toBeTruthy()
  })

  it('paginates the loaded batches and filters by user and status', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Proxima' }))

    expect(screen.getByText('Pagina 2 de 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-11.csv' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Usuario' }), {
      target: { value: 'user-2' },
    })

    expect(screen.getByText('Pagina 1 de 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-9.csv' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'lote-1.csv' })).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Status do lote' }), {
      target: { value: 'processing' },
    })

    expect(screen.getByText('Pagina 1 de 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-11.csv' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'lote-12.csv' })).toBeNull()
  })
})
