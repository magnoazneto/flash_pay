import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AuthState, AuthResponse } from '../types'

const TOKEN_KEY = 'flashpay_token'
const USER_KEY = 'flashpay_user'

const storedToken = localStorage.getItem(TOKEN_KEY)
const storedUserRaw = localStorage.getItem(USER_KEY)

let storedUser = null
try {
  storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null
} catch {
  storedUser = null
}

const initialState: AuthState = {
  token: storedToken,
  user: storedUser,
  isAuthenticated: !!storedToken,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<AuthResponse>) => {
      state.token = action.payload.token
      state.user = action.payload.user
      state.isAuthenticated = true
      localStorage.setItem(TOKEN_KEY, action.payload.token)
      localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user))
    },
    logout: (state) => {
      state.token = null
      state.user = null
      state.isAuthenticated = false
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    },
  },
})

export const { setCredentials, logout } = authSlice.actions
export default authSlice.reducer

export const selectCurrentUser = (state: { auth: AuthState }) => state.auth.user
export const selectToken = (state: { auth: AuthState }) => state.auth.token
export const selectIsAuth = (state: { auth: AuthState }) => state.auth.isAuthenticated
export const selectIsAdmin = (state: { auth: AuthState }) => state.auth.user?.role === 'admin'
