import { afterEach, describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '@/store/baseApi'
import authReducer, { selectIsAdmin } from './authSlice'
import type { AuthState, User } from '../types'

afterEach(() => {
  localStorage.clear()
  selectIsAdmin.resetRecomputations()
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

describe('selectIsAdmin', () => {
  it('returns true for admin users', () => {
    const store = createTestStore({
      token: 'token',
      user: adminUser,
      isAuthenticated: true,
    })

    expect(selectIsAdmin(store.getState())).toBe(true)
  })

  it('returns false for operator users', () => {
    const store = createTestStore({
      token: 'token',
      user: operatorUser,
      isAuthenticated: true,
    })

    expect(selectIsAdmin(store.getState())).toBe(false)
  })

  it('memoizes the derived result for repeated reads with the same user reference', () => {
    const memoizedAdminUser: User = {
      id: 'admin-memoized',
      name: 'Memoized Admin',
      email: 'memoized-admin@flashpay.test',
      role: 'admin',
    }

    const store = createTestStore({
      token: 'token',
      user: memoizedAdminUser,
      isAuthenticated: true,
    })

    expect(selectIsAdmin(store.getState())).toBe(true)
    expect(selectIsAdmin(store.getState())).toBe(true)
    expect(selectIsAdmin.recomputations()).toBe(1)
  })
})
