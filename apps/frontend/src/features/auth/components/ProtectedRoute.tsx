import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/store'
import { selectCurrentUser, selectIsAuth } from '@/features/auth/store/authSlice'
import type { User } from '@/features/auth/types'

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: User['role'][]
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const isAuthenticated = useAppSelector(selectIsAuth)
  const currentUser = useAppSelector(selectCurrentUser)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && (!currentUser || !allowedRoles.includes(currentUser.role))) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
