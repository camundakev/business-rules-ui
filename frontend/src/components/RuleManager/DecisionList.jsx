// Lists deployed decisions, grouping by decisionDefinitionId. Clicking a row
// selects that decision (the latest version) for editing. Versions are not
// shown here — see VersionHistory for that.

export function DecisionList({ decisions, selectedId, onSelect, loading, error, onRefresh }) {
  if (loading) return <div className="muted">Loading decisions…</div>;
  if (error) return <div className="results__error"><strong>Failed to load:</strong><pre>{error}</pre></div>;

  // Group by decisionDefinitionId, keeping only the latest version per id.
  const byId = new Map();
  for (const d of decisions) {
    const existing = byId.get(d.decisionDefinitionId);
    if (!existing || d.version > existing.version) byId.set(d.decisionDefinitionId, d);
  }
  const versionsById = new Map();
  for (const d of decisions) {
    versionsById.set(d.decisionDefinitionId, (versionsById.get(d.decisionDefinitionId) || 0) + 1);
  }
  const rows = Array.from(byId.values()).sort((a, b) =>
    a.decisionDefinitionId.localeCompare(b.decisionDefinitionId),
  );

  return (
    <div className="decision-list">
      <div className="decision-list__header">
        <span>Deployed Decisions</span>
        <button type="button" className="link-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>
      <ul className="decision-list__items">
        {rows.map((d) => (
          <li
            key={d.decisionDefinitionKey}
            className={`decision-list__item ${selectedId === d.decisionDefinitionId ? 'decision-list__item--selected' : ''}`}
          >
            <button type="button" className="decision-list__row" onClick={() => onSelect(d)}>
              <div className="decision-list__name">{d.name || d.decisionDefinitionId}</div>
              <div className="decision-list__meta">
                <span className="badge badge--info">v{d.version}</span>
                <span className="muted small">
                  {versionsById.get(d.decisionDefinitionId)} version{versionsById.get(d.decisionDefinitionId) > 1 ? 's' : ''}
                </span>
              </div>
              <div className="decision-list__id muted small">{d.decisionDefinitionId}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
