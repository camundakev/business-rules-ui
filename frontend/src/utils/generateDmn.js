// Programmatic DMN 1.3 XML generation for the "Create New Lead Program"
// flow. Each rule becomes one row in the decision table; conditions within
// a rule are AND-ed across input columns. Between rules, the FIRST hit
// policy gives OR semantics — the first matching row wins. Outputs are
// user-defined: each output is a column whose per-row value the builder
// supplies. No synthetic catch-all is emitted; if the user wants a default
// outcome they add their own broad-matching rule.

export const ATTRIBUTES = [
  { name: 'agentStatus', label: 'Agent Status', type: 'string' },
  { name: 'agentTenure', label: 'Agent Tenure', type: 'string' },
  { name: 'complianceRating', label: 'Compliance Rating', type: 'number' },
  { name: 'agentProactiveStatus', label: 'Proactive Status', type: 'string' },
  { name: 'licenseType', label: 'License Type', type: 'string' },
  { name: 'councilStatus', label: 'Council Status', type: 'string' },
  { name: 'attemptRate', label: 'Attempt Rate', type: 'number' },
  { name: 'monthsBehindProactive', label: 'Months Behind Proactive', type: 'string' },
  { name: 'nylicuTraining', label: 'NYLIC University Training', type: 'string' },
  { name: 'rollingFYC', label: 'Rolling FYC', type: 'number' },
];

export const OPERATORS = ['=', '!=', '<', '<=', '>', '>='];
export const OUTPUT_TYPES = ['boolean', 'string', 'number'];

// FEEL identifier rule used for output variable names — letter or underscore
// to start, then alphanumerics or underscores.
export const VARIABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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

function attributeByName(name) {
  return ATTRIBUTES.find((a) => a.name === name);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function feelInputEntry({ attribute, operator, value }) {
  const attr = attributeByName(attribute);
  const type = attr?.type ?? 'string';
  const literal = type === 'number'
    ? String(Number(value))
    : `"${String(value).replace(/"/g, '\\"')}"`;
  if (operator === '=') return literal;
  if (operator === '!=') return `not(${literal})`;
  return `${operator} ${literal}`;
}

function feelOutputEntry(value, type) {
  if (value === '' || value === null || value === undefined) return '';
  if (type === 'boolean') {
    return value === true || value === 'true' ? 'true' : 'false';
  }
  if (type === 'number') {
    return String(Number(value));
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function generateDmnXml({ programName, outputs, rules }) {
  const id = slugify(programName);
  const escapedName = escapeXml(programName);

  // Collect input columns: the union of attributes referenced across rules,
  // ordered by the canonical ATTRIBUTES list so column order is predictable.
  const usedAttrNames = new Set();
  rules.forEach((rule) => {
    rule.conditions.forEach((c) => usedAttrNames.add(c.attribute));
  });
  const inputAttrs = ATTRIBUTES.filter((a) => usedAttrNames.has(a.name));

  const inputXml = inputAttrs
    .map(
      (attr, idx) => `
      <input id="Input_${idx + 1}" label="${escapeXml(attr.label)}">
        <inputExpression id="InputExpression_${idx + 1}" typeRef="${attr.type}">
          <text>${attr.name}</text>
        </inputExpression>
      </input>`,
    )
    .join('');

  const outputXml = outputs
    .map(
      (o, idx) =>
        `      <output id="Output_${idx + 1}" label="${escapeXml(o.label || o.name)}" name="${o.name}" typeRef="${o.type}"/>`,
    )
    .join('\n');

  const ruleXmls = rules.map((rule, ruleIdx) => {
    const inputEntries = inputAttrs
      .map((attr, colIdx) => {
        const cond = rule.conditions.find((c) => c.attribute === attr.name);
        const text = cond ? escapeXml(feelInputEntry(cond)) : '';
        return `<inputEntry id="InputEntry_${ruleIdx + 1}_${colIdx + 1}"><text>${text}</text></inputEntry>`;
      })
      .join('\n        ');

    const outputEntries = outputs
      .map((o, outIdx) => {
        const raw = rule.outputValues?.[o.id];
        const text = escapeXml(feelOutputEntry(raw, o.type));
        return `<outputEntry id="OutputEntry_${ruleIdx + 1}_${outIdx + 1}"><text>${text}</text></outputEntry>`;
      })
      .join('\n        ');

    return `      <rule id="Rule_${ruleIdx + 1}">
        ${inputEntries}
        ${outputEntries}
      </rule>`;
  });

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
    <decisionTable id="DecisionTable_${id}" hitPolicy="FIRST">
${inputXml}

${outputXml}

${ruleXmls.join('\n\n')}

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
