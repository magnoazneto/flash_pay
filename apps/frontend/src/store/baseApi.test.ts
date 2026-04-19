// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from './baseApi'
import authReducer from '@/features/auth/store/authSlice'
import type { AuthState, User } from '@/features/auth/types'

const { localStorageMock } = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api')

  const store = new Map<string, string>()
  const mock = {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    get length() {
      return store.size
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  })

  return { localStorageMock: mock }
})

const operatorUser: User = {
  id: 'operator-1',
  name: 'Operator User',
  email: 'operator@flashpay.test',
  role: 'operator',
}

const testApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProtectedResource: builder.query<{ ok: boolean }, void>({
      query: () => ({
        url: '/protected',
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: false,
})

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

afterEach(() => {
  vi.restoreAllMocks()
  localStorageMock.clear()
})

describe('baseApi', () => {
  it('dispatches logout automatically when a request returns 401', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )

    const store = createTestStore({
      token: 'token',
      user: operatorUser,
      isAuthenticated: true,
    })

    await store.dispatch(testApi.endpoints.getProtectedResource.initiate())

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(store.getState().auth).toEqual({
      token: null,
      user: null,
      isAuthenticated: false,
    })
  })

  it('keeps the session intact for non-401 responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )

    const store = createTestStore({
      token: 'token',
      user: operatorUser,
      isAuthenticated: true,
    })

    await store.dispatch(testApi.endpoints.getProtectedResource.initiate())

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(store.getState().auth).toEqual({
      token: 'token',
      user: operatorUser,
      isAuthenticated: true,
    })
  })
})
