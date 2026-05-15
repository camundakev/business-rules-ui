// One editable rule row card. Renders:
//   - Header: "Rule N" + optional remove button
//   - IF section: list of AND-ed conditions with a prominent
//     "+ Add Condition" button; conditions inside a single row are
//     visually grouped to make the AND relationship explicit (no
//     toggle — same-row = AND, separate rule = OR)
//   - THEN section: per-output value editors with type-aware controls
//     (boolean → dropdown, numeric → number input, string → text)
//
// This is the canonical row UI shared by the New Lead Program builder
// and the unified editor's Edit Rules mode.

import { Fragment } from 'react';
import {
  ATTRIBUTE_SCHEMA,
  OPERATORS,
  getAttribute,
} from '../../utils/attributeSchema.js';

function defaultConditionValue(attr) {
  if (!attr) return '';
  if (attr.inputControl === 'dropdown') return attr.values[0];
  return '';
}

export function newCondition() {
  const attr = ATTRIBUTE_SCHEMA[0];
  return {
    attribute: attr.name,
    operator: '=',
    value: defaultConditionValue(attr),
  };
}

export function defaultOutputValueFor(output) {
  const type = output.dmnType ?? output.typeRef ?? 'string';
  if (output.name === 'isEligible') return 'true';
  if (output.name === 'shouldUnenroll') return 'false';
  if (type === 'boolean') return 'true';
  return '';
}

export function newRule(outputs) {
  const outputValues = {};
  for (const o of outputs) outputValues[o.name] = defaultOutputValueFor(o);
  return { conditions: [newCondition()], outputValues };
}

function OutputValueInput({ output, value, onChange, disabled }) {
  const type = output.dmnType ?? output.typeRef ?? 'string';
  if (type === 'boolean') {
    return (
      <select
        className="rule-row__output-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  const isNumeric =
    type === 'integer' || type === 'double' || type === 'long' || type === 'number';
  return (
    <input
      className="rule-row__output-input"
      type={isNumeric ? 'number' : 'text'}
      step={isNumeric ? 'any' : undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={isNumeric ? '0' : 'value'}
      disabled={disabled}
    />
  );
}

export function RuleRowEditor({
  ruleIdx,
  rule,
  outputs,
  onUpdateCondition,
  onAddCondition,
  onRemoveCondition,
  onUpdateOutput,
  onRemoveRule,
  canRemove,
  disabled,
}) {
  return (
    <div className="rule-row">
      <div className="rule-row__header">
        <span className="rule-row__title">Rule {ruleIdx + 1} (row {ruleIdx + 1})</span>
        <button
          type="button"
          className="link-btn"
          onClick={onRemoveRule}
          disabled={!canRemove || disabled}
          title={canRemove ? 'Remove this row' : 'At least one row is required'}
        >
          Remove row
        </button>
      </div>

      <div className="rule-row__section">
        <div className="rule-row__keyword">IF</div>
        <div className="rule-row__body">
          {rule.conditions.map((c, condIdx) => {
            const attr = getAttribute(c.attribute);
            return (
              <Fragment key={condIdx}>
                {condIdx > 0 && (
                  <div className="rule-row__and" aria-hidden="true">AND</div>
                )}
                <div className="condition-row">
                  <select
                    className="condition-row__attr"
                    value={c.attribute}
                    onChange={(e) => {
                      const next = getAttribute(e.target.value);
                      onUpdateCondition(condIdx, {
                        attribute: e.target.value,
                        value: defaultConditionValue(next),
                      });
                    }}
                    disabled={disabled}
                  >
                    {ATTRIBUTE_SCHEMA.map((a) => (
                      <option key={a.name} value={a.name}>{a.label}</option>
                    ))}
                  </select>
                  <select
                    className="condition-row__op"
                    value={c.operator}
                    onChange={(e) => onUpdateCondition(condIdx, { operator: e.target.value })}
                    disabled={disabled}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  {attr?.inputControl === 'dropdown' ? (
                    <select
                      className="condition-row__val"
                      value={c.value}
                      onChange={(e) => onUpdateCondition(condIdx, { value: e.target.value })}
                      disabled={disabled}
                    >
                      {attr.values.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="condition-row__val"
                      type="number"
                      step={attr?.step ?? 'any'}
                      min={attr?.min}
                      max={attr?.max}
                      value={c.value}
                      onChange={(e) => onUpdateCondition(condIdx, { value: e.target.value })}
                      placeholder="value"
                      disabled={disabled}
                    />
                  )}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onRemoveCondition(condIdx)}
                    disabled={rule.conditions.length === 1 || disabled}
                    title={
                      rule.conditions.length === 1
                        ? 'A row needs at least one condition'
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
            className="add-condition-btn"
            onClick={onAddCondition}
            disabled={disabled}
          >
            + Add Condition (AND)
          </button>
        </div>
      </div>

      <div className="rule-row__divider" />

      <div className="rule-row__section">
        <div className="rule-row__keyword rule-row__keyword--then">THEN</div>
        <div className="rule-row__body">
          {outputs.map((o) => (
            <div className="rule-row__output" key={o.name}>
              <span className="rule-row__output-name">
                <code>{o.name}</code>
                <span className="muted small">
                  {o.dmnType ?? o.typeRef ?? 'string'}
                </span>
              </span>
              <span className="rule-row__output-eq">=</span>
              <OutputValueInput
                output={o}
                value={rule.outputValues?.[o.name]}
                onChange={(v) => onUpdateOutput(o.name, v)}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FallbackRowCard({ outputs, values, onUpdate, disabled }) {
  return (
    <div className="rule-row rule-row--fallback">
      <div className="rule-row__header">
        <span className="rule-row__title">Fallback (no rule matched)</span>
      </div>
      <div className="rule-row__section">
        <div className="rule-row__keyword rule-row__keyword--then">THEN</div>
        <div className="rule-row__body">
          {outputs.map((o) => (
            <div className="rule-row__output" key={o.name}>
              <span className="rule-row__output-name">
                <code>{o.name}</code>
                <span className="muted small">
                  {o.dmnType ?? o.typeRef ?? 'string'}
                </span>
              </span>
              <span className="rule-row__output-eq">=</span>
              <OutputValueInput
                output={o}
                value={values[o.name]}
                onChange={(v) => onUpdate(o.name, v)}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
