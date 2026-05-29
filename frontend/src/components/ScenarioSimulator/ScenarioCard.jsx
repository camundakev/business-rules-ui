// Selectable scenario card. The whole card is the select button; an
// optional trash affordance in the header (rendered only when
// `onDelete` is provided) removes user-created scenarios — hardcoded
// demo scenarios don't pass `onDelete`.
function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function ScenarioCard({ agent, selected, onSelect, onDelete, onEdit }) {
  function handleDelete(e) {
    e.stopPropagation();
    if (!onDelete) return;
    const ok = window.confirm(
      `Remove scenario "${agent.agentName}" (#${agent.agentCode})?`,
    );
    if (ok) onDelete();
  }

  function handleEdit(e) {
    e.stopPropagation();
    if (!onEdit) return;
    onEdit();
  }

  return (
    <div className={`scenario-card ${selected ? 'scenario-card--selected' : ''}`}>
      <button
        type="button"
        className="scenario-card__select"
        onClick={() => onSelect(agent)}
        aria-pressed={selected}
      >
        <div className="scenario-card__header">
          <span className="scenario-card__code">#{agent.agentCode}</span>
          <span className={`scenario-card__status scenario-card__status--${agent.agentStatus.replace(/\s/g, '-').toLowerCase()}`}>
            {agent.agentStatus}
          </span>
        </div>
        <div className="scenario-card__name">{agent.agentName}</div>
        <dl className="scenario-card__attrs">
          <div><dt>Tenure</dt><dd>{agent.agentTenure}</dd></div>
          <div><dt>Compliance</dt><dd>{agent.complianceRating}</dd></div>
          <div><dt>Proactive</dt><dd>{agent.agentProactiveStatus}</dd></div>
          <div><dt>Council</dt><dd>{agent.councilStatus}</dd></div>
          <div><dt>License</dt><dd>{agent.licenseType}</dd></div>
          <div><dt>Attempt rate</dt><dd>{(agent.attemptRate * 100).toFixed(0)}%</dd></div>
          {agent.monthsBehindProactive && (
            <div><dt>Months behind</dt><dd>{agent.monthsBehindProactive}</dd></div>
          )}
        </dl>
      </button>
      {(onEdit || onDelete) && (
        <div className="scenario-card__actions">
          {onEdit && (
            <button
              type="button"
              className="scenario-card__action scenario-card__action--edit"
              onClick={handleEdit}
              aria-label={`Edit ${agent.agentName}`}
              title="Edit this scenario"
            >
              <PencilIcon />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="scenario-card__action scenario-card__action--delete"
              onClick={handleDelete}
              aria-label={`Delete ${agent.agentName}`}
              title="Remove this scenario"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
