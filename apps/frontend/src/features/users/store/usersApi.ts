import { baseApi } from '@/store/baseApi'
import type {
  UpdateUserRoleRequest,
  UsersListQueryArgs,
  UsersListResponse,
} from '../types'

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<UsersListResponse, UsersListQueryArgs | void>({
      query: (params) => ({
        url: '/admin/users',
        params: {
          limit: params?.limit ?? 100,
          offset: params?.offset ?? 0,
        },
      }),
    }),
    updateUserRole: builder.mutation<void, UpdateUserRoleRequest>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/users/${id}`,
        method: 'DELETE',
      }),
    }),
  }),
})

export const {
  useDeleteUserMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
} = usersApi
