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
  return deployResources([{ filename, content }]);
}

// Multi-resource deployment. Camunda 8 v2 /deployments accepts multiple
// resources in a single multipart form — all are versioned atomically as a
// single deployment record.
export async function deployResources(resources) {
  const form = new FormData();
  for (const { filename, content } of resources) {
    const blob = new Blob([content], { type: 'application/xml' });
    form.append('resources', blob, filename);
  }
  const res = await fetch(`${BASE}/deployments`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /deployments → ${res.status}: ${text}`);
  }
  return res.json();
}

// Delete a deployed resource by its key. For DMNs the key is the
// decisionRequirementsKey (the DRG that owns the decision); deleting the
// DRG removes all decisions it contains. Each deployed version is its own
// DRG, so removing every version of a DMN requires one call per version.
//
// Added in Camunda 8.6; response body added in 8.9 (older clusters may
// return 204). https://docs.camunda.io/docs/apis-tools/orchestration-cluster-api-rest/specifications/delete-resource/
export async function deleteResource(resourceKey, { deleteHistory = false } = {}) {
  const res = await fetch(`${BASE}/resources/${resourceKey}/deletion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ deleteHistory }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /resources/${resourceKey}/deletion → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return null;
}

// Evaluate a decision by id. Used as a definitive runtime probe after
// deletion: if Zeebe returns 404 NOT_FOUND, the decision is genuinely
// gone from the runtime even if the search index still lists it.
// Returns { ok: true, result } on success or { ok: false, status, body }
// on failure — does not throw so callers can branch on status.
export async function evaluateDecision(decisionDefinitionId, variables = {}) {
  const res = await fetch(`${BASE}/decision-definitions/evaluation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ decisionDefinitionId, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true, result: await res.json() };
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
