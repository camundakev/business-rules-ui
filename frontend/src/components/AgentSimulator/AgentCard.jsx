export function AgentCard({ agent, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`agent-card ${selected ? 'agent-card--selected' : ''}`}
      onClick={() => onSelect(agent)}
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
  );
}
