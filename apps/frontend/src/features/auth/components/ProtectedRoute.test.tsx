import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { baseApi } from '@/store/baseApi'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState, User } from '@/features/auth/types'
import ProtectedRoute from './ProtectedRoute'

afterEach(() => {
  cleanup()
  localStorage.clear()
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

const LoginStateProbe = () => {
  const location = useLocation()
  const from = location.state as { from?: { pathname?: string } } | null

  return <p>{from?.from?.pathname ?? 'no-from'}</p>
}

const renderProtectedRoute = ({
  authState,
  allowedRoles,
  initialEntry,
}: {
  authState: AuthState
  allowedRoles?: User['role'][]
  initialEntry: string
}) => {
  const store = configureStore({
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

  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route
            path="/private"
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <h1>Private content</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginStateProbe />} />
          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('preserves location in state.from when redirecting unauthenticated users', () => {
    renderProtectedRoute({
      initialEntry: '/private',
      authState: {
        token: null,
        user: null,
        isAuthenticated: false,
      },
    })

    expect(screen.getByText('/private')).toBeTruthy()
  })

  it('redirects authenticated users without role permission to dashboard', () => {
    renderProtectedRoute({
      initialEntry: '/private',
      allowedRoles: ['admin'],
      authState: {
        token: 'token',
        user: operatorUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Dashboard' }),
    ).toBeTruthy()
  })

  it('renders protected content when authenticated and authorized', () => {
    renderProtectedRoute({
      initialEntry: '/private',
      allowedRoles: ['admin'],
      authState: {
        token: 'token',
        user: adminUser,
        isAuthenticated: true,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Private content' }),
    ).toBeTruthy()
  })
})
