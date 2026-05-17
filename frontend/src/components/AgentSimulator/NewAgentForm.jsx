// Inline form for authoring a new sample agent. Identity fields
// (agentCode, agentName) are free text; everything else is rendered
// from the canonical ATTRIBUTE_SCHEMA so dropdowns and numeric inputs
// match exactly what the condition builder uses elsewhere. Saved
// agents are persisted to localStorage by the caller.
import { useState } from 'react';
import { ATTRIBUTE_SCHEMA } from '../../utils/attributeSchema.js';

function initialFieldValue(attr) {
  if (attr.inputControl === 'dropdown') return attr.values[0];
  // Numeric defaults: middle of range when bounded, else 0.
  if (attr.min !== undefined && attr.max !== undefined) {
    return String((attr.min + attr.max) / 2);
  }
  return '0';
}

function defaultAgentDraft() {
  const draft = { agentCode: '', agentName: '', agentEmail: '' };
  for (const attr of ATTRIBUTE_SCHEMA) {
    draft[attr.name] = initialFieldValue(attr);
  }
  return draft;
}

// Lightweight email shape check — accepts anything with a single @ and
// at least one dot in the domain. The actual delivery is handled by
// the BPMN's external email connector; we just want to catch obvious
// typos before the agent is saved.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function coerceForRuntime(draft) {
  // Convert numeric attributes to numbers so the Camunda DMN engine
  // sees the right typeRef. Strings pass through unchanged. Trim
  // identity fields.
  const out = {
    agentCode: draft.agentCode.trim(),
    agentName: draft.agentName.trim(),
    agentEmail: draft.agentEmail.trim(),
  };
  for (const attr of ATTRIBUTE_SCHEMA) {
    const raw = draft[attr.name];
    if (
      attr.dmnType === 'integer' ||
      attr.dmnType === 'double' ||
      attr.dmnType === 'number' ||
      attr.dmnType === 'long'
    ) {
      out[attr.name] = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
    } else {
      out[attr.name] = raw ?? '';
    }
  }
  return out;
}

function AttributeField({ attr, value, onChange, disabled }) {
  if (attr.inputControl === 'dropdown') {
    return (
      <select
        className="new-agent__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {attr.values.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="new-agent__input"
      type="number"
      step={attr.step ?? 'any'}
      min={attr.min}
      max={attr.max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

// Initialize a draft from an existing agent record. Numeric fields are
// stored as strings in the form state (the inputs are text-based) and
// coerceForRuntime turns them back into numbers on save.
function draftFromAgent(agent) {
  const draft = {
    agentCode: String(agent.agentCode ?? ''),
    agentName: String(agent.agentName ?? ''),
    agentEmail: String(agent.agentEmail ?? ''),
  };
  for (const attr of ATTRIBUTE_SCHEMA) {
    const raw = agent[attr.name];
    if (raw === null || raw === undefined) {
      draft[attr.name] = initialFieldValue(attr);
    } else {
      draft[attr.name] = String(raw);
    }
  }
  return draft;
}

// `initialAgent` puts the form in edit mode: pre-populates every field
// from the agent, freezes agentCode (the registry key — changing it
// would orphan the original record), and swaps the header / CTA copy.
export function NewAgentForm({ existingCodes, onSave, onCancel, initialAgent = null }) {
  const editing = initialAgent !== null;
  const [draft, setDraft] = useState(() =>
    initialAgent ? draftFromAgent(initialAgent) : defaultAgentDraft(),
  );

  function update(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  const trimmedCode = draft.agentCode.trim();
  const trimmedName = draft.agentName.trim();
  const trimmedEmail = draft.agentEmail.trim();
  // In edit mode the agentCode is locked, so the only conflict source
  // is the new-agent flow. Either way, an agent's own code shouldn't
  // count as a conflict against itself — callers exclude it from
  // existingCodes when constructing the form.
  const codeConflict =
    !editing && trimmedCode.length > 0 && existingCodes.includes(trimmedCode);
  const emailInvalid =
    trimmedEmail.length > 0 && !EMAIL_RE.test(trimmedEmail);
  const numericValid = ATTRIBUTE_SCHEMA.every((attr) => {
    if (attr.inputControl === 'dropdown') return true;
    const v = draft[attr.name];
    if (v === '' || v === null || v === undefined) return false;
    return !Number.isNaN(Number(v));
  });
  const canSave =
    trimmedCode.length > 0 &&
    trimmedName.length > 0 &&
    trimmedEmail.length > 0 &&
    !codeConflict &&
    !emailInvalid &&
    numericValid;

  function handleSave() {
    onSave(coerceForRuntime(draft));
  }

  return (
    <div className="new-agent">
      <div className="new-agent__header">
        <h3>{editing ? `Edit ${initialAgent.agentName || 'Sample Agent'}` : 'New Sample Agent'}</h3>
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="new-agent__section">
        <span className="new-program__label">Identity</span>
        <div className="new-agent__grid">
          <label className="new-agent__field">
            <span className="new-agent__field-label">
              Agent code
              {editing && <span className="muted small"> · locked</span>}
            </span>
            <input
              className={`new-agent__input ${codeConflict ? 'invalid' : ''}`}
              type="text"
              value={draft.agentCode}
              onChange={(e) => update('agentCode', e.target.value)}
              placeholder="e.g. 1006"
              autoFocus={!editing}
              readOnly={editing}
              disabled={editing}
              title={editing ? 'Agent code is the registry key and can’t be changed.' : undefined}
            />
            {codeConflict && (
              <span className="new-agent__field-error small">
                Agent code already in use — pick a different one.
              </span>
            )}
          </label>
          <label className="new-agent__field">
            <span className="new-agent__field-label">Agent name</span>
            <input
              className="new-agent__input"
              type="text"
              value={draft.agentName}
              onChange={(e) => update('agentName', e.target.value)}
              placeholder="e.g. Avery Smith"
            />
          </label>
          <label className="new-agent__field">
            <span className="new-agent__field-label">Agent email</span>
            <input
              className={`new-agent__input ${emailInvalid ? 'invalid' : ''}`}
              type="email"
              value={draft.agentEmail}
              onChange={(e) => update('agentEmail', e.target.value)}
              placeholder="e.g. agent@example.com"
              autoComplete="off"
            />
            {emailInvalid && (
              <span className="new-agent__field-error small">
                Doesn't look like a valid email address.
              </span>
            )}
          </label>
        </div>
      </div>

      <div className="new-agent__section">
        <span className="new-program__label">Attributes</span>
        <div className="new-agent__grid">
          {ATTRIBUTE_SCHEMA.map((attr) => (
            <label className="new-agent__field" key={attr.name}>
              <span className="new-agent__field-label">
                {attr.label}
                <span className="muted small"> · {attr.dmnType}</span>
              </span>
              <AttributeField
                attr={attr}
                value={draft[attr.name]}
                onChange={(v) => update(attr.name, v)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="new-program__actions">
        <button
          type="button"
          className="run-btn"
          onClick={handleSave}
          disabled={!canSave}
        >
          {editing ? 'Save Changes' : 'Save Agent'}
        </button>
      </div>
    </div>
  );
}

