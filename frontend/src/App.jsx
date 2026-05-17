import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENTS } from './data/agents.js';
import {
  loadCustomAgents,
  upsertCustomAgent,
  removeCustomAgent,
} from './data/customAgents.js';
import { AgentCard } from './components/AgentSimulator/AgentCard.jsx';
import { NewAgentForm } from './components/AgentSimulator/NewAgentForm.jsx';
import { ProgramSelector } from './components/AgentSimulator/ProgramSelector.jsx';
import { ResultsPanel } from './components/AgentSimulator/ResultsPanel.jsx';
import { ProgramList } from './components/RuleManager/ProgramList.jsx';
import { DecisionTableEditor } from './components/RuleManager/DecisionTableEditor.jsx';
import { VersionHistory } from './components/RuleManager/VersionHistory.jsx';
import { NewLeadProgram } from './components/RuleManager/NewLeadProgram.jsx';
import {
  startProcessInstance,
  listDecisionInstancesForProcess,
  listDecisionDefinitions,
  listElementInstances,
  fetchProcessVariables,
  getProcessInstance,
  deleteResource,
  evaluateDecision,
} from './api/camunda.js';
import {
  addProgram,
  removeProgram,
  isDefaultProgram,
  seedRegistry,
  hydrateFromDecisionDefinitions,
  DEFAULT_PROGRAM,
} from './utils/programRegistry.js';

const TABS = [
  { id: 'simulator', label: 'Agent Simulator' },
  { id: 'rules', label: 'Rule Manager' },
];

// Decision-definitions/search is eventually consistent — wait briefly
// after a deploy before refetching so the new version actually appears.
const DEPLOY_REFRESH_DELAY_MS = 2500;

// Process-instance polling tuning. The fast happy paths
// (Eligible-with-recommendations / Ineligible-with-unenroll) finish in
// ~1–3 seconds. The training path parks indefinitely on a 30-day
// timer; we detect that by seeing the PI stay ACTIVE while the only
// active element instances are pure wait states (timer, user task,
// message catch). Cap polling at ~45 s for safety.
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 45;

// Camunda BPMN element types that mean "actively running" — if any of
// these are still ACTIVE on the PI, the process is still working and
// we should keep polling. Anything not in this set is treated as a
// wait state.
const RUNNING_ELEMENT_TYPES = new Set([
  'SERVICE_TASK',
  'BUSINESS_RULE_TASK',
  'SCRIPT_TASK',
  'SEND_TASK',
  'CALL_ACTIVITY',
  'SUB_PROCESS',
  'EVENT_SUB_PROCESS',
  'MULTI_INSTANCE_BODY',
  'PROCESS', // the process element itself is always active; ignored below
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll a process instance until it reaches a settled state — either a
// terminal end (COMPLETED / TERMINATED) or a parked wait state where
// no active element is "running". Returns { kind, variables,
// waitingElements? }.
async function pollProcessInstance(processInstanceKey) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const pi = await getProcessInstance(processInstanceKey).catch(() => null);
    const state = pi?.state;

    if (state === 'COMPLETED' || state === 'TERMINATED') {
      const variables = await fetchProcessVariables(processInstanceKey).catch(() => ({}));
      return { kind: state === 'COMPLETED' ? 'completed' : 'terminated', variables };
    }

    if (state === 'ACTIVE') {
      // Give Zeebe a moment to register the initial element instances
      // before deciding whether the PI is parked. Skip the wait-state
      // check on the first attempt.
      if (attempt >= 1) {
        const el = await listElementInstances({
          filter: { processInstanceKey, state: 'ACTIVE' },
          page: { limit: 50 },
        }).catch(() => null);
        const active = el?.items ?? [];
        // Filter out the root PROCESS element which is always active.
        const nonProcess = active.filter((e) => {
          const t = (e.type ?? e.elementType ?? e.bpmnElementType ?? '').toUpperCase();
          return t !== 'PROCESS' && t !== '';
        });
        if (nonProcess.length > 0) {
          const stillRunning = nonProcess.some((e) => {
            const t = (e.type ?? e.elementType ?? e.bpmnElementType ?? '').toUpperCase();
            return RUNNING_ELEMENT_TYPES.has(t);
          });
          if (!stillRunning) {
            const variables = await fetchProcessVariables(processInstanceKey).catch(() => ({}));
            return { kind: 'waiting', variables, waitingElements: nonProcess };
          }
        }
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
  // Polling cap reached. Surface what we have — likely a slow worker
  // or unexpected state — but don't throw, since the user may still
  // get a useful read from variables-so-far.
  const variables = await fetchProcessVariables(processInstanceKey).catch(() => ({}));
  return { kind: 'timeout', variables };
}

function AgentSimulator({ programs, onProgramUnregistered }) {
  const [customAgents, setCustomAgents] = useState(() => loadCustomAgents());
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);
  const [program, setProgram] = useState(DEFAULT_PROGRAM);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [agentsMode, setAgentsMode] = useState('list'); // 'list' | 'new' | 'edit'
  const [editingAgent, setEditingAgent] = useState(null);

  const allAgents = [...AGENTS, ...customAgents];

  // Reconcile the selected program when the registry changes — if it was
  // removed (shouldn't happen in this PoC) fall back to the default.
  useEffect(() => {
    const stillThere = programs.find((p) => p.displayName === program.displayName);
    if (!stillThere) setProgram(DEFAULT_PROGRAM);
  }, [programs]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAgentCreated(agent) {
    setCustomAgents((current) => upsertCustomAgent(current, agent));
    setSelectedAgent(agent);
    setAgentsMode('list');
    setEditingAgent(null);
  }

  function handleEditAgent(agent) {
    setEditingAgent(agent);
    setAgentsMode('edit');
  }

  function handleDeleteAgent(agentCode) {
    setCustomAgents((current) => removeCustomAgent(current, agentCode));
    setSelectedAgent((current) => {
      if (current?.agentCode === agentCode) return AGENTS[0];
      return current;
    });
  }

  async function runEvaluation() {
    if (!program) return;
    setRunning(true);
    setResult(null);
    setAudit(null);
    setError(null);

    // Pre-flight: probe each of the program's 3 DMNs. Camunda's search
    // index is eventually consistent and may list a decision that's
    // actually been deleted from the runtime — Zeebe then errors on
    // the BPMN's first business-rule task with NOT_FOUND. Catching that
    // here means we can surface a clear "this program is orphaned"
    // message and offer to remove it, instead of leaking the raw
    // Zeebe error.
    const probeIds = [
      ['eligibility', program.eligibilityId],
      ['recommendation', program.recommendationId],
      ['unenrollment', program.unenrollmentId],
    ];
    const probeResults = await Promise.all(
      probeIds.map(async ([role, id]) => {
        const r = await evaluateDecision(id, { agentStatus: 'Active' });
        // 404 = decision is gone from runtime. Other failures (400 on
        // input shape, etc.) mean the decision is THERE; we treat those
        // as present.
        return { role, id, present: !(!r.ok && r.status === 404) };
      }),
    );
    const missing = probeResults.filter((p) => !p.present);
    if (missing.length > 0) {
      setRunning(false);
      setError({
        kind: 'orphaned-program',
        program,
        missing,
      });
      return;
    }

    try {
      const variables = {
        ...selectedAgent,
        leadProgram: program.displayName,
        eligibilityDecisionId: program.eligibilityId,
        recommendationDecisionId: program.recommendationId,
        unenrollmentDecisionId: program.unenrollmentId,
      };
      // Start without awaitCompletion so the process can park on a
      // long-lived timer / user task (training path waits 30 days)
      // without our request hanging for the cluster's full timeout.
      const startRes = await startProcessInstance({
        processDefinitionId: 'lead-program-evaluation',
        variables,
        awaitCompletion: false,
        requestTimeout: 10000,
      });
      const processInstanceKey = startRes.processInstanceKey;
      const settled = await pollProcessInstance(processInstanceKey);
      // In either terminal or waiting state, render what we have. The
      // process being "parked" on a timer/user task is an expected
      // outcome (training path); not an error.
      setResult({
        processInstanceKey,
        variables: settled.variables,
        state: settled.kind, // 'completed' | 'waiting' | 'terminated'
        waitingElements: settled.waitingElements,
        observedAt: new Date().toISOString(),
      });
      const auditRes = await listDecisionInstancesForProcess(processInstanceKey);
      setAudit(auditRes.items || []);
    } catch (e) {
      setError({ kind: 'generic', message: e.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="simulator">
      <div className="hint">
        Run a sample agent through the live <code>lead-program-evaluation</code> process on Camunda SaaS.
        Each run starts a real process instance and surfaces the decision-table outputs and final agent status.
      </div>
      <section className="panel">
        <div className="panel__header">
          <h2>Select an Agent</h2>
          {agentsMode === 'list' && (
            <button
              type="button"
              className="run-btn"
              onClick={() => setAgentsMode('new')}
            >
              + New Agent
            </button>
          )}
        </div>
        {agentsMode === 'new' && (
          <NewAgentForm
            existingCodes={allAgents.map((a) => a.agentCode)}
            onSave={handleAgentCreated}
            onCancel={() => setAgentsMode('list')}
          />
        )}
        {agentsMode === 'edit' && editingAgent && (
          <NewAgentForm
            // Exclude the editing agent's own code so the conflict
            // check doesn't fire against its current value.
            existingCodes={allAgents
              .filter((a) => a.agentCode !== editingAgent.agentCode)
              .map((a) => a.agentCode)}
            initialAgent={editingAgent}
            onSave={handleAgentCreated}
            onCancel={() => {
              setEditingAgent(null);
              setAgentsMode('list');
            }}
          />
        )}
        {agentsMode === 'list' && (
          <div className="agent-grid">
            {allAgents.map((agent) => {
              const isCustom = !AGENTS.some((a) => a.agentCode === agent.agentCode);
              return (
                <AgentCard
                  key={agent.agentCode}
                  agent={agent}
                  selected={selectedAgent?.agentCode === agent.agentCode}
                  onSelect={setSelectedAgent}
                  onEdit={isCustom ? () => handleEditAgent(agent) : null}
                  onDelete={isCustom ? () => handleDeleteAgent(agent.agentCode) : null}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="run-row">
          <ProgramSelector
            programs={programs}
            value={program}
            onChange={setProgram}
          />
          <button
            type="button"
            className="run-btn"
            onClick={runEvaluation}
            disabled={running || !selectedAgent || !program}
          >
            {running ? 'Running…' : `Run Evaluation for ${selectedAgent?.agentName ?? '—'}`}
          </button>
        </div>
      </section>

      {error?.kind === 'orphaned-program' && (
        <div className="deploy-status deploy-status--err" role="alert">
          <div className="deploy-status__body">
            ⚠ <strong>"{error.program.displayName}" is missing from Camunda.</strong>{' '}
            The following decision{error.missing.length === 1 ? '' : 's'} return NOT_FOUND from
            Zeebe's runtime:
            <ul style={{ margin: '6px 0 6px 18px' }}>
              {error.missing.map((m) => (
                <li key={m.id}>
                  <code>{m.id}</code> <span className="muted small">({m.role})</span>
                </li>
              ))}
            </ul>
            This usually means the program was partially deleted. Camunda's search index can
            keep listing the decision for minutes after it's gone from the runtime, so the
            dropdown showed it even though it isn't really there. Removing the program from
            the dropdown is safe — the runtime is already gone.
          </div>
          <button
            type="button"
            className="run-btn"
            style={{ flexShrink: 0 }}
            onClick={() => {
              onProgramUnregistered?.(error.program.displayName);
              setProgram(DEFAULT_PROGRAM);
              setError(null);
            }}
          >
            Remove from dropdown
          </button>
        </div>
      )}

      <ResultsPanel
        result={result}
        decisionAudit={audit}
        error={error?.kind === 'generic' ? error.message : null}
        running={running}
        programs={programs}
      />
    </div>
  );
}

function RuleManager({ programs, onProgramRegistered, onProgramUnregistered, onAnyDeploy }) {
  const [decisions, setDecisions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [mode, setMode] = useState('list'); // 'list' | 'new'
  const [deletingProgramName, setDeletingProgramName] = useState(null);
  // { kind: 'ok' | 'err', message: string } — toast shown above the editor
  // after a delete completes. Sticky until the user dismisses; the user
  // needs to read the proof (count + runtime verification) without it
  // disappearing on them.
  const [deleteStatus, setDeleteStatus] = useState(null);

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDecisionDefinitions({
        sort: [
          { field: 'decisionDefinitionId', order: 'asc' },
          { field: 'version', order: 'desc' },
        ],
        page: { limit: 200 },
      });
      setDecisions(result.items || []);
      if (selected) {
        const latest = (result.items || [])
          .filter((d) => d.decisionDefinitionId === selected.decisionDefinitionId)
          .sort((a, b) => b.version - a.version)[0];
        if (latest && latest.decisionDefinitionKey !== selected.decisionDefinitionKey) {
          setSelected(latest);
        } else if (!latest) {
          // Selected decision was deleted from the cluster.
          setSelected(null);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { loadDecisions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDeployed() {
    setTimeout(() => {
      setRefreshSignal((s) => s + 1);
      loadDecisions();
      onAnyDeploy?.();
    }, DEPLOY_REFRESH_DELAY_MS);
  }

  function handleProgramCreated(program) {
    onProgramRegistered?.(program);
    setMode('list');
    handleDeployed();
  }

  // Find which program (if any) owns the currently selected decision so
  // the sidebar can default to expanding that program on mount.
  function programOwningDecision(decision) {
    if (!decision) return null;
    return (
      programs.find(
        (p) =>
          p.eligibilityId === decision.decisionDefinitionId ||
          p.recommendationId === decision.decisionDefinitionId ||
          p.unenrollmentId === decision.decisionDefinitionId,
      ) || null
    );
  }

  async function handleDeleteProgram(program) {
    if (isDefaultProgram(program)) return;
    const ok = window.confirm(
      `Delete "${program.displayName}"?\n\n` +
      `This permanently removes all 3 DMN tables from Camunda:\n` +
      `  • ${program.eligibilityId}\n` +
      `  • ${program.recommendationId}\n` +
      `  • ${program.unenrollmentId}\n\n` +
      `Active process instances using these decisions will fail. This cannot be undone.`,
    );
    if (!ok) return;
    setDeletingProgramName(program.displayName);
    setError(null);
    setDeleteStatus(null);
    let deletedCount = 0;
    const failures = [];
    try {
      const ids = [program.eligibilityId, program.recommendationId, program.unenrollmentId];
      // For each decision definition id, fetch every deployed version and
      // call delete on the parent DRG. Each version is its own DRG, so a
      // 3-version DMN requires 3 delete calls. 404 = already gone (counts).
      for (const decisionDefinitionId of ids) {
        let drgKeys;
        try {
          const res = await listDecisionDefinitions({
            filter: { decisionDefinitionId },
            page: { limit: 200 },
          });
          drgKeys = new Set(
            (res.items || []).map((d) => d.decisionRequirementsKey).filter(Boolean),
          );
        } catch (e) {
          failures.push(`search ${decisionDefinitionId}: ${e.message}`);
          continue;
        }
        if (drgKeys.size === 0) {
          // No versions found — likely already deleted, nothing to do.
          continue;
        }
        for (const key of drgKeys) {
          try {
            await deleteResource(key);
            deletedCount += 1;
          } catch (e) {
            if (/→\s*404/.test(e.message)) {
              // Already gone — counts as success.
              deletedCount += 1;
            } else {
              failures.push(`${decisionDefinitionId}#${key}: ${e.message}`);
            }
          }
        }
      }

      // Clear selection if it pointed at one of the deleted decisions.
      if (
        selected &&
        (selected.decisionDefinitionId === program.eligibilityId ||
          selected.decisionDefinitionId === program.recommendationId ||
          selected.decisionDefinitionId === program.unenrollmentId)
      ) {
        setSelected(null);
      }

      if (failures.length === 0) {
        onProgramUnregistered?.(program.displayName);
        // Runtime verification: ask Zeebe to evaluate each deleted
        // decision. 404 NOT_FOUND confirms it's gone from the runtime
        // (Camunda's search index may still list it for a few minutes
        // — this probe is the definitive check).
        const verify = await Promise.all(
          ids.map(async (id) => {
            const r = await evaluateDecision(id, { agentStatus: 'Active' });
            return { id, gone: !r.ok && r.status === 404 };
          }),
        );
        const goneCount = verify.filter((v) => v.gone).length;
        setDeleteStatus({
          kind: goneCount === ids.length ? 'ok' : 'err',
          message:
            `Deleted "${program.displayName}" — ${deletedCount} DMN version` +
            `${deletedCount === 1 ? '' : 's'} removed across the 3 tables.\n\n` +
            `Runtime verification: ${goneCount}/${ids.length} decisions return NOT_FOUND ` +
            `from Zeebe's evaluation endpoint (the authoritative check). ` +
            (goneCount === ids.length
              ? 'The DMNs are gone from the cluster runtime. Camunda Operate / the search ' +
                'API can take a few minutes to catch up — that lag is expected.'
              : `${ids.length - goneCount} decision${ids.length - goneCount === 1 ? '' : 's'} ` +
                `still evaluate successfully and may not have been deleted: ` +
                verify.filter((v) => !v.gone).map((v) => v.id).join(', ')),
        });
      } else {
        setDeleteStatus({
          kind: 'err',
          message:
            `Partially deleted "${program.displayName}": ${deletedCount} resource` +
            `${deletedCount === 1 ? '' : 's'} removed, ${failures.length} failure` +
            `${failures.length === 1 ? '' : 's'}.\n\n${failures.join('\n')}`,
        });
      }
      handleDeployed();
    } catch (e) {
      setDeleteStatus({
        kind: 'err',
        message: `Failed to delete "${program.displayName}": ${e.message}`,
      });
    } finally {
      setDeletingProgramName(null);
    }
  }

  const selectedProgram = programOwningDecision(selected);

  return (
    <>
      <div className="rule-manager__header">
        <div className="hint">
          Edit a DMN decision table inline, deploy it as a new version, and re-run an agent in the
          Simulator tab to see the rule change take effect — no Modeler, no IT pipeline.
        </div>
        {mode === 'list' && (
          <button
            type="button"
            className="run-btn"
            onClick={() => setMode('new')}
          >
            + New Lead Program
          </button>
        )}
      </div>
    <div className="rule-manager">
      <aside className="rule-manager__sidebar">
        <ProgramList
          programs={programs}
          decisions={decisions}
          selectedDecisionKey={selected?.decisionDefinitionKey}
          selectedProgramName={selectedProgram?.displayName}
          onSelectDecision={setSelected}
          onDeleteProgram={handleDeleteProgram}
          onRefresh={() => { loadDecisions(); onAnyDeploy?.(); }}
          loading={loading}
          error={error}
          deletingProgramName={deletingProgramName}
        />
      </aside>
      <section className="rule-manager__main">
        {deleteStatus && (
          <div
            className={`deploy-status ${
              deleteStatus.kind === 'ok' ? 'deploy-status--ok' : 'deploy-status--err'
            }`}
            role="status"
          >
            <div className="deploy-status__body">
              {deleteStatus.kind === 'ok' ? '✓ ' : '⚠ '}
              <span style={{ whiteSpace: 'pre-line' }}>{deleteStatus.message}</span>
            </div>
            <button
              type="button"
              className="link-btn deploy-status__dismiss"
              onClick={() => setDeleteStatus(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {mode === 'new' ? (
          <NewLeadProgram
            onCreated={handleProgramCreated}
            onCancel={() => setMode('list')}
          />
        ) : (
          <>
            <DecisionTableEditor decision={selected} onDeployed={handleDeployed} />
            {selected && (
              <VersionHistory
                decisionDefinitionId={selected.decisionDefinitionId}
                currentKey={selected.decisionDefinitionKey}
                onSelectVersion={setSelected}
                onRestored={handleDeployed}
                refreshSignal={refreshSignal}
              />
            )}
          </>
        )}
      </section>
    </div>
    </>
  );
}

// Deleted-program tombstones. Camunda's decision-definitions/search is
// backed by an eventually-consistent secondary store; deleted records
// can keep appearing in search results for minutes after a delete.
// Without these tombstones, the next hydrate would resurrect a
// just-deleted program in the sidebar — making it look like delete
// didn't work even though the runtime is actually gone.
//
// Persisted to localStorage so reloads don't bring the program back
// during the window where Camunda's index is still catching up. The
// store is small (just display names) and per-origin.
const TOMBSTONE_KEY = 'nyl-rules-poc:program-tombstones';

function loadTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveTombstones(set) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage may be unavailable (private mode, quota). Tombstones
    // degrade to session-local — not fatal.
  }
}

function App() {
  const [tab, setTab] = useState('simulator');
  const [programs, setPrograms] = useState(() => seedRegistry());
  const tombstonesRef = useRef(loadTombstones());

  const refreshFromCluster = useCallback(async () => {
    try {
      const result = await listDecisionDefinitions({
        sort: [
          { field: 'decisionDefinitionId', order: 'asc' },
          { field: 'version', order: 'desc' },
        ],
        page: { limit: 200 },
      });
      setPrograms((current) => {
        const hydrated = hydrateFromDecisionDefinitions(result.items || [], current);
        return hydrated.filter((p) => !tombstonesRef.current.has(p.displayName));
      });
    } catch (e) {
      console.error('Failed to hydrate program registry:', e);
    }
  }, []);

  useEffect(() => { refreshFromCluster(); }, [refreshFromCluster]);

  function registerProgram(program) {
    // Re-adding a program clears any prior tombstone for the same name.
    tombstonesRef.current.delete(program.displayName);
    saveTombstones(tombstonesRef.current);
    setPrograms((current) => addProgram(current, program));
  }

  function unregisterProgram(displayName) {
    tombstonesRef.current.add(displayName);
    saveTombstones(tombstonesRef.current);
    setPrograms((current) => removeProgram(current, displayName));
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>NYL Lead Programs Management</h1>
        <p className="app__subtitle">Camunda 8 PoC · Rules orchestration without IT</p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app__main">
        {tab === 'simulator' && (
          <AgentSimulator
            programs={programs}
            onProgramUnregistered={unregisterProgram}
          />
        )}
        {tab === 'rules' && (
          <RuleManager
            programs={programs}
            onProgramRegistered={registerProgram}
            onProgramUnregistered={unregisterProgram}
            onAnyDeploy={refreshFromCluster}
          />
        )}
      </main>
    </div>
  );
}

export default App;
