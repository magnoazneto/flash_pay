import { Fragment, useEffect, useState } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { Link } from 'react-router-dom'
import { useGetAdminBatchesQuery } from '@/features/batches/store/batchApi'
import type {
  AdminBatchSummary,
  BatchStatusFilter,
} from '@/features/batches/types'
import { useGetUsersQuery } from '@/features/users/store/usersApi'
import type { UsersApiErrorResponse } from '@/features/users/types'

type BatchStatusOption = {
  value: BatchStatusFilter
  label: string
}

type GroupedBatches = Array<{
  userId: string
  userLabel: string
  userEmail: string | null
  batches: AdminBatchSummary[]
}>

const PAGE_SIZE = 10

const batchStatusOptions: BatchStatusOption[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Pendente' },
  { value: 'processing', label: 'Em processamento' },
  { value: 'completed', label: 'Concluido' },
  { value: 'failed', label: 'Falha total' },
  { value: 'completed_with_failures', label: 'Concluido com falhas' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const statusLabels: Record<Exclude<BatchStatusFilter, 'all'>, string> = {
  pending: 'Pendente',
  processing: 'Em processamento',
  completed: 'Concluido',
  failed: 'Falha total',
  completed_with_failures: 'Concluido com falhas',
}

const statusPillClassNames: Record<
  Exclude<BatchStatusFilter, 'all'>,
  string
> = {
  pending: 'payment-status-badge--pending',
  processing: 'payment-status-badge--processing',
  completed: 'payment-status-badge--success',
  failed: 'payment-status-badge--failed',
  completed_with_failures: 'payment-status-badge--failed',
}

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

  const apiError = fetchError.data as UsersApiErrorResponse & {
    error?: string
  }

  return apiError.error ?? apiError.message ?? fallback
}

const getBatchStatus = (batch: AdminBatchSummary): Exclude<
  BatchStatusFilter,
  'all'
> => {
  const { pending, processing, success, failed } = batch.status_count

  if (processing > 0) {
    return 'processing'
  }

  if (pending > 0 && success === 0 && failed === 0) {
    return 'pending'
  }

  if (success === batch.total_payments && batch.total_payments > 0) {
    return 'completed'
  }

  if (failed > 0 && success === 0) {
    return 'failed'
  }

  if (failed > 0) {
    return 'completed_with_failures'
  }

  return 'completed'
}

const getBatchStatusLabel = (batch: AdminBatchSummary) =>
  statusLabels[getBatchStatus(batch)]

const getUserDisplay = (
  batch: AdminBatchSummary,
  usersById: Map<string, { name: string; email: string }>,
) => {
  const user = usersById.get(batch.user_id)

  if (!user) {
    return {
      label: batch.user_id,
      email: 'Usuario nao encontrado na lista administrativa.',
    }
  }

  return {
    label: user.name,
    email: user.email,
  }
}

const getStatusSummary = (batch: AdminBatchSummary) => {
  const { pending, processing, success, failed } = batch.status_count

  return `Pendente ${pending} | Processando ${processing} | Sucesso ${success} | Falha ${failed}`
}

const groupBatchesByUser = (
  batches: AdminBatchSummary[],
  usersById: Map<string, { name: string; email: string }>,
) => {
  const groups = new Map<string, GroupedBatches[number]>()

  for (const batch of batches) {
    const user = usersById.get(batch.user_id)
    const userId = batch.user_id
    const userLabel = user?.name ?? batch.user_id
    const userEmail = user?.email ?? null
    const existing = groups.get(userId)

    if (existing) {
      existing.batches.push(batch)
      continue
    }

    groups.set(userId, {
      userId,
      userLabel,
      userEmail,
      batches: [batch],
    })
  }

  return Array.from(groups.values())
}

export default function AdminBatchesPage() {
  const [selectedUserId, setSelectedUserId] = useState('all')
  const [selectedStatus, setSelectedStatus] =
    useState<BatchStatusFilter>('all')
  const [page, setPage] = useState(1)

  const {
    data: usersData,
    error: usersError,
    isLoading: isUsersLoading,
  } = useGetUsersQuery(
    { limit: 100, offset: 0 },
    {
      refetchOnMountOrArgChange: 30,
    },
  )

  const {
    data: batchesData,
    error: batchesError,
    isLoading: isBatchesLoading,
    isFetching: isBatchesFetching,
  } = useGetAdminBatchesQuery(
    selectedUserId === 'all'
      ? { limit: 100, offset: 0 }
      : { limit: 100, offset: 0, userId: selectedUserId },
    {
      refetchOnMountOrArgChange: 30,
    },
  )

  const users = usersData?.users ?? []
  const batches = batchesData?.batches ?? []
  const usersById = new Map(users.map((user) => [user.id, user]))
  const pageSize = PAGE_SIZE

  const filteredBatches =
    selectedStatus === 'all'
      ? batches
      : batches.filter((batch) => getBatchStatus(batch) === selectedStatus)

  const pageCount = Math.max(1, Math.ceil(filteredBatches.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const startIndex = (safePage - 1) * pageSize
  const pageBatches = filteredBatches.slice(startIndex, startIndex + pageSize)
  const groupedBatches = groupBatchesByUser(pageBatches, usersById)
  const selectedUserLabel =
    selectedUserId === 'all'
      ? 'Todos os usuários'
      : usersById.get(selectedUserId)?.name ?? selectedUserId
  const selectedStatusLabel =
    selectedStatus === 'all' ? 'Todos os status' : statusLabels[selectedStatus]
  const visibleStart = filteredBatches.length === 0 ? 0 : startIndex + 1
  const visibleEnd = Math.min(startIndex + pageSize, filteredBatches.length)
  const totalAvailable = batchesData?.total ?? 0

  useEffect(() => {
    setPage(1)
  }, [selectedStatus, selectedUserId])

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount)
    }
  }, [page, pageCount])

  const handlePrevPage = () => {
    setPage((current) => Math.max(1, current - 1))
  }

  const handleNextPage = () => {
    setPage((current) => Math.min(pageCount, current + 1))
  }

  const hasFilters =
    selectedUserId !== 'all' || selectedStatus !== 'all' || page !== 1
  const showNoResults = !isBatchesLoading && filteredBatches.length === 0

  return (
    <main className="dashboard-shell admin-batches-shell">
      <section className="hero-panel">
        <p className="eyebrow">Administracao</p>
        <h1>Lotes administrativos</h1>
        <p className="lead">
          Liste os lotes administrativos, filtre por usuario ou status e
          acesse o detalhe de cada arquivo em uma unica tela.
        </p>

        <div className="admin-batches-summary">
          <p className="admin-batches-summary-value">
            {filteredBatches.length} lote{filteredBatches.length === 1 ? '' : 's'} visivel
          </p>
          <p className="admin-batches-summary-note">
            Filtro atual: {selectedUserLabel} | {selectedStatusLabel}
          </p>
        </div>
      </section>

      <section className="status-card admin-batches-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Lotes</p>
            <h2>Lista administrativa</h2>
          </div>
          <div className="admin-users-links">
            <Link to="/admin">Voltar ao painel</Link>
            <Link to="/admin/users">Usuarios</Link>
          </div>
        </div>

        {batchesError || usersError ? (
          <p className="submit-error" role="alert">
            {batchesError
              ? getApiErrorMessage(
                  batchesError,
                  'Nao foi possivel carregar os lotes administrativos.',
                )
              : 'Nao foi possivel carregar os usuarios administrativos.'}
          </p>
        ) : null}

        <div className="admin-batches-filters">
          <label className="field admin-batches-filter">
            <span>Usuario</span>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={isUsersLoading || users.length === 0}
            >
              <option value="all">Todos os usuarios</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {user.email}
                </option>
              ))}
            </select>
          </label>

          <label className="field admin-batches-filter">
            <span>Status do lote</span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value as BatchStatusFilter)
              }
            >
              {batchStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isUsersLoading || isBatchesLoading ? (
          <p className="upload-meta">Carregando lotes administrativos...</p>
        ) : null}

        {isBatchesFetching && batches.length > 0 ? (
          <p className="batch-history-refresh">Atualizando lotes...</p>
        ) : null}

        {!isBatchesLoading && !showNoResults && batches.length > 0 ? (
          <p className="admin-batches-overview">
            Exibindo {visibleStart}-{visibleEnd} de {filteredBatches.length}
            lotes carregados{totalAvailable > filteredBatches.length ? ` de ${totalAvailable}` : ''}
          </p>
        ) : null}

        {showNoResults ? (
          <p className="upload-meta admin-batches-empty">
            {hasFilters
              ? 'Nenhum lote corresponde aos filtros selecionados.'
              : 'Nenhum lote administrativo encontrado.'}
          </p>
        ) : null}

        {pageBatches.length > 0 ? (
          <div className="preview-table-wrapper admin-batches-table-wrapper">
            <table className="preview-table admin-batches-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Arquivo</th>
                  <th>Total de pagamentos</th>
                  <th>Sucesso</th>
                  <th>Falha</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {groupedBatches.map((group) => (
                  <Fragment key={group.userId}>
                    <tr className="admin-batches-group-row">
                      <th colSpan={6}>
                        <div className="admin-batches-group-heading">
                          <span className="admin-batches-group-label">
                            {group.userLabel}
                          </span>
                          {group.userEmail ? (
                            <span className="admin-batches-group-meta">
                              {group.userEmail}
                            </span>
                          ) : null}
                          <span className="admin-batches-group-count">
                            {group.batches.length} lote
                            {group.batches.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </th>
                    </tr>

                    {group.batches.map((batch) => {
                      const userDisplay = getUserDisplay(batch, usersById)
                      const status = getBatchStatus(batch)

                      return (
                        <tr key={batch.id}>
                          <td>
                            <div className="admin-batches-user-cell">
                              <strong>{userDisplay.label}</strong>
                              <span>{userDisplay.email}</span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-batches-file-cell">
                              <Link
                                to={`/admin/batches/${batch.id}`}
                                className="admin-batches-file-link"
                              >
                                {batch.file_name}
                              </Link>
                              <span
                                className={`payment-status-badge ${statusPillClassNames[status]}`}
                              >
                                {getBatchStatusLabel(batch)}
                              </span>
                              <span className="admin-batches-row-meta">
                                {getStatusSummary(batch)}
                              </span>
                            </div>
                          </td>
                          <td>{batch.total_payments}</td>
                          <td>{batch.status_count.success}</td>
                          <td>{batch.status_count.failed}</td>
                          <td>{dateFormatter.format(new Date(batch.created_at))}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {pageCount > 1 || filteredBatches.length > 0 ? (
          <div className="admin-batches-pagination" aria-label="Paginacao de lotes">
            <button
              className="ghost-button"
              type="button"
              onClick={handlePrevPage}
              disabled={safePage === 1 || filteredBatches.length === 0}
            >
              Anterior
            </button>
            <p className="admin-batches-pagination-label">
              Pagina {safePage} de {pageCount}
            </p>
            <button
              className="ghost-button"
              type="button"
              onClick={handleNextPage}
              disabled={safePage >= pageCount || filteredBatches.length === 0}
            >
              Proxima
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
