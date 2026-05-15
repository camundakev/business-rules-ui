// Lead Program-grouped sidebar. Each program is an expandable row.
// Expanding reveals its three DMN tables (eligibility / recommendation /
// unenrollment) as nested children — clicking a child selects that
// decision for view/edit in the main panel.
//
// The "Default Lead Program" can be expanded and its DMNs edited, but
// the program itself is not deletable (the BPMN's hardcoded fallback
// agents depend on those decision IDs existing).
import { useState } from 'react';
import { isDefaultProgram } from '../../utils/programRegistry.js';

// Inline SVG trash can — colours follow currentColor so the icon picks
// up the button's hover / disabled state. Stroke-based outline reads
// well at small sizes.
function TrashIcon() {
  return (
    <svg
      className="program-list__delete-icon"
      width="16"
      height="16"
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

const ROLE_LABELS = {
  eligibilityId: 'Eligibility',
  recommendationId: 'Recommendations',
  unenrollmentId: 'Unenrollment',
};

// One row per role inside a program. Renders the friendly label, the
// raw decisionDefinitionId for traceability, and a small version badge.
function DecisionChildRow({ label, decisionId, decision, selected, onSelect }) {
  return (
    <li
      className={`program-list__child ${selected ? 'program-list__child--selected' : ''} ${
        decision ? '' : 'program-list__child--missing'
      }`}
    >
      <button
        type="button"
        className="program-list__child-row"
        onClick={() => decision && onSelect(decision)}
        disabled={!decision}
        title={decision ? '' : 'DMN not yet visible from the cluster — try refreshing'}
      >
        <span className="program-list__child-label">{label}</span>
        <span className="program-list__child-id">{decisionId}</span>
        {decision && <span className="badge badge--info small">v{decision.version}</span>}
      </button>
    </li>
  );
}

function ProgramRow({
  program,
  decisionsByDefinitionId,
  versionsByDefinitionId,
  expanded,
  onToggle,
  selectedDecisionKey,
  onSelectDecision,
  onDeleteProgram,
  deleting,
}) {
  const isDefault = isDefaultProgram(program);
  const eligDec = decisionsByDefinitionId.get(program.eligibilityId);
  const recDec = decisionsByDefinitionId.get(program.recommendationId);
  const unDec = decisionsByDefinitionId.get(program.unenrollmentId);

  function totalVersions() {
    return (
      (versionsByDefinitionId.get(program.eligibilityId) ?? 0) +
      (versionsByDefinitionId.get(program.recommendationId) ?? 0) +
      (versionsByDefinitionId.get(program.unenrollmentId) ?? 0)
    );
  }

  return (
    <li className="program-list__program">
      <div className="program-list__program-row">
        <button
          type="button"
          className="program-list__expander"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${program.displayName}`}
        >
          <span className={`program-list__caret ${expanded ? 'program-list__caret--open' : ''}`} aria-hidden="true">▶</span>
          <span className="program-list__program-name">{program.displayName}</span>
          <span className="muted small">{totalVersions()} rule version{totalVersions() === 1 ? '' : 's'}</span>
        </button>
        <button
          type="button"
          className="program-list__delete"
          onClick={() => onDeleteProgram(program)}
          disabled={isDefault || deleting}
          aria-label={`Delete ${program.displayName}`}
          title={
            isDefault
              ? "Default Lead Program can't be deleted — it backs the hardcoded demo agents"
              : 'Delete this program and all its DMN tables from Camunda'
          }
        >
          <TrashIcon />
        </button>
      </div>
      {expanded && (
        <ul className="program-list__children">
          <DecisionChildRow
            label={ROLE_LABELS.eligibilityId}
            decisionId={program.eligibilityId}
            decision={eligDec}
            selected={eligDec?.decisionDefinitionKey === selectedDecisionKey}
            onSelect={onSelectDecision}
          />
          <DecisionChildRow
            label={ROLE_LABELS.recommendationId}
            decisionId={program.recommendationId}
            decision={recDec}
            selected={recDec?.decisionDefinitionKey === selectedDecisionKey}
            onSelect={onSelectDecision}
          />
          <DecisionChildRow
            label={ROLE_LABELS.unenrollmentId}
            decisionId={program.unenrollmentId}
            decision={unDec}
            selected={unDec?.decisionDefinitionKey === selectedDecisionKey}
            onSelect={onSelectDecision}
          />
        </ul>
      )}
    </li>
  );
}

export function ProgramList({
  programs,
  decisions,
  selectedDecisionKey,
  selectedProgramName,
  onSelectDecision,
  onDeleteProgram,
  onRefresh,
  loading,
  error,
  deletingProgramName,
}) {
  // Default expansion: the program containing the currently selected
  // decision. Track which one is open at most.
  const [expandedName, setExpandedName] = useState(() => selectedProgramName ?? null);

  // Reduce the flat decision list to {id → latest version} for fast lookup,
  // plus a parallel map of {id → version count} for the badge.
  const latestById = new Map();
  const versionsById = new Map();
  for (const d of decisions) {
    versionsById.set(d.decisionDefinitionId, (versionsById.get(d.decisionDefinitionId) ?? 0) + 1);
    const prior = latestById.get(d.decisionDefinitionId);
    if (!prior || d.version > prior.version) {
      latestById.set(d.decisionDefinitionId, d);
    }
  }

  function toggleExpanded(name) {
    setExpandedName((current) => (current === name ? null : name));
  }

  return (
    <div className="program-list">
      <div className="program-list__header">
        <span>Lead Programs</span>
        <button type="button" className="link-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>
      {loading && <div className="muted small">Loading…</div>}
      {error && (
        <div className="results__error">
          <strong>Failed to load:</strong>
          <pre>{error}</pre>
        </div>
      )}
      <ul className="program-list__items">
        {programs.map((program) => (
          <ProgramRow
            key={program.displayName}
            program={program}
            decisionsByDefinitionId={latestById}
            versionsByDefinitionId={versionsById}
            expanded={expandedName === program.displayName}
            onToggle={() => toggleExpanded(program.displayName)}
            selectedDecisionKey={selectedDecisionKey}
            onSelectDecision={onSelectDecision}
            onDeleteProgram={onDeleteProgram}
            deleting={deletingProgramName === program.displayName}
          />
        ))}
      </ul>
    </div>
  );
}
