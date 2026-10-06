/**
 * Placeholder shell. The real pages (Release Readiness, Scenario History, Runs, Harness)
 * are generated from ../V0_PROMPT.md and replace this file. The API routes under app/api
 * are the backend they call.
 */
export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Allocations QA Console — backend shell</h1>
      <p>Routes available:</p>
      <ul>
        <li><code>POST /api/trigger</code> — demo-key auth, cooldown + daily cap, dispatches the fixed workflow</li>
        <li><code>GET /api/runs/:ref</code> — correlated run status, read on demand</li>
      </ul>
      <p>Generate the UI with <code>V0_PROMPT.md</code> and drop it over this skeleton.</p>
    </main>
  );
}
