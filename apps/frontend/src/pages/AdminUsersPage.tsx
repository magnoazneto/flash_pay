import { useEffect, useState } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/store'
import { selectCurrentUser } from '@/features/auth/store/authSlice'
import {
  useDeleteUserMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
} from '@/features/users/store/usersApi'
import type {
  AdminUser,
  UsersApiErrorResponse,
} from '@/features/users/types'

type FeedbackState =
  | {
      kind: 'success'
      message: string
    }
  | {
      kind: 'error'
      message: string
    }
  | null

type PendingAction =
  | {
      type: 'role'
      userId: string
    }
  | {
      type: 'delete'
      userId: string
    }
  | null

const roleLabels: Record<AdminUser['role'], string> = {
  admin: 'Admin',
  operator: 'Operator',
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return fallback
  }

  const fetchError = error as FetchBaseQueryError

  if ('error' in fetchError && typeof fetchError.error === 'string') {
    return fetchError.error
  }

  if (!fetchError.data || typeof fetchError.data !== 'object') {
    return fallback
  }

  const apiError = fetchError.data as UsersApiErrorResponse
  return apiError.message ?? fallback
}

export default function AdminUsersPage() {
  const currentUser = useAppSelector(selectCurrentUser)
  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useGetUsersQuery(
    { limit: 100, offset: 0 },
    {
      refetchOnMountOrArgChange: 30,
    },
  )
  const [updateUserRole] = useUpdateUserRoleMutation()
  const [deleteUser] = useDeleteUserMutation()
  const [roleOverrides, setRoleOverrides] = useState<
    Record<string, AdminUser['role']>
  >({})
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminUser | null>(null)

  const users = data?.users ?? []
  const totalUsers = data?.total ?? 0
  const isBusy = pendingAction !== null

  useEffect(() => {
    setRoleOverrides((current) => {
      let changed = false
      const next = { ...current }

      for (const user of users) {
        if (next[user.id] === user.role) {
          delete next[user.id]
          changed = true
        }
      }

      for (const userId of Object.keys(next)) {
        if (!users.some((user) => user.id === userId)) {
          delete next[userId]
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [users])

  const handleRoleChange = async (
    user: AdminUser,
    nextRole: AdminUser['role'],
  ) => {
    if (isBusy) {
      return
    }

    setFeedback(null)
    setPendingAction({ type: 'role', userId: user.id })
    setRoleOverrides((current) => ({
      ...current,
      [user.id]: nextRole,
    }))

    try {
      await updateUserRole({
        id: user.id,
        role: nextRole,
      }).unwrap()
      await refetch()
      setFeedback({
        kind: 'success',
        message: `${user.name} agora esta como ${roleLabels[nextRole]}.`,
      })
    } catch (mutationError) {
      setRoleOverrides((current) => {
        const next = { ...current }
        delete next[user.id]
        return next
      })
      setFeedback({
        kind: 'error',
        message: getApiErrorMessage(
          mutationError,
          'Nao foi possivel atualizar a role do usuario.',
        ),
      })
    } finally {
      setPendingAction(null)
    }
  }

  const openDeleteDialog = (user: AdminUser) => {
    if (isBusy) {
      return
    }

    setFeedback(null)
    setDeleteCandidate(user)
  }

  const closeDeleteDialog = () => {
    if (pendingAction !== null) {
      return
    }

    setDeleteCandidate(null)
  }

  const handleDeleteUser = async () => {
    if (!deleteCandidate || isBusy) {
      return
    }

    setFeedback(null)
    setPendingAction({ type: 'delete', userId: deleteCandidate.id })

    try {
      await deleteUser(deleteCandidate.id).unwrap()
      setDeleteCandidate(null)
      setRoleOverrides((current) => {
        const next = { ...current }
        delete next[deleteCandidate.id]
        return next
      })
      await refetch()
      setFeedback({
        kind: 'success',
        message: `${deleteCandidate.name} foi removido com sucesso.`,
      })
    } catch (mutationError) {
      setFeedback({
        kind: 'error',
        message: getApiErrorMessage(
          mutationError,
          'Nao foi possivel remover o usuario.',
        ),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <main className="dashboard-shell admin-users-shell">
      <section className="hero-panel">
        <p className="eyebrow">Administracao</p>
        <h1>Gerenciamento de usuarios</h1>
        <p className="lead">
          Liste os usuarios administrativos, ajuste a role inline e remova
          contas sem sair desta tela.
        </p>

        <div className="admin-users-summary">
          <p className="admin-users-summary-value">
            {totalUsers} usuarios cadastrados
          </p>
          <p className="admin-users-summary-note">
            Sua propria conta fica bloqueada para alterar role ou remover.
          </p>
        </div>
      </section>

      <section className="status-card admin-users-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Usuarios</p>
            <h2>Lista administrativa</h2>
          </div>
          <div className="admin-users-links">
            <Link to="/admin">Voltar ao painel</Link>
            <Link to="/dashboard">Ir ao dashboard</Link>
          </div>
        </div>

        {feedback ? (
          <p
            className={
              feedback.kind === 'error'
                ? 'submit-error admin-users-feedback'
                : 'admin-users-feedback admin-users-feedback--success'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}

        {error ? (
          <p className="submit-error" role="alert">
            Nao foi possivel carregar os usuarios.
          </p>
        ) : null}

        {isLoading ? <p className="upload-meta">Carregando usuarios...</p> : null}

        {isFetching && users.length > 0 ? (
          <p className="batch-history-refresh">Atualizando usuarios...</p>
        ) : null}

        {!isLoading && users.length === 0 && !error ? (
          <p className="upload-meta">Nenhum usuario encontrado.</p>
        ) : null}

        {users.length > 0 ? (
          <div className="preview-table-wrapper admin-users-table-wrapper">
            <table className="preview-table admin-users-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Criado em</th>
                  <th>Atualizado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isCurrentUser = currentUser?.id === user.id
                  const isPendingRow = pendingAction?.userId === user.id
                  const displayedRole = roleOverrides[user.id] ?? user.role

                  return (
                    <tr
                      key={user.id}
                      className={
                        isCurrentUser
                          ? 'admin-users-row admin-users-row--self'
                          : 'admin-users-row'
                      }
                    >
                      <td>
                        <div className="admin-users-name-cell">
                          <strong>{user.name}</strong>
                          {isCurrentUser ? (
                            <span className="admin-users-pill">Conta atual</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <label className="sr-only" htmlFor={`role-${user.id}`}>
                          Alterar role de {user.name}
                        </label>
                        <select
                          id={`role-${user.id}`}
                          className="admin-users-role-select"
                          aria-label={`Alterar role de ${user.name}`}
                          value={displayedRole}
                          disabled={isCurrentUser || isBusy}
                          onChange={(event) =>
                            void handleRoleChange(
                              user,
                              event.target.value as AdminUser['role'],
                            )
                          }
                        >
                          <option value="admin">Admin</option>
                          <option value="operator">Operator</option>
                        </select>
                      </td>
                      <td>{formatDateTime(user.created_at)}</td>
                      <td>{formatDateTime(user.updated_at)}</td>
                      <td>
                        <div className="admin-users-actions">
                          <button
                            className="ghost-button admin-users-delete-button"
                            type="button"
                            aria-label={`Remover ${user.name}`}
                            onClick={() => openDeleteDialog(user)}
                            disabled={isCurrentUser || isBusy}
                          >
                            Remover
                          </button>
                          {isPendingRow ? (
                            <span className="admin-users-row-status">
                              {pendingAction?.type === 'role'
                                ? 'Atualizando role...'
                                : 'Removendo usuario...'}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {deleteCandidate ? (
        <div
          className="admin-users-modal-backdrop"
          role="presentation"
          onClick={closeDeleteDialog}
        >
          <div
            className="admin-users-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="section-kicker">Confirmacao</p>
            <h2 id="delete-user-title">Remover usuario</h2>
            <p className="lead compact-lead">
              Voce vai remover <strong>{deleteCandidate.name}</strong> (
              {deleteCandidate.email}).
              <br />
              Esta acao nao pode ser desfeita.
            </p>

            <div className="admin-users-modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={closeDeleteDialog}
                disabled={pendingAction?.type === 'delete'}
              >
                Cancelar
              </button>
              <button
                className="primary-button admin-users-confirm-button"
                type="button"
                onClick={() => void handleDeleteUser()}
                disabled={pendingAction?.type === 'delete'}
              >
                {pendingAction?.type === 'delete'
                  ? 'Removendo...'
                  : 'Confirmar remocao'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
