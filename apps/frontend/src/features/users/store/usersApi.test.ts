// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/store/authSlice'
import batchDetailsReducer from '@/features/batches/store/batchDetailsSlice'
import type { AuthState, User } from '@/features/auth/types'
import { baseApi } from '@/store/baseApi'
import { usersApi } from './usersApi'

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

const adminUser: User = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@flashpay.test',
  role: 'admin',
}

const createTestStore = (authState: AuthState) =>
  configureStore({
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

afterEach(() => {
  vi.restoreAllMocks()
  localStorageMock.clear()
})

describe('usersApi', () => {
  it('lists admin users with auth headers attached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          users: [
            {
              id: 'user-1',
              name: 'Jane Doe',
              email: 'jane@flashpay.test',
              role: 'operator',
              created_at: '2026-04-20T10:00:00Z',
              updated_at: '2026-04-20T10:00:00Z',
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const store = createTestStore({
      token: 'token',
      user: adminUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      usersApi.endpoints.getUsers.initiate({ limit: 100, offset: 0 }),
    )

    expect(result.data).toMatchObject({
      total: 1,
      limit: 100,
      offset: 0,
      users: [
        {
          id: 'user-1',
          name: 'Jane Doe',
        },
      ],
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('GET')
    expect((request as Request).url).toContain('/admin/users?limit=100&offset=0')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
  })

  it('updates the user role with the auth token attached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    const store = createTestStore({
      token: 'token',
      user: adminUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      usersApi.endpoints.updateUserRole.initiate({
        id: 'user-1',
        role: 'operator',
      }),
    )

    expect(result.data).toEqual({
      message: 'ok',
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('PATCH')
    expect((request as Request).url).toContain('/admin/users/user-1/role')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
    expect(JSON.parse(await (request as Request).text())).toEqual({
      role: 'operator',
    })
  })

  it('deletes users with the auth token attached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    )

    const store = createTestStore({
      token: 'token',
      user: adminUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      usersApi.endpoints.deleteUser.initiate('user-1'),
    )

    expect(result.data).toBeNull()

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('DELETE')
    expect((request as Request).url).toContain('/admin/users/user-1')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
  })
})
