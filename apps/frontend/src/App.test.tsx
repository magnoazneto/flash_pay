import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import batchDetailsReducer from '@/features/batches/store/batchDetailsSlice'
import { baseApi } from '@/store/baseApi'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState, User } from '@/features/auth/types'
import type { AdminUser } from '@/features/users/types'
import {
  useDeleteUserMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
} from '@/features/users/store/usersApi'

const {
  mockUseGetBatchesQuery,
  mockUseGetAdminBatchesQuery,
  mockUseGetBatchByIdQuery,
  mockUseUploadBatchMutation,
  mockUseGetUsersQuery,
  mockUseUpdateUserRoleMutation,
  mockUseDeleteUserMutation,
} = vi.hoisted(() => ({
  mockUseGetBatchesQuery: vi.fn(),
  mockUseGetAdminBatchesQuery: vi.fn(),
  mockUseGetBatchByIdQuery: vi.fn(),
  mockUseUploadBatchMutation: vi.fn(),
  mockUseGetUsersQuery: vi.fn(),
  mockUseUpdateUserRoleMutation: vi.fn(),
  mockUseDeleteUserMutation: vi.fn(),
}))

vi.mock('@/features/batches/hooks/useBatchStream', () => ({
  useBatchStream: vi.fn(),
}))

vi.mock('@/features/batches/store/batchApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/batches/store/batchApi')>()

  return {
    ...actual,
    useGetBatchesQuery: (...args: unknown[]) => mockUseGetBatchesQuery(...args),
    useGetAdminBatchesQuery: (...args: unknown[]) =>
      mockUseGetAdminBatchesQuery(...args),
    useGetBatchByIdQuery: (...args: unknown[]) => mockUseGetBatchByIdQuery(...args),
    useUploadBatchMutation: (...args: unknown[]) =>
      mockUseUploadBatchMutation(...args),
  }
})

vi.mock('@/features/users/store/usersApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/users/store/usersApi')>()

  return {
    ...actual,
    useGetUsersQuery: (...args: unknown[]) => mockUseGetUsersQuery(...args),
    useUpdateUserRoleMutation: (...args: unknown[]) =>
      mockUseUpdateUserRoleMutation(...args),
    useDeleteUserMutation: (...args: unknown[]) =>
      mockUseDeleteUserMutation(...args),
  }
})

beforeEach(() => {
  mockUseGetBatchesQuery.mockReturnValue({
    data: {
      batches: [],
      total: 0,
      limit: 10,
      offset: 0,
    },
    error: undefined,
    isLoading: false,
    isFetching: false,
  })
  mockUseGetAdminBatchesQuery.mockReturnValue({
    data: {
      batches: [
        {
          id: 'admin-batch-1',
          file_name: 'admin-payments.csv',
          total_payments: 2,
          user_id: 'admin-user-1',
          created_at: '2026-04-20T10:00:00Z',
          status_count: {
            pending: 1,
            processing: 1,
            success: 0,
            failed: 0,
          },
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    },
    error: undefined,
    isLoading: false,
    isFetching: false,
  })
  mockUseGetBatchByIdQuery.mockReturnValue({
    data: {
      id: 'batch-123',
      file_name: 'payments.csv',
      total_payments: 3,
      user_id: 'operator-1',
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
          status: 'processing',
          error_message: null,
          processed_at: null,
        },
        {
          id: 'payment-3',
          recipient: 'Carol',
          amount: '30.00',
          status: 'failed',
          error_message: 'Saldo insuficiente',
          processed_at: '2026-04-20T10:02:00Z',
        },
      ],
    },
    error: undefined,
    isLoading: false,
  })
  mockUseUploadBatchMutation.mockReturnValue([
    vi.fn(),
    {
      error: undefined,
      isLoading: false,
      reset: vi.fn(),
    },
  ])
  mockUseGetUsersQuery.mockReturnValue({
    data: {
      users: [
        {
          id: 'admin-1',
          name: 'Admin User',
          email: 'admin@flashpay.test',
          role: 'admin',
          created_at: '2026-04-20T10:00:00Z',
          updated_at: '2026-04-20T10:00:00Z',
        } satisfies AdminUser,
      ],
      total: 1,
      limit: 100,
      offset: 0,
    },
    error: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  })
  mockUseUpdateUserRoleMutation.mockReturnValue([
    vi.fn(),
    {
      isLoading: false,
      error: undefined,
      reset: vi.fn(),
    },
  ])
  mockUseDeleteUserMutation.mockReturnValue([
    vi.fn(),
    {
      isLoading: false,
      error: undefined,
      reset: vi.fn(),
    },
  ])
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const adminUser: User = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@flashpay.test',
  role: 'admin',
}

const operatorUser: User = {
  id: 'operator-1',
  name: 'Operator User',
  email: 'operator@flashpay.test',
  role: 'operator',
}

const renderApp = ({
  authState,
  initialEntry,
}: {
  authState: AuthState
  initialEntry: string
}) => {
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
      batchDetails: batchDetailsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    preloadedState: {
      auth: authState,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <App />
      </MemoryRouter>
    </Provider>,
  )
}

describe('App protected routes', () => {
  it('redirects unauthenticated users from dashboard to login', () => {
    renderApp({
      initialEntry: '/dashboard',
      authState: {
        token: null,
        user: null,
        isAuthenticated: false,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Entrar no FlashPay' }),
    ).toBeTruthy()
  })

  it('redirects authenticated users away from login', () => {
    renderApp({
      initialEntry: '/login',
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Painel autenticado' }),
    ).toBeTruthy()
  })

  it('allows authenticated operators to access the dashboard', () => {
    renderApp({
      initialEntry: '/dashboard',
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(screen.getByText('Operator User')).toBeTruthy()
    expect(
      screen.getByText(
        'Seu perfil atual nao pode acessar rotas administrativas.',
      ),
    ).toBeTruthy()
  })

  it('redirects unauthenticated users from admin route to login', () => {
    renderApp({
      initialEntry: '/admin',
      authState: {
        token: null,
        user: null,
        isAuthenticated: false,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Entrar no FlashPay' }),
    ).toBeTruthy()
  })

  it('redirects operators away from admin route to dashboard', () => {
    renderApp({
      initialEntry: '/admin',
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Painel autenticado' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: 'Painel administrativo' }),
    ).toBeNull()
  })

  it('allows admins to access admin route', () => {
    renderApp({
      initialEntry: '/admin',
      authState: {
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Painel administrativo' }),
    ).toBeTruthy()
    expect(screen.getByText('Admin User')).toBeTruthy()
  })

  it('protects batch details route for authenticated users', () => {
    renderApp({
      initialEntry: '/batches/batch-123',
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Detalhes do lote' }),
    ).toBeTruthy()
    expect(screen.getByText('batch-123')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Voltar ao dashboard' }),
    ).toBeTruthy()
  })

  it('allows admins to access admin child routes', () => {
    renderApp({
      initialEntry: '/admin/users',
      authState: {
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Gerenciamento de usuarios' }),
    ).toBeTruthy()
  })

  it('allows admins to access admin batch list', () => {
    renderApp({
      initialEntry: '/admin/batches',
      authState: {
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Lotes administrativos' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'admin-payments.csv' })).toBeTruthy()
  })

  it('protects admin batch route by role', () => {
    renderApp({
      initialEntry: '/admin/batches',
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Painel autenticado' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: 'Lotes administrativos' }),
    ).toBeNull()
  })

  it('allows admins to access admin batch details route', () => {
    renderApp({
      initialEntry: '/admin/batches/batch-123',
      authState: {
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Detalhes administrativos do lote' }),
    ).toBeTruthy()
    expect(screen.getByText('batch-123')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Voltar para lotes administrativos' }),
    ).toBeTruthy()
  })
})
