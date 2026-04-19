import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppSelector } from '@/hooks/store'
import { selectIsAuth } from '@/features/auth/store/authSlice'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'

function AuthOnly({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppSelector(selectIsAuth)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppSelector(selectIsAuth)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <AuthOnly>
            <HomePage />
          </AuthOnly>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
