import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>Malformed lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">failures</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first time</th>
              <th scope="col">last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries >= 3 ? (
                    <span class="warn">{row.retries} · high retries</span>
                  ) : row.retries}
                </td>
                <td>
                  {row.failures > 0 ? (
                    <span class="warn">{row.failures} · failure recorded</span>
                  ) : row.failures}
                </td>
                <td>
                  {row.lastStatus === 'fail' ? (
                    <span class="warn">{row.lastStatus} · failed</span>
                  ) : row.lastStatus}
                </td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
