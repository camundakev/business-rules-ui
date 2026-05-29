// Single source of truth for the agent attributes available in the Create
// New Lead Program condition builder. Imported by both the builder UI
// (to drive attribute / operator / value controls) and the DMN generator
// (to emit correct typeRef annotations and FEEL literals).
//
// `dmnType` is the DMN 1.3 typeRef used in inputExpression typeRef.
// `inputControl` tells the UI which control to render for the value field:
//   - 'dropdown'      → <select> populated from `values`
//   - 'numberInput'   → numeric <input type="number">
//   - 'textInput'     → plain <input type="text">

export const ATTRIBUTE_SCHEMA = [
  {
    name: 'agentStatus',
    label: 'Agent Status',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['Active', 'Active Reinstated', 'Retired'],
  },
  {
    name: 'agentTenure',
    label: 'Agent Tenure',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['Contract <= 6 months', '1st Prior', '2nd Prior', '3rd Prior'],
  },
  {
    name: 'complianceRating',
    label: 'Compliance Rating',
    dmnType: 'integer',
    inputControl: 'numberInput',
    min: 1,
    max: 5,
    step: 1,
  },
  {
    name: 'agentProactiveStatus',
    label: 'Proactive Status',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['Proactive', 'Not Proactive'],
  },
  {
    name: 'licenseType',
    label: 'License Type',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['Life', 'Life + Health'],
  },
  {
    name: 'councilStatus',
    label: 'Council Status',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: [
      'No Council',
      'Quality Council',
      "President's Council",
      "Chairman's Council",
    ],
  },
  {
    name: 'attemptRate',
    label: 'Attempt Rate',
    dmnType: 'double',
    inputControl: 'numberInput',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'monthsBehindProactive',
    label: 'Months Behind Proactive',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['—', '2 Months behind', '4+ Months behind'],
  },
  {
    name: 'certificationTraining',
    label: 'Certification Training',
    dmnType: 'string',
    inputControl: 'dropdown',
    values: ['On Track', 'Not On Track'],
  },
  {
    name: 'rollingFYC',
    label: 'Rolling FYC',
    dmnType: 'double',
    inputControl: 'numberInput',
    min: 0,
    step: 1,
  },
];

export const OPERATORS = ['=', '!=', '<', '<=', '>', '>='];

export const CONDITION_RELATIONSHIPS = ['AND', 'OR'];

export const ELIGIBILITY_OUTPUTS = [
  { name: 'isEligible', label: 'Eligible', dmnType: 'boolean' },
  { name: 'ineligibilityReason', label: 'Reason', dmnType: 'string' },
];

export function getAttribute(name) {
  return ATTRIBUTE_SCHEMA.find((a) => a.name === name);
}

export function isNumericAttribute(name) {
  const a = getAttribute(name);
  return a?.dmnType === 'integer' || a?.dmnType === 'double' || a?.dmnType === 'number';
}
