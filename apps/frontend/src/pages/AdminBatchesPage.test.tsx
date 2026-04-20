import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { BatchPaymentStatus } from '@/features/batches/types'
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
  let status: BatchPaymentStatus = 'pending'

  if (batchNumber === 2 || batchNumber === 11) {
    status = 'processing'
  } else if (batchNumber === 4 || batchNumber === 12) {
    status = 'failed'
  } else if (batchNumber >= 5) {
    status = 'success'
  }

  return {
    id: `batch-${batchNumber}`,
    file_name: `lote-${batchNumber}.csv`,
    total_payments: 4,
    user_id: userId,
    status,
    created_at: `2026-04-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
    status_count: {
      pending: status === 'pending' ? 4 : 0,
      processing: status === 'processing' ? 1 : 0,
      success: status === 'success' ? 4 : 0,
      failed: status === 'failed' ? 1 : 0,
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
      limit?: number
      offset?: number
      userId?: string
      status?: BatchPaymentStatus
    }) => {
      const filteredByUser = args?.userId
        ? allBatches.filter((batch) => batch.user_id === args.userId)
        : allBatches
      const filteredBatches = args?.status
        ? filteredByUser.filter((batch) => batch.status === args.status)
        : filteredByUser
      const limit = args?.limit ?? 10
      const offset = args?.offset ?? 0

      return {
        data: {
          batches: filteredBatches.slice(offset, offset + limit),
          total: filteredBatches.length,
          limit,
          offset,
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
    expect(screen.getAllByText('Concluido').length).toBeGreaterThan(0)
    expect(screen.getByText('Pagina 1 de 2')).toBeTruthy()
    expect(mockUseGetAdminBatchesQuery).toHaveBeenCalledWith(
      { limit: 10, offset: 0 },
      { refetchOnMountOrArgChange: 30 },
    )
  })

  it('paginates via api and applies server-side user and status filters', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Proxima' }))

    expect(mockUseGetAdminBatchesQuery).toHaveBeenLastCalledWith(
      { limit: 10, offset: 10 },
      { refetchOnMountOrArgChange: 30 },
    )
    expect(screen.getByText('Pagina 2 de 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-11.csv' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Usuario' }), {
      target: { value: 'user-2' },
    })

    expect(mockUseGetAdminBatchesQuery).toHaveBeenLastCalledWith(
      { limit: 10, offset: 0, userId: 'user-2' },
      { refetchOnMountOrArgChange: 30 },
    )
    expect(screen.getByText('Pagina 1 de 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-9.csv' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'lote-1.csv' })).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Status do lote' }), {
      target: { value: 'processing' },
    })

    expect(mockUseGetAdminBatchesQuery).toHaveBeenLastCalledWith(
      { limit: 10, offset: 0, userId: 'user-2', status: 'processing' },
      { refetchOnMountOrArgChange: 30 },
    )
    expect(screen.getByText('Pagina 1 de 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'lote-11.csv' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'lote-12.csv' })).toBeNull()
  })
})
