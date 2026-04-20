import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState, User } from '@/features/auth/types'
import { baseApi } from '@/store/baseApi'
import AdminUsersPage from './AdminUsersPage'
import type { AdminUser } from '@/features/users/types'
import {
  useDeleteUserMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
} from '@/features/users/store/usersApi'

vi.mock('@/features/users/store/usersApi', () => ({
  useDeleteUserMutation: vi.fn(),
  useGetUsersQuery: vi.fn(),
  useUpdateUserRoleMutation: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockedUseGetUsersQuery = vi.mocked(useGetUsersQuery)
const mockedUseUpdateUserRoleMutation = vi.mocked(useUpdateUserRoleMutation)
const mockedUseDeleteUserMutation = vi.mocked(useDeleteUserMutation)

const adminUser: User = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@flashpay.test',
  role: 'admin',
}

const users: AdminUser[] = [
  {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@flashpay.test',
    role: 'admin',
    created_at: '2026-04-20T10:00:00Z',
    updated_at: '2026-04-20T10:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Operator User',
    email: 'operator@flashpay.test',
    role: 'operator',
    created_at: '2026-04-19T09:00:00Z',
    updated_at: '2026-04-19T09:00:00Z',
  },
]

const createTestStore = (authState: AuthState) =>
  configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    preloadedState: {
      auth: authState,
    },
  })

const renderPage = () =>
  render(
    <Provider
      store={createTestStore({
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      })}
    >
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AdminUsersPage />
      </MemoryRouter>
    </Provider>,
  )

const createMutationTrigger = () =>
  vi.fn(() => ({
    unwrap: () => Promise.resolve(undefined),
  }))

beforeEach(() => {
  mockedUseGetUsersQuery.mockReturnValue({
    data: {
      users,
      total: users.length,
      limit: 100,
      offset: 0,
    },
    error: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  } as ReturnType<typeof useGetUsersQuery>)

  mockedUseUpdateUserRoleMutation.mockReturnValue([
    createMutationTrigger(),
    {
      isLoading: false,
      error: undefined,
      reset: vi.fn(),
    },
  ] as unknown as ReturnType<typeof useUpdateUserRoleMutation>)

  mockedUseDeleteUserMutation.mockReturnValue([
    createMutationTrigger(),
    {
      isLoading: false,
      error: undefined,
      reset: vi.fn(),
    },
  ] as unknown as ReturnType<typeof useDeleteUserMutation>)
})

describe('AdminUsersPage', () => {
  it('renders the users table and blocks self actions', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Gerenciamento de usuarios' }),
    ).toBeTruthy()
    expect(screen.getByText('Admin User')).toBeTruthy()
    expect(screen.getByText('Operator User')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Remover Admin User' }).hasAttribute(
        'disabled',
      ),
    ).toBe(true)
    expect(
      screen.getByLabelText('Alterar role de Admin User').hasAttribute('disabled'),
    ).toBe(true)
  })

  it('updates the role inline and shows success feedback', async () => {
    const updateTrigger = createMutationTrigger()
    mockedUseUpdateUserRoleMutation.mockReturnValue([
      updateTrigger,
      {
        isLoading: false,
        error: undefined,
        reset: vi.fn(),
      },
    ] as unknown as ReturnType<typeof useUpdateUserRoleMutation>)

    renderPage()

    fireEvent.change(screen.getByLabelText('Alterar role de Operator User'), {
      target: {
        value: 'admin',
      },
    })

    await waitFor(() => {
      expect(updateTrigger).toHaveBeenCalledWith({
        id: 'user-2',
        role: 'admin',
      })
    })

    expect(
      await screen.findByText('Operator User agora esta como Admin.'),
    ).toBeTruthy()
    expect(
      (screen.getByLabelText('Alterar role de Operator User') as HTMLSelectElement)
        .value,
    ).toBe('admin')
  })

  it('opens a confirmation modal before removing a user', async () => {
    const deleteTrigger = createMutationTrigger()
    mockedUseDeleteUserMutation.mockReturnValue([
      deleteTrigger,
      {
        isLoading: false,
        error: undefined,
        reset: vi.fn(),
      },
    ] as unknown as ReturnType<typeof useDeleteUserMutation>)

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Remover Operator User' }))

    const dialog = screen.getByRole('dialog', { name: 'Remover usuario' })

    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Voce vai remover Operator User')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remocao' }))

    await waitFor(() => {
      expect(deleteTrigger).toHaveBeenCalledWith('user-2')
    })

    expect(
      await screen.findByText('Operator User foi removido com sucesso.'),
    ).toBeTruthy()
  })
})
