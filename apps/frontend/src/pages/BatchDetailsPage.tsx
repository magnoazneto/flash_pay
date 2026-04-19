import { useParams } from 'react-router-dom'

export default function BatchDetailsPage() {
  const { id } = useParams()

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <p className="eyebrow">Batches</p>
        <h1>Detalhes do lote</h1>
        <p className="lead">
          Stub inicial da rota protegida para visualizacao de lotes.
        </p>
      </section>

      <section className="status-card">
        <p className="section-kicker">Lote atual</p>
        <h2>{id ?? 'sem-id'}</h2>
      </section>
    </main>
  )
}
