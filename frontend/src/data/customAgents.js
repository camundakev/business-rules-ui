// User-created sample agents, persisted to localStorage. The Agent
// Simulator merges these with the five hardcoded demo AGENTS from
// agents.js — clicking a card selects either source. Custom agents
// can be deleted from their card; hardcoded ones cannot.

const STORAGE_KEY = 'nyl-rules-poc:custom-agents';

export function loadCustomAgents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomAgents(agents) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // localStorage may be unavailable (private mode, quota). Custom
    // agents degrade to session-local — not fatal.
  }
}

// Replace any existing agent with the same agentCode, otherwise append.
// Returns the new list.
export function upsertCustomAgent(current, agent) {
  const next = [...current.filter((a) => a.agentCode !== agent.agentCode), { ...agent }];
  saveCustomAgents(next);
  return next;
}

export function removeCustomAgent(current, agentCode) {
  const next = current.filter((a) => a.agentCode !== agentCode);
  saveCustomAgents(next);
  return next;
}
