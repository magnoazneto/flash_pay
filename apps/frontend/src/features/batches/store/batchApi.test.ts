// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/store/authSlice'
import batchDetailsReducer from '@/features/batches/store/batchDetailsSlice'
import type { AuthState, User } from '@/features/auth/types'
import { baseApi } from '@/store/baseApi'
import { batchApi } from './batchApi'

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

describe('batchApi', () => {
  it('posts the selected file as multipart form data to the upload endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          batch_id: 'batch-123',
          total_payments: 2,
          status: 'pending',
          created_at: '2026-04-20T10:00:00Z',
        }),
        {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const store = createTestStore({
      token: 'token',
      user: operatorUser,
      isAuthenticated: true,
    })

    const file = new File(['id,amount\n1,10.00'], 'payments.csv', {
      type: 'text/csv',
    })

    const result = await store.dispatch(batchApi.endpoints.uploadBatch.initiate(file))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.data).toEqual({
      batch_id: 'batch-123',
      total_payments: 2,
      status: 'pending',
      created_at: '2026-04-20T10:00:00Z',
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('POST')
    expect((request as Request).url).toContain('/batches/upload')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')

    const formData = await (request as Request).formData()
    const uploadedFile = formData.get('file')

    expect(uploadedFile).toBeInstanceOf(File)
    expect((uploadedFile as File).name).toBe('payments.csv')
  })

  it('fetches batch details with the auth token attached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'batch-123',
          file_name: 'payments.csv',
          total_payments: 2,
          user_id: 'operator-1',
          created_at: '2026-04-20T10:00:00Z',
          status_count: {
            pending: 2,
            processing: 0,
            success: 0,
            failed: 0,
          },
          payments: [],
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
      user: operatorUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      batchApi.endpoints.getBatchById.initiate('batch-123'),
    )

    expect(result.data).toMatchObject({
      id: 'batch-123',
      file_name: 'payments.csv',
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('GET')
    expect((request as Request).url).toContain('/batches/batch-123')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
  })

  it('lists batches with pagination and auth headers attached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          batches: [
            {
              id: 'batch-123',
              file_name: 'payments.csv',
              total_payments: 2,
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
          limit: 10,
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
      user: operatorUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      batchApi.endpoints.getBatches.initiate({ limit: 10, offset: 0 }),
    )

    expect(result.data).toMatchObject({
      total: 1,
      limit: 10,
      offset: 0,
      batches: [
        {
          id: 'batch-123',
          file_name: 'payments.csv',
        },
      ],
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('GET')
    expect((request as Request).url).toContain('/batches?limit=10&offset=0')
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
  })

  it('lists admin batches with an optional user filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          batches: [
            {
              id: 'batch-admin-1',
              file_name: 'payments-admin.csv',
              total_payments: 3,
              user_id: 'operator-1',
              created_at: '2026-04-20T11:00:00Z',
              status_count: {
                pending: 0,
                processing: 1,
                success: 2,
                failed: 0,
              },
            },
          ],
          total: 1,
          limit: 10,
          offset: 20,
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
      user: operatorUser,
      isAuthenticated: true,
    })

    const result = await store.dispatch(
      batchApi.endpoints.getAdminBatches.initiate({
        limit: 10,
        offset: 20,
        userId: 'operator-1',
      }),
    )

    expect(result.data).toMatchObject({
      total: 1,
      limit: 10,
      offset: 20,
      batches: [
        {
          id: 'batch-admin-1',
          file_name: 'payments-admin.csv',
          user_id: 'operator-1',
        },
      ],
    })

    const [request] = fetchMock.mock.calls[0] ?? []

    expect(request).toBeInstanceOf(Request)
    expect((request as Request).method).toBe('GET')
    expect((request as Request).url).toContain(
      '/admin/batches?limit=10&offset=20&user_id=operator-1',
    )
    expect((request as Request).headers.get('Authorization')).toBe('Bearer token')
  })
})
