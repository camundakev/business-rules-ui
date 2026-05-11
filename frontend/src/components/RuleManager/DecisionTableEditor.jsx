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

export function DecisionTableEditor({ decision, onDeployed }) {
  const modelerRef = useRef(null);
  const [containerEl, setContainerEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);
  const [deployStatus, setDeployStatus] = useState(null);

  // Auto-dismiss success toast (errors stay sticky)
  useEffect(() => {
    if (!deployStatus?.ok) return;
    const t = setTimeout(() => setDeployStatus(null), 4000);
    return () => clearTimeout(t);
  }, [deployStatus]);

  // Create the modeler the first time the canvas div is mounted.
  // Using a callback ref guarantees the effect sees the actual element.
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

  // Load XML whenever the selected decision changes (and the modeler exists).
  useEffect(() => {
    if (!decision || !modelerRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDeployStatus(null);
    (async () => {
      try {
        const xml = await getDecisionDefinitionXml(decision.decisionDefinitionKey);
        if (cancelled) return;
        await modelerRef.current.importXML(xml);
        const views = modelerRef.current.getViews();
        const tableView = views.find((v) => v.type === 'decisionTable');
        if (tableView) await modelerRef.current.open(tableView);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [decision, containerEl]);

  async function handleDeploy() {
    if (!modelerRef.current || !decision) return;
    setDeploying(true);
    setError(null);
    setDeployStatus(null);
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      const filename = `${decision.decisionDefinitionId}.dmn`;
      const result = await deployResource({ filename, content: xml });
      const decisionDeployment = result.deployments?.find((d) => d.decisionDefinition);
      const newVersion = decisionDeployment?.decisionDefinition?.version;
      setDeployStatus({
        ok: true,
        message: `Deployed ${filename} as version ${newVersion ?? '?'} (deployment key ${result.deploymentKey})`,
      });
      onDeployed?.(decision.decisionDefinitionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <div>
          {decision ? (
            <>
              <strong>{decision.name || decision.decisionDefinitionId}</strong>
              <span className="muted small"> · current v{decision.version}</span>
            </>
          ) : (
            <span className="muted">Select a decision from the list to view and edit.</span>
          )}
        </div>
        <div className="editor__actions">
          <button
            type="button"
            className="run-btn"
            onClick={handleDeploy}
            disabled={!decision || loading || deploying}
          >
            {deploying ? 'Deploying…' : 'Deploy as new version'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="muted inline-loading"><span className="spinner" aria-hidden="true" /> Loading XML…</div>
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

      <div ref={setContainerEl} className="dmn-canvas" />
    </div>
  );
}
