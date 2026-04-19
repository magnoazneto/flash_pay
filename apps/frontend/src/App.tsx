import { Navigate, Route, Routes } from 'react-router-dom'
import GuestRoute from '@/features/auth/components/GuestRoute'
import ProtectedRoute from '@/features/auth/components/ProtectedRoute'
import AdminPage from '@/pages/AdminPage'
import AdminBatchesPage from '@/pages/AdminBatchesPage'
import AdminUsersPage from '@/pages/AdminUsersPage'
import BatchDetailsPage from '@/pages/BatchDetailsPage'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/batches/:id"
        element={
          <ProtectedRoute>
            <BatchDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/batches"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminBatchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
