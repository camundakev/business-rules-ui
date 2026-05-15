// Selectable agent card. The whole card is the select button; an
// optional trash affordance in the header (rendered only when
// `onDelete` is provided) removes user-created agents — hardcoded
// demo agents don't pass `onDelete`.
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

export function AgentCard({ agent, selected, onSelect, onDelete }) {
  function handleDelete(e) {
    e.stopPropagation();
    if (!onDelete) return;
    const ok = window.confirm(
      `Remove sample agent "${agent.agentName}" (#${agent.agentCode})?`,
    );
    if (ok) onDelete();
  }

  return (
    <div className={`agent-card ${selected ? 'agent-card--selected' : ''}`}>
      <button
        type="button"
        className="agent-card__select"
        onClick={() => onSelect(agent)}
        aria-pressed={selected}
      >
        <div className="agent-card__header">
          <span className="agent-card__code">#{agent.agentCode}</span>
          <span className={`agent-card__status agent-card__status--${agent.agentStatus.replace(/\s/g, '-').toLowerCase()}`}>
            {agent.agentStatus}
          </span>
        </div>
        <div className="agent-card__name">{agent.agentName}</div>
        <dl className="agent-card__attrs">
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
      {onDelete && (
        <button
          type="button"
          className="agent-card__delete"
          onClick={handleDelete}
          aria-label={`Delete ${agent.agentName}`}
          title="Remove this agent"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
