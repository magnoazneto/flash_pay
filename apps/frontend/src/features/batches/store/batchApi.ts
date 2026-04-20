import { baseApi } from '@/store/baseApi'
import type {
  BatchDetail,
  BatchListQueryArgs,
  BatchListResponse,
  AdminBatchListResponse,
  UploadBatchResponse,
} from '../types'

export const batchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadBatch: builder.mutation<UploadBatchResponse, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('file', file)

        return {
          url: '/batches/upload',
          method: 'POST',
          body: formData,
        }
      },
    }),
    getBatches: builder.query<BatchListResponse, BatchListQueryArgs | void>({
      query: (params) => ({
        url: '/batches',
        params: {
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
        },
      }),
    }),
    getAdminBatches: builder.query<
      AdminBatchListResponse,
      BatchListQueryArgs | void
    >({
      query: (params) => ({
        url: '/admin/batches',
        params: {
          limit: params?.limit ?? 100,
          offset: params?.offset ?? 0,
          ...(params?.userId ? { user_id: params.userId } : {}),
          ...(params?.status ? { status: params.status } : {}),
        },
      }),
    }),
    getBatchById: builder.query<BatchDetail, string>({
      query: (batchId) => `/batches/${batchId}`,
    }),
  }),
})

export const {
  useGetAdminBatchesQuery,
  useGetBatchesQuery,
  useGetBatchByIdQuery,
  useUploadBatchMutation,
} = batchApi
