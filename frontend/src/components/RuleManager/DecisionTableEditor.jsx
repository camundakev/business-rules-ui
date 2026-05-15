import { useEffect, useRef, useState } from 'react';
import DmnModeler from 'dmn-js/lib/Modeler';

import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-decision-table-controls.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn.css';

import { getDecisionDefinitionXml, deployResource } from '../../api/camunda.js';
import { getAttribute } from '../../utils/attributeSchema.js';
import { generateDmnXml } from '../../utils/generateDmn.js';
import { parseDmnXml } from '../../utils/dmnParser.js';
import {
  RuleRowEditor,
  FallbackRowCard,
  newRule,
  defaultOutputValueFor,
} from './RuleRowEditor.jsx';

function defaultFallbackForOutputs(outputs) {
  const m = {};
  for (const o of outputs) {
    if (o.name === 'isEligible') m[o.name] = 'false';
    else if (o.name === 'shouldUnenroll') m[o.name] = 'false';
    else if ((o.dmnType ?? o.typeRef) === 'boolean') m[o.name] = 'false';
    else m[o.name] = '';
  }
  return m;
}

function adaptOutputs(parsedOutputs) {
  // Normalize parser shape ({ name, label, typeRef }) into the
  // RuleRowEditor's expected shape ({ name, label, dmnType }).
  return parsedOutputs.map((o) => ({
    name: o.name,
    label: o.label,
    dmnType: o.typeRef,
  }));
}

// Convert the parser's rule shape into the form's rule shape:
//   - Drop rules whose conditions all referenced unknown attributes
//     (the form requires every rule to have at least one condition).
//   - Fill in missing output keys with type-aware defaults so the form
//     always has a value for every output column.
function adaptParsedRulesForForm(parsedRules, outputs) {
  if (!Array.isArray(parsedRules) || parsedRules.length === 0) return null;
  const valid = parsedRules.filter((r) => r.conditions.length > 0);
  if (valid.length === 0) return null;
  return valid.map((r) => {
    const outputValues = {};
    for (const o of outputs) {
      outputValues[o.name] =
        r.outputValues?.[o.name] !== undefined
          ? r.outputValues[o.name]
          : defaultOutputValueFor(o);
    }
    return { conditions: r.conditions.map((c) => ({ ...c })), outputValues };
  });
}

function adaptParsedFallbackForForm(parsedFallback, outputs) {
  const defaults = defaultFallbackForOutputs(outputs);
  if (!parsedFallback) return defaults;
  const merged = { ...defaults };
  for (const o of outputs) {
    if (parsedFallback[o.name] !== undefined) merged[o.name] = parsedFallback[o.name];
  }
  return merged;
}

function RuleEditForm({ decision, parsedDmn, onSave, onCancel, saving, error }) {
  const outputs = adaptOutputs(parsedDmn.outputs);
  // Initialize state from the parsed DMN so the form opens on the
  // current configuration of the decision table. Fall back to a single
  // empty rule only when the DMN had no parsable rules.
  const [rules, setRules] = useState(() => {
    const fromDmn = adaptParsedRulesForForm(parsedDmn.rules, outputs);
    return fromDmn ?? [newRule(outputs)];
  });
  const [fallback, setFallback] = useState(() =>
    adaptParsedFallbackForForm(parsedDmn.fallbackOutputValues, outputs),
  );

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
        ri === ruleIdx ? { ...r, conditions: [...r.conditions, newRule(outputs).conditions[0]] } : r,
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
  function updateOutputValue(ruleIdx, name, value) {
    setRules((rs) =>
      rs.map((r, ri) =>
        ri === ruleIdx ? { ...r, outputValues: { ...r.outputValues, [name]: value } } : r,
      ),
    );
  }
  function addRule() {
    setRules((rs) => [...rs, newRule(outputs)]);
  }
  function removeRule(ruleIdx) {
    setRules((rs) => (rs.length === 1 ? rs : rs.filter((_, ri) => ri !== ruleIdx)));
  }
  function updateFallback(name, value) {
    setFallback((f) => ({ ...f, [name]: value }));
  }

  const allValid =
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

  function handleSave() {
    onSave({
      rules,
      fallbackOutputValues: fallback,
      outputs,
      hitPolicy: parsedDmn.hitPolicy,
      decisionId: decision.decisionDefinitionId,
      decisionName: decision.name || decision.decisionDefinitionId,
    });
  }

  return (
    <div className="rule-edit">
      <div className="rule-edit__head">
        <div>
          <span className="muted small">Editing rules for</span>{' '}
          <strong>{decision.name || decision.decisionDefinitionId}</strong>
          <span className="muted small"> · hitPolicy: {parsedDmn.hitPolicy}</span>
        </div>
        <button type="button" className="link-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>

      <div className="new-program__rules-header">
        <span className="new-program__label">Decision table rules</span>
        <span className="muted small">
          Each <strong>row</strong> is one rule. All conditions inside a row are AND-ed.
          Use <strong>+ Add Row</strong> to add another row — first matching row wins.
          Existing output columns and their types are preserved.
        </span>
      </div>

      <div className="new-program__rules">
        {rules.map((rule, ruleIdx) => (
          <RuleRowEditor
            key={ruleIdx}
            ruleIdx={ruleIdx}
            rule={rule}
            outputs={outputs}
            onUpdateCondition={(condIdx, patch) => updateCondition(ruleIdx, condIdx, patch)}
            onAddCondition={() => addCondition(ruleIdx)}
            onRemoveCondition={(condIdx) => removeCondition(ruleIdx, condIdx)}
            onUpdateOutput={(name, value) => updateOutputValue(ruleIdx, name, value)}
            onRemoveRule={() => removeRule(ruleIdx)}
            canRemove={rules.length > 1}
            disabled={saving}
          />
        ))}

        <button type="button" className="add-row-btn" onClick={addRule} disabled={saving}>
          + Add Row
        </button>

        <FallbackRowCard
          outputs={outputs}
          values={fallback}
          onUpdate={updateFallback}
          disabled={saving}
        />
      </div>

      {error && (
        <div className="results__error">
          <strong>Save failed</strong>
          <pre>{error}</pre>
        </div>
      )}

      <div className="new-program__actions">
        <button
          type="button"
          className="run-btn"
          onClick={handleSave}
          disabled={!allValid || saving}
        >
          {saving ? 'Deploying…' : 'Save & Deploy'}
        </button>
      </div>
    </div>
  );
}

export function DecisionTableEditor({ decision, onDeployed }) {
  const modelerRef = useRef(null);
  const [containerEl, setContainerEl] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [xml, setXml] = useState(null);
  const [parsedDmn, setParsedDmn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deployStatus, setDeployStatus] = useState(null);

  // Auto-dismiss success toast (errors stay sticky).
  useEffect(() => {
    if (!deployStatus?.ok) return;
    const t = setTimeout(() => setDeployStatus(null), 4000);
    return () => clearTimeout(t);
  }, [deployStatus]);

  // Create the dmn-js Modeler once the canvas div is mounted. Only used
  // in view mode.
  useEffect(() => {
    if (!containerEl) return;
    const modeler = new DmnModeler({
      container: containerEl,
      keyboard: { bindTo: window },
    });
    modelerRef.current = modeler;
    return () => {
      modeler.destroy();
      if (modelerRef.current === modeler) modelerRef.current = null;
    };
  }, [containerEl]);

  // Switch back to view mode whenever the selected decision changes.
  useEffect(() => {
    setMode('view');
    setError(null);
    setDeployStatus(null);
  }, [decision?.decisionDefinitionKey]);

  // Load XML for the selected decision and parse outputs/hit policy.
  useEffect(() => {
    if (!decision) {
      setXml(null);
      setParsedDmn(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const fetched = await getDecisionDefinitionXml(decision.decisionDefinitionKey);
        if (cancelled) return;
        setXml(fetched);
        try {
          setParsedDmn(parseDmnXml(fetched));
        } catch (e) {
          setParsedDmn(null);
          console.warn('parseDmnXml failed:', e);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [decision]);

  // Re-import XML into dmn-js whenever XML arrives or we flip back to view.
  useEffect(() => {
    if (!xml || !modelerRef.current || mode !== 'view') return;
    let cancelled = false;
    (async () => {
      try {
        await modelerRef.current.importXML(xml);
        if (cancelled) return;
        const views = modelerRef.current.getViews();
        const tableView = views.find((v) => v.type === 'decisionTable');
        if (tableView) await modelerRef.current.open(tableView);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [xml, mode, containerEl]);

  async function handleSaveEdit(payload) {
    if (!decision) return;
    setSaving(true);
    setError(null);
    setDeployStatus(null);
    try {
      const newXml = generateDmnXml({
        programName: decision.name || decision.decisionDefinitionId,
        rules: payload.rules,
        decisionId: payload.decisionId,
        decisionName: payload.decisionName,
        outputs: payload.outputs,
        fallbackOutputValues: payload.fallbackOutputValues,
        hitPolicy: payload.hitPolicy,
      });
      const filename = `${decision.decisionDefinitionId}.dmn`;
      const result = await deployResource({ filename, content: newXml });
      const dec = result.deployments?.find((d) => d.decisionDefinition);
      const newVersion = dec?.decisionDefinition?.version;
      setDeployStatus({
        ok: true,
        message: `Deployed ${filename} as version ${newVersion ?? '?'} (deployment key ${result.deploymentKey})`,
      });
      setMode('view');
      onDeployed?.(decision.decisionDefinitionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <div className="editor__actions">
          {decision && mode === 'view' && (
            <button
              type="button"
              className="run-btn run-btn--edit"
              onClick={() => setMode('edit')}
              disabled={loading || !parsedDmn}
              title={!parsedDmn ? 'DMN XML could not be parsed' : 'Re-author rules in the builder'}
            >
              ✎ Edit Rules
            </button>
          )}
          {decision && mode === 'edit' && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setMode('view')}
              disabled={saving}
            >
              View
            </button>
          )}
        </div>
        <div className="editor__title">
          {decision ? (
            <>
              <strong>{decision.name || decision.decisionDefinitionId}</strong>
              <span className="muted small"> · current v{decision.version}</span>
            </>
          ) : (
            <span className="muted">Select a decision from the list to view and edit.</span>
          )}
        </div>
      </div>

      {loading && (
        <div className="muted inline-loading">
          <span className="spinner" aria-hidden="true" /> Loading XML…
        </div>
      )}
      {error && (
        <div className="results__error">
          <strong>Error</strong>
          <pre>{error}</pre>
        </div>
      )}
      {deployStatus?.ok && (
        <div className="deploy-status deploy-status--ok">{deployStatus.message}</div>
      )}

      {mode === 'edit' && parsedDmn && decision ? (
        <RuleEditForm
          decision={decision}
          parsedDmn={parsedDmn}
          onSave={handleSaveEdit}
          onCancel={() => setMode('view')}
          saving={saving}
          error={null}
        />
      ) : (
        <div ref={setContainerEl} className="dmn-canvas" />
      )}
    </div>
  );
}
