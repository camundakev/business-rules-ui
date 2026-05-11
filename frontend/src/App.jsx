import { useEffect, useState } from 'react';
import { AGENTS, LEAD_PROGRAMS } from './data/agents.js';
import { AgentCard } from './components/AgentSimulator/AgentCard.jsx';
import { ProgramSelector } from './components/AgentSimulator/ProgramSelector.jsx';
import { ResultsPanel } from './components/AgentSimulator/ResultsPanel.jsx';
import { DecisionList } from './components/RuleManager/DecisionList.jsx';
import { DecisionTableEditor } from './components/RuleManager/DecisionTableEditor.jsx';
import { VersionHistory } from './components/RuleManager/VersionHistory.jsx';
import {
  startProcessInstance,
  listDecisionInstancesForProcess,
  listDecisionDefinitions,
} from './api/camunda.js';

const TABS = [
  { id: 'simulator', label: 'Agent Simulator' },
  { id: 'rules', label: 'Rule Manager' },
];

function AgentSimulator() {
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);
  const [program, setProgram] = useState(LEAD_PROGRAMS[0]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  async function runEvaluation() {
    setRunning(true);
    setResult(null);
    setAudit(null);
    setError(null);
    try {
      const variables = { ...selectedAgent, leadProgram: program };
      const piResult = await startProcessInstance({
        processDefinitionId: 'lead-program-evaluation',
        variables,
      });
      setResult(piResult);
      // Fetch decision audit for this PI
      const auditRes = await listDecisionInstancesForProcess(piResult.processInstanceKey);
      setAudit(auditRes.items || []);
    } catch (e) {
      setError(e.message);
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
        <h2>Select an Agent</h2>
        <div className="agent-grid">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.agentCode}
              agent={agent}
              selected={selectedAgent?.agentCode === agent.agentCode}
              onSelect={setSelectedAgent}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="run-row">
          <ProgramSelector
            programs={LEAD_PROGRAMS}
            value={program}
            onChange={setProgram}
          />
          <button
            type="button"
            className="run-btn"
            onClick={runEvaluation}
            disabled={running || !selectedAgent}
          >
            {running ? 'Running…' : `Run Evaluation for ${selectedAgent?.agentName ?? '—'}`}
          </button>
        </div>
      </section>

      <ResultsPanel result={result} decisionAudit={audit} error={error} running={running} />
    </div>
  );
}

function RuleManager() {
  const [decisions, setDecisions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  async function loadDecisions() {
    setLoading(true);
    setError(null);
    try {
      const result = await listDecisionDefinitions({
        sort: [
          { field: 'decisionDefinitionId', order: 'asc' },
          { field: 'version', order: 'desc' },
        ],
        page: { limit: 100 },
      });
      setDecisions(result.items || []);
      // Auto-select latest of currently-selected id, if any
      if (selected) {
        const latest = (result.items || [])
          .filter((d) => d.decisionDefinitionId === selected.decisionDefinitionId)
          .sort((a, b) => b.version - a.version)[0];
        if (latest && latest.decisionDefinitionKey !== selected.decisionDefinitionKey) {
          setSelected(latest);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDecisions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDeployed() {
    // /decision-definitions/search is eventually consistent — wait a bit
    // before re-fetching so the new version actually shows up.
    setTimeout(() => {
      setRefreshSignal((s) => s + 1);
      loadDecisions();
    }, 2500);
  }

  return (
    <>
      <div className="hint">
        Edit a DMN decision table inline, deploy it as a new version, and re-run an agent in the
        Simulator tab to see the rule change take effect — no Modeler, no IT pipeline.
      </div>
    <div className="rule-manager">
      <aside className="rule-manager__sidebar">
        <DecisionList
          decisions={decisions}
          selectedId={selected?.decisionDefinitionId}
          onSelect={setSelected}
          loading={loading}
          error={error}
          onRefresh={loadDecisions}
        />
      </aside>
      <section className="rule-manager__main">
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
      </section>
    </div>
    </>
  );
}

function App() {
  const [tab, setTab] = useState('simulator');

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
        {tab === 'simulator' && <AgentSimulator />}
        {tab === 'rules' && <RuleManager />}
      </main>
    </div>
  );
}

export default App;
