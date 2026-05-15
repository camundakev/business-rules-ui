import { useState } from 'react';
import { ELIGIBILITY_OUTPUTS, getAttribute } from '../../utils/attributeSchema.js';
import { generateDmnXml, slugify } from '../../utils/generateDmn.js';
import { deployResources } from '../../api/camunda.js';
import {
  RECOMMENDATION_TEMPLATE,
  UNENROLLMENT_TEMPLATE,
  renderTemplate,
} from '../../templates/defaultDmnTemplates.js';
import {
  RuleRowEditor,
  FallbackRowCard,
  newRule,
  defaultOutputValueFor,
} from './RuleRowEditor.jsx';

function defaultFallbackValues(outputs, programName) {
  const out = {};
  for (const o of outputs) {
    if (o.name === 'isEligible') out[o.name] = 'false';
    else if (o.name === 'ineligibilityReason') {
      out[o.name] = programName
        ? `Does not match ${programName} criteria`
        : 'Does not match program criteria';
    } else out[o.name] = defaultOutputValueFor(o);
  }
  return out;
}

export function NewLeadProgram({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [rules, setRules] = useState(() => [newRule(ELIGIBILITY_OUTPUTS)]);
  const [fallbackOutputs, setFallbackOutputs] = useState(() =>
    defaultFallbackValues(ELIGIBILITY_OUTPUTS, ''),
  );
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  function updateCondition(ruleIdx, condIdx, patch) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? {
              ...r,
              conditions: r.conditions.map((c, ci) => (ci === condIdx ? { ...c, ...patch } : c)),
            }
          : r,
      ),
    );
  }

  function addCondition(ruleIdx) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? { ...r, conditions: [...r.conditions, { ...newRule(ELIGIBILITY_OUTPUTS).conditions[0] }] }
          : r,
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

  function updateOutputValue(ruleIdx, outputName, value) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx
          ? { ...r, outputValues: { ...r.outputValues, [outputName]: value } }
          : r,
      ),
    );
  }

  function addRule() {
    setRules((rs) => [...rs, newRule(ELIGIBILITY_OUTPUTS)]);
  }

  function removeRule(ruleIdx) {
    setRules((rs) => (rs.length === 1 ? rs : rs.filter((_, ri) => ri !== ruleIdx)));
  }

  function updateFallback(name, value) {
    setFallbackOutputs((f) => ({ ...f, [name]: value }));
  }

  const trimmedName = name.trim();
  const rulesValid =
    rules.length > 0 &&
    rules.every((r) =>
      r.conditions.length > 0 &&
      r.conditions.every((c) => {
        if (!c.attribute) return false;
        if (c.value === '' || c.value === null || c.value === undefined) return false;
        const attr = getAttribute(c.attribute);
        if (attr && (attr.dmnType === 'integer' || attr.dmnType === 'double')) {
          return !Number.isNaN(Number(c.value));
        }
        return true;
      }),
    );
  const canSave = trimmedName.length > 0 && rulesValid && !deploying;

  async function handleSave() {
    setDeploying(true);
    setError(null);
    try {
      const slug = slugify(trimmedName);
      const eligibilityId = `${slug}-eligibility`;
      const recommendationId = `${slug}-recommendation`;
      const unenrollmentId = `${slug}-unenrollment`;

      // If the user left ineligibilityReason as the generic default, swap
      // in one that names the program.
      const fallbackForGen = { ...fallbackOutputs };
      if (!fallbackForGen.ineligibilityReason || fallbackForGen.ineligibilityReason === 'Does not match program criteria') {
        fallbackForGen.ineligibilityReason = `Does not match ${trimmedName} criteria`;
      }

      const eligibilityXml = generateDmnXml({
        programName: trimmedName,
        decisionId: eligibilityId,
        decisionName: `${trimmedName} · Eligibility`,
        rules,
        fallbackOutputValues: fallbackForGen,
      });
      const recommendationXml = renderTemplate(RECOMMENDATION_TEMPLATE, {
        decisionId: recommendationId,
        decisionName: `${trimmedName} · Recommendations`,
        drgName: `${trimmedName} · Recommendations`,
      });
      const unenrollmentXml = renderTemplate(UNENROLLMENT_TEMPLATE, {
        decisionId: unenrollmentId,
        decisionName: `${trimmedName} · Unenrollment`,
        drgName: `${trimmedName} · Unenrollment`,
      });

      const deployment = await deployResources([
        { filename: `${eligibilityId}.dmn`, content: eligibilityXml },
        { filename: `${recommendationId}.dmn`, content: recommendationXml },
        { filename: `${unenrollmentId}.dmn`, content: unenrollmentXml },
      ]);

      onCreated?.({
        displayName: trimmedName,
        eligibilityId,
        recommendationId,
        unenrollmentId,
        deployment,
      });
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
          disabled={deploying}
        />
        {trimmedName && (
          <span className="muted small">
            decision id: <code>{slugify(trimmedName)}-eligibility</code>
          </span>
        )}
      </label>

      <div className="new-program__rules">
        <div className="new-program__rules-header">
          <span className="new-program__label">Decision table rules</span>
          <span className="muted small">
            Each <strong>row</strong> is one rule. All conditions inside a row are AND-ed.
            Use <strong>+ Add Row</strong> to add another row — first matching row wins.
          </span>
        </div>

        {rules.map((rule, ruleIdx) => (
          <RuleRowEditor
            key={ruleIdx}
            ruleIdx={ruleIdx}
            rule={rule}
            outputs={ELIGIBILITY_OUTPUTS}
            onUpdateCondition={(condIdx, patch) => updateCondition(ruleIdx, condIdx, patch)}
            onAddCondition={() => addCondition(ruleIdx)}
            onRemoveCondition={(condIdx) => removeCondition(ruleIdx, condIdx)}
            onUpdateOutput={(name, value) => updateOutputValue(ruleIdx, name, value)}
            onRemoveRule={() => removeRule(ruleIdx)}
            canRemove={rules.length > 1}
            disabled={deploying}
          />
        ))}

        <button type="button" className="add-row-btn" onClick={addRule} disabled={deploying}>
          + Add Row
        </button>

        <FallbackRowCard
          outputs={ELIGIBILITY_OUTPUTS}
          values={fallbackOutputs}
          onUpdate={updateFallback}
          disabled={deploying}
        />
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
          disabled={!canSave}
        >
          {deploying ? 'Deploying…' : 'Save & Activate'}
        </button>
      </div>
    </div>
  );
}
