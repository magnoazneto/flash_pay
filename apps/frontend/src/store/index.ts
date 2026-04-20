import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from './baseApi'
import authReducer from '@/features/auth/store/authSlice'
import batchDetailsReducer from '@/features/batches/store/batchDetailsSlice'

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
    batchDetails: batchDetailsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
