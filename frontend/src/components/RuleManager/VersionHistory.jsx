import { useEffect, useState } from 'react';
import {
  listDecisionDefinitions,
  getDecisionDefinitionXml,
  deployResource,
} from '../../api/camunda.js';

export function VersionHistory({
  decisionDefinitionId,
  currentKey,
  onSelectVersion,
  onRestored,
  refreshSignal,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restoringKey, setRestoringKey] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!status?.ok) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!decisionDefinitionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await listDecisionDefinitions({
          filter: { decisionDefinitionId },
          sort: [{ field: 'version', order: 'desc' }],
          page: { limit: 50 },
        });
        if (!cancelled) setVersions(result.items || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [decisionDefinitionId, refreshSignal]);

  async function handleRestore(version, e) {
    e.stopPropagation(); // don't also trigger row select
    setRestoringKey(version.decisionDefinitionKey);
    setStatus(null);
    setError(null);
    try {
      const xml = await getDecisionDefinitionXml(version.decisionDefinitionKey);
      const filename = `${version.decisionDefinitionId}.dmn`;
      const result = await deployResource({ filename, content: xml });
      const newVersion = result.deployments?.find((d) => d.decisionDefinition)?.decisionDefinition?.version;
      setStatus({ ok: true, message: `Restored v${version.version} as new v${newVersion ?? '?'}` });
      onRestored?.(decisionDefinitionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setRestoringKey(null);
    }
  }

  if (!decisionDefinitionId) return null;

  return (
    <div className="version-history">
      <h4>Version History — {decisionDefinitionId}</h4>
      <p className="muted small">Click a row to view that version. The latest is shown by default.</p>
      {loading && <div className="muted">Loading…</div>}
      {error && <div className="results__error"><pre>{error}</pre></div>}
      {status?.ok && <div className="deploy-status deploy-status--ok">{status.message}</div>}
      {versions.length > 0 && (
        <table className="version-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Definition Key</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, idx) => {
              const isActive = v.decisionDefinitionKey === currentKey;
              const isLatest = idx === 0;
              return (
                <tr
                  key={v.decisionDefinitionKey}
                  className={`version-row ${isActive ? 'version-row--active' : ''}`}
                  onClick={() => onSelectVersion?.(v)}
                >
                  <td>
                    <span className="badge badge--info">v{v.version}</span>
                    {isLatest && <span className="muted small"> · latest</span>}
                    {isActive && <span className="badge badge--ok small" style={{ marginLeft: 6 }}>viewing</span>}
                  </td>
                  <td className="mono small">{v.decisionDefinitionKey}</td>
                  <td>
                    {!isLatest && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => handleRestore(v, e)}
                        disabled={restoringKey === v.decisionDefinitionKey}
                      >
                        {restoringKey === v.decisionDefinitionKey ? 'Restoring…' : 'Restore as new version'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
