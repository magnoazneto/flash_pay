import { useEffect, useState } from "react";

type HealthResponse = {
  service: string;
  status: string;
  environment: string;
};

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`);

        if (!response.ok) {
          throw new Error(`Falha ao consultar API: ${response.status}`);
        }

        const data = (await response.json()) as HealthResponse;
        setHealth(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      }
    }

    void loadHealth();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">FlashPay</p>
        <h1>Monorepo inicial pronto para evolucao.</h1>
        <p className="lead">
          Base de desenvolvimento local com React, Go e PostgreSQL orquestrados
          por Docker Compose.
        </p>
      </section>

      <section className="status-card">
        <h2>Status da API</h2>
        {health ? (
          <dl>
            <div>
              <dt>Servico</dt>
              <dd>{health.service}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>Ambiente</dt>
              <dd>{health.environment}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd>{apiUrl}</dd>
            </div>
          </dl>
        ) : (
          <p>{error ?? "Consultando backend..."}</p>
        )}
      </section>
    </main>
  );
}
