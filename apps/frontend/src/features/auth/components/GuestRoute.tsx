import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/store'
import { selectIsAuth } from '@/features/auth/store/authSlice'

type GuestRouteProps = {
  children: ReactNode
}

export default function GuestRoute({ children }: GuestRouteProps) {
  const isAuthenticated = useAppSelector(selectIsAuth)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
