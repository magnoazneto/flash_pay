import { createSlice } from '@reduxjs/toolkit'

interface AuthState {
  token: string | null
  user: null
  isAuthenticated: boolean
}

const initialState: AuthState = {
  token: null,
  user: null,
  isAuthenticated: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
})

export default authSlice.reducer
