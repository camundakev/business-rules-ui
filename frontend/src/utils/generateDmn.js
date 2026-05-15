// Programmatic DMN 1.3 XML generator. Used by:
//
//   1. The New Lead Program flow — generates the eligibility DMN with
//      the canonical isEligible / ineligibilityReason outputs and FIRST
//      hit policy. Caller supplies rules + program name.
//
//   2. The unified editor's Edit Rules mode — regenerates an existing
//      DMN (recommendation, unenrollment, or eligibility) with the same
//      output column schema and hit policy, but with new rule rows /
//      per-row output values authored in the builder UI.
//
// Rule shape:
//   A rule corresponds to one row in the decision table. Conditions
//   inside a rule are AND-ed across input columns. Between rules,
//   FIRST hit policy gives OR semantics (the first matching row wins).
//   Each rule carries its own outputValues so different rows can emit
//   different output column values.
//
// Inputs:
//   - programName              free-text display name. Slugified into the
//                              decision id when decisionId is not provided.
//   - rules                    array of { conditions, outputValues }.
//                              conditions: [{ attribute, operator, value }]
//                              outputValues: { [outputName]: feel-value }
//   - decisionId / decisionName  override the decision id and name on
//                                the generated DMN (used when regenerating
//                                an existing DMN: preserve identity).
//   - outputs                  optional [{ name, label, dmnType }]. When
//                              omitted defaults to ELIGIBILITY_OUTPUTS.
//   - fallbackOutputValues     optional { [outputName]: feel-value } —
//                              emitted by the trailing catch-all rule.
//                              When omitted, sensible defaults are used
//                              (isEligible:false / ineligibilityReason:
//                              "Does not match … criteria").
//   - hitPolicy                optional; defaults to 'FIRST'.
//
// A trailing fallback rule (all-dashed inputs) is always appended so
// downstream gateways always have a defined output, even with FIRST policy.

import { ELIGIBILITY_OUTPUTS, getAttribute } from './attributeSchema.js';

export function slugify(name) {
  let s = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'lead-program';
  if (/^[0-9]/.test(s)) s = `program-${s}`;
  return s;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isNumericDmnType(t) {
  return t === 'integer' || t === 'double' || t === 'number' || t === 'long';
}

function feelLiteral(attr, value) {
  if (isNumericDmnType(attr.dmnType)) {
    return String(Number(value));
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function feelInputEntry({ attribute, operator, value }) {
  const attr = getAttribute(attribute);
  if (!attr) return '';
  const literal = feelLiteral(attr, value);
  if (operator === '=') return literal;
  if (operator === '!=') return `not(${literal})`;
  return `${operator} ${literal}`;
}

// Render a single FEEL output literal given the output's DMN type. The
// caller supplies values as plain JS strings/booleans/numbers from form
// inputs; this function quotes them appropriately for FEEL.
function feelOutputLiteral(value, dmnType) {
  if (value === '' || value === null || value === undefined) {
    return dmnType === 'boolean' ? 'false' : '""';
  }
  if (dmnType === 'boolean') {
    return value === true || value === 'true' ? 'true' : 'false';
  }
  if (isNumericDmnType(dmnType)) {
    return String(Number(value));
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function defaultMatchValues(outputs) {
  // For the canonical eligibility outputs, "match" = isEligible:true /
  // ineligibilityReason:"". For any other output schema, default each
  // output to a type-appropriate empty value.
  const out = {};
  for (const o of outputs) {
    if (o.name === 'isEligible') out[o.name] = 'true';
    else if (o.name === 'ineligibilityReason') out[o.name] = '';
    else if (o.dmnType === 'boolean') out[o.name] = 'true';
    else out[o.name] = '';
  }
  return out;
}

function defaultFallbackValues(outputs, programName) {
  const out = {};
  for (const o of outputs) {
    if (o.name === 'isEligible') out[o.name] = 'false';
    else if (o.name === 'ineligibilityReason') out[o.name] = `Does not match ${programName} criteria`;
    else if (o.dmnType === 'boolean') out[o.name] = 'false';
    else out[o.name] = '';
  }
  return out;
}

export function generateDmnXml({
  programName,
  rules,
  decisionId,
  decisionName,
  outputs = ELIGIBILITY_OUTPUTS,
  fallbackOutputValues,
  hitPolicy = 'FIRST',
}) {
  const id = decisionId || slugify(programName);
  const displayName = decisionName || programName;
  const escapedName = escapeXml(displayName);
  const fallbackValues = fallbackOutputValues ?? defaultFallbackValues(outputs, programName);

  // Build input columns from the union of attributes referenced across
  // all rules, deduplicated. Order follows first appearance.
  const seen = new Set();
  const inputAttrs = [];
  for (const rule of rules) {
    for (const c of rule.conditions ?? []) {
      if (seen.has(c.attribute)) continue;
      const attr = getAttribute(c.attribute);
      if (!attr) continue;
      seen.add(c.attribute);
      inputAttrs.push(attr);
    }
  }

  const inputXml = inputAttrs
    .map(
      (attr, idx) => `      <input id="Input_${idx + 1}" label="${escapeXml(attr.label)}">
        <inputExpression id="InputExpression_${idx + 1}" typeRef="${attr.dmnType}">
          <text>${attr.name}</text>
        </inputExpression>
      </input>`,
    )
    .join('\n');

  const outputXml = outputs
    .map(
      (o, idx) =>
        `      <output id="Output_${idx + 1}" label="${escapeXml(o.label || o.name)}" name="${o.name}" typeRef="${o.dmnType || o.typeRef || 'string'}"/>`,
    )
    .join('\n');

  function outputEntriesXml(ruleId, valuesMap) {
    return outputs
      .map((o, outIdx) => {
        const raw = valuesMap?.[o.name];
        const text = escapeXml(feelOutputLiteral(raw, o.dmnType || o.typeRef || 'string'));
        return `        <outputEntry id="OutputEntry_${ruleId}_${outIdx + 1}"><text>${text}</text></outputEntry>`;
      })
      .join('\n');
  }

  // One rule per row. Within a rule, each input column carries the
  // FEEL expression for the rule's condition on that attribute, or "-"
  // if no condition in the rule references it. Each rule's outputValues
  // populate its output cells; falling back to defaults when missing.
  const matchRules = rules.map((rule, gIdx) => {
    const ruleId = gIdx + 1;
    const conds = rule.conditions ?? [];
    const inputEntries = inputAttrs
      .map((attr, colIdx) => {
        const cond = conds.find((c) => c.attribute === attr.name);
        const text = cond ? escapeXml(feelInputEntry(cond)) : '-';
        return `        <inputEntry id="InputEntry_${ruleId}_${colIdx + 1}"><text>${text}</text></inputEntry>`;
      })
      .join('\n');
    const values = rule.outputValues ?? defaultMatchValues(outputs);
    return `      <rule id="Rule_Match_${ruleId}">
${inputEntries}
${outputEntriesXml(ruleId, values)}
      </rule>`;
  });

  const fallbackIdx = matchRules.length + 1;
  const fallbackInputs = inputAttrs
    .map(
      (_, colIdx) =>
        `        <inputEntry id="InputEntry_${fallbackIdx}_${colIdx + 1}"><text>-</text></inputEntry>`,
    )
    .join('\n');
  const fallbackRule = `      <rule id="Rule_Fallback">
${fallbackInputs}
${outputEntriesXml(fallbackIdx, fallbackValues)}
      </rule>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="Definitions_${id}"
             name="${escapedName}"
             namespace="http://camunda.org/schema/dmn/nyl/lead-program/${id}"
             exporter="NYL Lead Program Builder"
             exporterVersion="1.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.9.0">

  <decision id="${id}" name="${escapedName}">
    <decisionTable id="DecisionTable_${id}" hitPolicy="${hitPolicy}">
${inputXml}

${outputXml}

${matchRules.join('\n\n')}

${fallbackRule}

    </decisionTable>
  </decision>

  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_${id}">
      <dmndi:DMNShape id="DMNShape_${id}" dmnElementRef="${id}">
        <dc:Bounds height="80" width="180" x="160" y="100"/>
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;
}
