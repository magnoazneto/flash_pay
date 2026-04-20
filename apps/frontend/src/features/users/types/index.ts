export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
  created_at: string
  updated_at: string
}

export interface UsersListQueryArgs {
  limit?: number
  offset?: number
}

export interface UsersListResponse {
  users: AdminUser[]
  total: number
  limit: number
  offset: number
}

export interface UpdateUserRoleRequest {
  id: string
  role: AdminUser['role']
}

export interface UsersApiErrorResponse {
  message?: string
}
