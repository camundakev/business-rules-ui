function AuditResult({ raw }) {
  if (!raw) return <span className="muted small">—</span>;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return <code className="audit__result">{raw}</code>;
  }
  // Result might be a single object (FIRST policy) or an array of objects (COLLECT policy).
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0) return <span className="muted small">no match</span>;
  return (
    <div className="audit-result-list">
      {items.map((obj, i) => (
        <div key={i} className="audit-result-item">
          {Object.entries(obj || {}).map(([k, v]) => (
            <span key={k} className="kv">
              <span className="kv__key">{k}</span>
              <span className="kv__val">{formatVal(v)}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatVal(v) {
  if (v === null) return '—';
  if (v === '') return '""';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ResultsPanel({ result, decisionAudit, error, running }) {
  if (running) {
    return (
      <section className="results">
        <div className="results__loading">
          <span className="spinner" aria-hidden="true" />
          <span>Evaluating…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="results">
        <div className="results__error">
          <strong>Evaluation failed</strong>
          <pre>{error}</pre>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="results results--empty">
        <p className="muted">
          Pick an agent, choose a Lead Program, then <strong>Run Evaluation</strong> to start a
          process instance against the live Camunda cluster. The outcome and decision audit will appear here.
        </p>
      </section>
    );
  }

  const { variables = {} } = result;
  const { eligibilityResult, recommendations, unenrollmentResult, agentStatus, unenrolledAt } = variables;

  const isEligible = eligibilityResult?.isEligible === true;
  const recArray = Array.isArray(recommendations) ? recommendations : (recommendations ? [recommendations] : []);

  return (
    <section className="results">
      <header className="results__header">
        <h3>Evaluation Result</h3>
        <span className="results__pi-key" title={result.processInstanceKey}>
          PI #…{String(result.processInstanceKey).slice(-6)}
        </span>
      </header>

      <div className="results__grid">
        <div className="result-card">
          <div className="result-card__title">Eligibility</div>
          {eligibilityResult ? (
            <span className={`badge ${isEligible ? 'badge--ok' : 'badge--bad'}`}>
              {isEligible ? '✓ Eligible' : '✗ Ineligible'}
            </span>
          ) : (
            <span className="badge badge--neutral">Not evaluated</span>
          )}
          {eligibilityResult?.ineligibilityReason && (
            <p className="result-card__reason">{eligibilityResult.ineligibilityReason}</p>
          )}
        </div>

        {isEligible && (
          <div className="result-card">
            <div className="result-card__title">Recommendations ({recArray.length})</div>
            {recArray.length === 0 && <p className="result-card__empty">No recommendations triggered.</p>}
            <ul className="recommendations">
              {recArray.map((r, i) => (
                <li key={i} className={`recommendation recommendation--${r.recommendationType || 'general'}`}>
                  <div className="recommendation__type">{r.recommendationType}</div>
                  <div className="recommendation__text">{r.recommendationText}</div>
                  {r.recommendationLink && (
                    <a className="recommendation__link" href={r.recommendationLink}>
                      {r.recommendationLink}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isEligible && unenrollmentResult && (
          <div className="result-card">
            <div className="result-card__title">Unenrollment</div>
            <span className={`badge ${unenrollmentResult.shouldUnenroll ? 'badge--bad' : 'badge--neutral'}`}>
              {unenrollmentResult.shouldUnenroll
                ? `Unenrolling (${unenrollmentResult.unenrollmentType})`
                : 'Hold for review'}
            </span>
            {unenrollmentResult.unenrollmentReason && (
              <p className="result-card__reason">{unenrollmentResult.unenrollmentReason}</p>
            )}
          </div>
        )}

        <div className="result-card">
          <div className="result-card__title">Final Agent Status</div>
          <span className="badge badge--info">{agentStatus || 'unchanged'}</span>
          {unenrolledAt && (
            <p className="result-card__reason">Unenrolled at {new Date(unenrolledAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      {decisionAudit && decisionAudit.length > 0 && (
        <div className="audit">
          <h4>Decision Audit</h4>
          <table>
            <thead>
              <tr>
                <th>Decision</th>
                <th>Version</th>
                <th>Evaluated</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {decisionAudit.map((d) => (
                <tr key={d.decisionEvaluationInstanceKey}>
                  <td>{d.decisionDefinitionName || d.decisionDefinitionId}</td>
                  <td><span className="badge badge--info small">v{d.decisionDefinitionVersion}</span></td>
                  <td className="muted small">{new Date(d.evaluationDate).toLocaleTimeString()}</td>
                  <td><AuditResult raw={d.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
