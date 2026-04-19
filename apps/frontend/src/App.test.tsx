import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { baseApi } from '@/store/baseApi'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState, User } from '@/features/auth/types'

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
})
