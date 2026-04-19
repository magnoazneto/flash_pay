import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '@/store'
import type { AuthState, AuthResponse, User } from '../types'

const TOKEN_KEY = 'flashpay_token'
const USER_KEY = 'flashpay_user'

const isValidUser = (value: unknown): value is User => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const user = value as Record<string, unknown>

  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    (user.role === 'admin' || user.role === 'operator')
  )
}

const parseStoredUser = (storedUserRaw: string | null): User | null => {
  if (!storedUserRaw) {
    return null
  }

  try {
    const parsedUser: unknown = JSON.parse(storedUserRaw)
    return isValidUser(parsedUser) ? parsedUser : null
  } catch {
    return null
  }
}

const parseJwtExp = (token: string): number | null => {
  const [, payload] = token.split('.')

  if (!payload) {
    return null
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    )
    const decodedPayload = JSON.parse(atob(paddedPayload)) as { exp?: unknown }

    return typeof decodedPayload.exp === 'number' ? decodedPayload.exp : null
  } catch {
    return null
  }
}

const isTokenExpired = (token: string): boolean => {
  const exp = parseJwtExp(token)

  if (exp === null) {
    return true
  }

  return exp <= Math.floor(Date.now() / 1000)
}

const clearStoredCredentials = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

const hydrateAuthState = (): AuthState => {
  const storedToken = localStorage.getItem(TOKEN_KEY)
  const storedUser = parseStoredUser(localStorage.getItem(USER_KEY))

  if (!storedToken || isTokenExpired(storedToken) || !storedUser) {
    clearStoredCredentials()

    return {
      token: null,
      user: null,
      isAuthenticated: false,
    }
  }

  return {
    token: storedToken,
    user: storedUser,
    isAuthenticated: true,
  }
}

const initialState: AuthState = hydrateAuthState()

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
      clearStoredCredentials()
    },
  },
})

export const { setCredentials, logout } = authSlice.actions
export default authSlice.reducer

export const selectCurrentUser = (state: RootState) => state.auth.user
export const selectToken = (state: RootState) => state.auth.token
export const selectIsAuth = (state: RootState) => state.auth.isAuthenticated
export const selectIsAdmin = createSelector(
  [selectCurrentUser],
  (user) => user?.role === 'admin',
)
