export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
}

export interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}
