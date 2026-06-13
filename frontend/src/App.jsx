import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

const initialState = {
  loading: true,
  error: "",
  data: null
};

export default function App() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`);
        if (!response.ok) {
          throw new Error(`Health request failed with ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            data
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "Unknown error",
            data: null
          });
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Deployment Scaffold</p>
        <h1>Mail Account Manager</h1>
        <p className="summary">
          React static frontend served by Nginx, proxied API requests to the Node.js backend,
          and a PostgreSQL container for persistence.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Runtime Status</h2>
          {state.loading ? <p>Checking backend health...</p> : null}
          {state.error ? <p className="error">{state.error}</p> : null}
          {state.data ? (
            <dl className="status-list">
              <div>
                <dt>Backend</dt>
                <dd>{state.data.status}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>{state.data.database.ok ? "connected" : "unavailable"}</dd>
              </div>
              <div>
                <dt>Gmail OAuth</dt>
                <dd>{state.data.oauthProviders.gmailConfigured ? "configured" : "pending"}</dd>
              </div>
              <div>
                <dt>Microsoft OAuth</dt>
                <dd>{state.data.oauthProviders.microsoftConfigured ? "configured" : "pending"}</dd>
              </div>
            </dl>
          ) : null}
        </article>

        <article className="card">
          <h2>Security Baseline</h2>
          <ul>
            <li>Helmet headers enabled in the backend.</li>
            <li>CORS restricted by the `CORS_ORIGIN` allowlist.</li>
            <li>API throttling configured with `express-rate-limit`.</li>
            <li>Production TLS is terminated at the Nginx edge layer.</li>
          </ul>
        </article>

        <article className="card">
          <h2>Next Backend Tasks</h2>
          <ul>
            <li>Implement JWT auth and refresh token rotation.</li>
            <li>Add Gmail OAuth2 and Microsoft Graph flows.</li>
            <li>Create mailbox, account and message tables.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
