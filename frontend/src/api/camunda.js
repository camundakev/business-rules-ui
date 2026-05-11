// Camunda 8 v2 REST API wrapper.
// All calls go through the Vite dev-server proxy at /api/* — the proxy
// injects the OAuth bearer token, so no auth concerns in this module.

const BASE = '/api/v2';

async function jsonRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

// ─── Rule Manager ────────────────────────────────────────────────────────────

export function listDecisionDefinitions({ filter, sort, page } = {}) {
  return jsonRequest('/decision-definitions/search', {
    method: 'POST',
    body: { filter, sort, page },
  });
}

export function getDecisionDefinition(decisionDefinitionKey) {
  return jsonRequest(`/decision-definitions/${decisionDefinitionKey}`);
}

export function getDecisionDefinitionXml(decisionDefinitionKey) {
  return jsonRequest(`/decision-definitions/${decisionDefinitionKey}/xml`, {
    headers: { Accept: 'application/xml, text/xml, */*' },
  });
}

export async function deployResource({ filename, content }) {
  const form = new FormData();
  const blob = new Blob([content], { type: 'application/xml' });
  form.append('resources', blob, filename);

  const res = await fetch(`${BASE}/deployments`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /deployments → ${res.status}: ${text}`);
  }
  return res.json();
}

export function listDecisionInstances({ filter, sort, page } = {}) {
  return jsonRequest('/decision-instances/search', {
    method: 'POST',
    body: { filter, sort, page },
  });
}

// ─── Agent Simulator ─────────────────────────────────────────────────────────

export function startProcessInstance({
  processDefinitionId,
  variables,
  awaitCompletion = true,
  requestTimeout = 30_000,
}) {
  return jsonRequest('/process-instances', {
    method: 'POST',
    body: {
      processDefinitionId,
      variables,
      awaitCompletion,
      requestTimeout,
    },
  });
}

export function getProcessInstance(processInstanceKey) {
  return jsonRequest(`/process-instances/${processInstanceKey}`);
}

export function listVariables({ processInstanceKey, filter, sort, page } = {}) {
  const merged = processInstanceKey
    ? { ...filter, processInstanceKey }
    : filter;
  return jsonRequest('/variables/search', {
    method: 'POST',
    body: { filter: merged, sort, page },
  });
}

export function listDecisionInstancesForProcess(processInstanceKey) {
  return listDecisionInstances({
    filter: { processInstanceKey },
    sort: [{ field: 'evaluationDate', order: 'asc' }],
  });
}
