// The Lead Program registry is the single source of truth for the Agent
// Simulator's program selector. Each entry maps a human-readable display
// name to the three decision IDs the BPMN dispatches its FEEL-bound
// business rule tasks against.
//
// The default seed entry references the original deployed DMN IDs so the
// five hardcoded demo agents resolve correctly out of the box. New
// programs created through the New Lead Program flow follow the
// slug-based naming convention.
//
// The registry is hydrated on app load by scanning Camunda's deployed
// decision definitions for {slug}-eligibility / {slug}-recommendation /
// {slug}-unenrollment triples (see hydrateFromDecisionDefinitions). This
// makes programs survive page refreshes and recover gracefully if the
// in-memory addProgram() call ever fails to propagate.

export const DEFAULT_PROGRAM = Object.freeze({
  displayName: 'Default Lead Program',
  eligibilityId: 'eligibility-rules',
  recommendationId: 'recommendation-rules',
  unenrollmentId: 'unenrollment-rules',
});

export function seedRegistry() {
  return [DEFAULT_PROGRAM];
}

// Returns a new registry with the given program appended. If an entry
// with the same displayName already exists it is replaced — keeps the
// list deduped when the user reuses a name.
export function addProgram(registry, program) {
  const filtered = registry.filter((p) => p.displayName !== program.displayName);
  return [...filtered, Object.freeze({ ...program })];
}

// Returns a new registry with the given displayName removed. The default
// program is never removed even if requested — callers must guard against
// that case in their UI, but this is a safety net.
export function removeProgram(registry, displayName) {
  if (displayName === DEFAULT_PROGRAM.displayName) return registry;
  return registry.filter((p) => p.displayName !== displayName);
}

// True if a registry entry is the immutable default seed (not deletable).
export function isDefaultProgram(program) {
  return program?.displayName === DEFAULT_PROGRAM.displayName;
}

// All decision IDs known to the registry, used by the audit-log lookup
// in the Results panel to translate a raw decision ID back to its
// program's display name and role (eligibility / recommendation /
// unenrollment).
export function findProgramByDecisionId(registry, decisionId) {
  for (const p of registry) {
    if (p.eligibilityId === decisionId) return { program: p, role: 'eligibility' };
    if (p.recommendationId === decisionId) return { program: p, role: 'recommendation' };
    if (p.unenrollmentId === decisionId) return { program: p, role: 'unenrollment' };
  }
  return null;
}

// Given a Camunda decision-definitions/search payload, infer Lead Programs
// from the deployed DMNs. Returns one registry entry per "{slug}-eligibility"
// decision that also has matching "-recommendation" and "-unenrollment"
// siblings. The display name is recovered from the eligibility decision's
// `name` field by stripping the " · Eligibility" suffix when present.
//
// Always prepends DEFAULT_PROGRAM. Programs already in the supplied
// existing registry (matched by displayName) are preserved unchanged so
// in-memory additions don't get clobbered by re-hydration.
export function hydrateFromDecisionDefinitions(items, existing = seedRegistry()) {
  const latestById = new Map();
  for (const item of items ?? []) {
    const id = item.decisionDefinitionId;
    if (!id) continue;
    const prior = latestById.get(id);
    if (!prior || (item.version ?? 0) > (prior.version ?? 0)) {
      latestById.set(id, item);
    }
  }

  const inferred = [];
  for (const [id, item] of latestById) {
    if (!id.endsWith('-eligibility')) continue;
    const slug = id.slice(0, -'-eligibility'.length);
    const recId = `${slug}-recommendation`;
    const unId = `${slug}-unenrollment`;
    if (!latestById.has(recId) || !latestById.has(unId)) continue;
    inferred.push({
      displayName: stripEligibilitySuffix(item.name) || slug,
      eligibilityId: id,
      recommendationId: recId,
      unenrollmentId: unId,
    });
  }

  // Preserve any in-memory entries (including the default), then add
  // inferred entries that don't collide on displayName.
  const byName = new Map(existing.map((p) => [p.displayName, p]));
  for (const p of inferred) {
    if (!byName.has(p.displayName)) {
      byName.set(p.displayName, Object.freeze(p));
    }
  }
  return Array.from(byName.values());
}

function stripEligibilitySuffix(name) {
  if (!name) return '';
  return name.replace(/\s*[·•]\s*Eligibility\s*$/i, '').trim();
}
