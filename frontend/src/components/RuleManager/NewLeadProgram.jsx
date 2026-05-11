import { Fragment, useState } from 'react';
import {
  ATTRIBUTES,
  OPERATORS,
  OUTPUT_TYPES,
  VARIABLE_NAME_RE,
  generateDmnXml,
  slugify,
} from '../../utils/generateDmn.js';
import { deployResource } from '../../api/camunda.js';

function newEmptyCondition() {
  return { attribute: ATTRIBUTES[0].name, operator: '=', value: '' };
}

function newEmptyRule() {
  return { conditions: [newEmptyCondition()], outputValues: {} };
}

let outputIdCounter = 0;
function nextOutputId() {
  outputIdCounter += 1;
  return `o${outputIdCounter}`;
}

export function NewLeadProgram({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [outputs, setOutputs] = useState(() => [
    { id: nextOutputId(), name: 'isEligible', type: 'boolean' },
  ]);
  const [rules, setRules] = useState([newEmptyRule()]);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  // ── outputs ────────────────────────────────────────────────────────────
  function addOutput() {
    setOutputs((os) => [...os, { id: nextOutputId(), name: '', type: 'string' }]);
  }

  function updateOutput(id, patch) {
    setOutputs((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOutput(id) {
    setOutputs((os) => (os.length === 1 ? os : os.filter((o) => o.id !== id)));
    // drop any per-rule value tied to this output
    setRules((rs) =>
      rs.map((r) => {
        if (!r.outputValues || !(id in r.outputValues)) return r;
        const { [id]: _drop, ...rest } = r.outputValues;
        return { ...r, outputValues: rest };
      }),
    );
  }

  // ── rule conditions ────────────────────────────────────────────────────
  function updateCondition(ruleIdx, condIdx, patch) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? {
              ...r,
              conditions: r.conditions.map((c, ci) =>
                ci === condIdx ? { ...c, ...patch } : c,
              ),
            }
          : r,
      ),
    );
  }

  function addCondition(ruleIdx) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx ? { ...r, conditions: [...r.conditions, newEmptyCondition()] } : r,
      ),
    );
  }

  function removeCondition(ruleIdx, condIdx) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? {
              ...r,
              conditions:
                r.conditions.length === 1
                  ? r.conditions
                  : r.conditions.filter((_, ci) => ci !== condIdx),
            }
          : r,
      ),
    );
  }

  // ── rule outputs ───────────────────────────────────────────────────────
  function updateOutputValue(ruleIdx, outputId, value) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? { ...r, outputValues: { ...(r.outputValues || {}), [outputId]: value } }
          : r,
      ),
    );
  }

  function addRule() {
    setRules((rs) => [...rs, newEmptyRule()]);
  }

  function removeRule(ruleIdx) {
    setRules((rs) => (rs.length === 1 ? rs : rs.filter((_, ri) => ri !== ruleIdx)));
  }

  // ── validation ─────────────────────────────────────────────────────────
  const trimmedName = name.trim();
  const outputNames = outputs.map((o) => o.name.trim());
  const outputsValid =
    outputs.length > 0 &&
    outputs.every((o) => VARIABLE_NAME_RE.test(o.name.trim())) &&
    new Set(outputNames).size === outputNames.length;

  const rulesValid =
    rules.length > 0 &&
    rules.every(
      (r) =>
        r.conditions.length > 0 &&
        r.conditions.every((c) => c.attribute && c.value !== '' && c.value !== null),
    );

  const canSave = trimmedName.length > 0 && outputsValid && rulesValid;

  async function handleSave() {
    setDeploying(true);
    setError(null);
    try {
      const xml = generateDmnXml({
        programName: trimmedName,
        outputs: outputs.map((o) => ({ ...o, name: o.name.trim() })),
        rules,
      });
      const slug = slugify(trimmedName);
      const result = await deployResource({
        filename: `${slug}.dmn`,
        content: xml,
      });
      onCreated?.({ name: trimmedName, slug, deployment: result });
    } catch (e) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="new-program">
      <div className="new-program__header">
        <h3>New Lead Program</h3>
        <button type="button" className="link-btn" onClick={onCancel} disabled={deploying}>
          Cancel
        </button>
      </div>

      <label className="new-program__field">
        <span className="new-program__label">Program name</span>
        <input
          className="new-program__input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AARP LTC Options"
          autoFocus
        />
        {trimmedName && (
          <span className="muted small">decision id: <code>{slugify(trimmedName)}</code></span>
        )}
      </label>

      <div className="new-program__outputs-section">
        <div className="new-program__rules-header">
          <span className="new-program__label">Outputs</span>
          <span className="muted small">
            Each output becomes a column. The variable name is what the BPMN sees as a process
            variable after the decision runs.
          </span>
        </div>

        {outputs.map((o) => {
          const trimmed = o.name.trim();
          const nameInvalid = trimmed.length > 0 && !VARIABLE_NAME_RE.test(trimmed);
          const dup =
            trimmed.length > 0 &&
            outputs.filter((other) => other.name.trim() === trimmed).length > 1;
          return (
            <div className="output-def-row" key={o.id}>
              <input
                className={`output-def-row__name ${nameInvalid || dup ? 'invalid' : ''}`}
                type="text"
                value={o.name}
                onChange={(e) => updateOutput(o.id, { name: e.target.value })}
                placeholder="variable name (e.g. isEligible)"
              />
              <select
                className="output-def-row__type"
                value={o.type}
                onChange={(e) => updateOutput(o.id, { type: e.target.value })}
              >
                {OUTPUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="link-btn"
                onClick={() => removeOutput(o.id)}
                disabled={outputs.length === 1}
                title={outputs.length === 1 ? 'At least one output is required' : 'Remove output'}
              >
                ✕
              </button>
              {(nameInvalid || dup) && (
                <span className="output-def-row__error small">
                  {dup ? 'Duplicate name' : 'Must start with a letter or _, then letters/digits/_'}
                </span>
              )}
            </div>
          );
        })}

        <button type="button" className="link-btn" onClick={addOutput}>
          + Add Output
        </button>
      </div>

      <div className="new-program__rules">
        <div className="new-program__rules-header">
          <span className="new-program__label">Rules</span>
          <span className="muted small">
            Hit policy <strong>FIRST</strong> — the first rule whose conditions all match
            sets the outputs. Conditions inside a rule are AND-ed together.
          </span>
        </div>

        {rules.map((rule, ruleIdx) => (
          <div className="rule-card" key={ruleIdx}>
            <div className="rule-card__header">
              <span className="rule-card__title">Rule {ruleIdx + 1}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => removeRule(ruleIdx)}
                disabled={rules.length === 1}
                title={rules.length === 1 ? 'At least one rule is required' : 'Remove rule'}
              >
                Remove rule
              </button>
            </div>

            <div className="rule-card__body">
              <div className="rule-card__keyword">IF</div>
              <div className="rule-card__conditions">
                {rule.conditions.map((c, condIdx) => {
                  const attr = ATTRIBUTES.find((a) => a.name === c.attribute);
                  return (
                    <Fragment key={condIdx}>
                      {condIdx > 0 && <div className="condition-and">AND</div>}
                      <div className="condition-row">
                        <select
                          className="condition-row__attr"
                          value={c.attribute}
                          onChange={(e) =>
                            updateCondition(ruleIdx, condIdx, {
                              attribute: e.target.value,
                              value: '',
                            })
                          }
                        >
                          {ATTRIBUTES.map((a) => (
                            <option key={a.name} value={a.name}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="condition-row__op"
                          value={c.operator}
                          onChange={(e) =>
                            updateCondition(ruleIdx, condIdx, { operator: e.target.value })
                          }
                        >
                          {OPERATORS.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                        <input
                          className="condition-row__val"
                          type={attr?.type === 'number' ? 'number' : 'text'}
                          step={attr?.type === 'number' ? 'any' : undefined}
                          value={c.value}
                          onChange={(e) =>
                            updateCondition(ruleIdx, condIdx, { value: e.target.value })
                          }
                          placeholder="value"
                        />
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => removeCondition(ruleIdx, condIdx)}
                          disabled={rule.conditions.length === 1}
                          title={
                            rule.conditions.length === 1
                              ? 'A rule needs at least one condition'
                              : 'Remove condition'
                          }
                        >
                          ✕
                        </button>
                      </div>
                    </Fragment>
                  );
                })}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => addCondition(ruleIdx)}
                >
                  + Add Condition
                </button>
              </div>
            </div>

            <div className="rule-card__divider" />

            <div className="rule-card__body">
              <div className="rule-card__keyword rule-card__keyword--then">THEN</div>
              <div className="rule-card__outputs">
                {outputs.map((o, outIdx) => {
                  const value = rule.outputValues?.[o.id] ?? '';
                  const displayName = o.name.trim() || `output_${outIdx + 1}`;
                  return (
                    <Fragment key={o.id}>
                      {outIdx > 0 && <div className="condition-and">AND</div>}
                      <div className="output-row">
                        <span className="output-row__name" title={displayName}>
                          {displayName}
                        </span>
                        <span className="output-row__eq">=</span>
                        {o.type === 'boolean' ? (
                          <select
                            className="output-row__val"
                            value={value}
                            onChange={(e) => updateOutputValue(ruleIdx, o.id, e.target.value)}
                          >
                            <option value="">—</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            className="output-row__val"
                            type={o.type === 'number' ? 'number' : 'text'}
                            step={o.type === 'number' ? 'any' : undefined}
                            value={value}
                            onChange={(e) => updateOutputValue(ruleIdx, o.id, e.target.value)}
                            placeholder={o.type === 'number' ? '0' : 'value'}
                          />
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <button type="button" className="add-rule-btn" onClick={addRule}>
          + Add Rule
        </button>
      </div>

      {error && (
        <div className="results__error">
          <strong>Deployment failed</strong>
          <pre>{error}</pre>
        </div>
      )}

      <div className="new-program__actions">
        <button
          type="button"
          className="run-btn"
          onClick={handleSave}
          disabled={!canSave || deploying}
        >
          {deploying ? 'Deploying…' : 'Save & Activate'}
        </button>
      </div>
    </div>
  );
}
