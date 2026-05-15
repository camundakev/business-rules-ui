// Lightweight DMN 1.3 parser. The unified editor uses this to load an
// existing decision into the rule-row builder: extracts the table
// schema (inputs / outputs / hit policy) AND the existing rules so
// Edit Rules opens on the current configuration, not a blank slate.
//
// FEEL decoding is intentionally narrow — it covers the shapes the
// builder itself emits plus the seed-DMN expressions used in this
// project (plain literals, simple comparisons, not(…)). Anything more
// exotic (intervals, function calls, complex expressions) falls
// through as a literal "=" condition, which the user will see in the
// builder and can edit. Unknown attributes are silently dropped from
// rule conditions — those rules then surface in the builder with
// whatever conditions DID parse.

const DMN_NS = 'https://www.omg.org/spec/DMN/20191111/MODEL/';

function localName(el) {
  return el.localName ?? el.tagName.replace(/^.*:/, '');
}

function findFirstByLocal(el, name) {
  if (!el) return null;
  for (const child of el.children) {
    if (localName(child) === name) return child;
  }
  return null;
}

function findAllByLocal(el, name) {
  if (!el) return [];
  return Array.from(el.children).filter((c) => localName(c) === name);
}

function decodeFeelString(text) {
  // Strip outer quotes and unescape `\"`. Anything else is returned as-is.
  const m = text.match(/^"(.*)"$/s);
  if (!m) return text;
  return m[1].replace(/\\"/g, '"');
}

// Decode a single FEEL input cell against an input's typeRef.
// Returns { operator, value } when the cell carries a constraint, or
// null when the cell is empty / a "match anything" dash.
function parseFeelInputEntry(text, typeRef) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed === '-') return null;

  // not(<inner>) → !=
  const notMatch = trimmed.match(/^not\(\s*([\s\S]*?)\s*\)$/);
  if (notMatch) {
    return { operator: '!=', value: parseInputValue(notMatch[1].trim(), typeRef) };
  }

  // Comparison operators followed by a literal.
  const cmpMatch = trimmed.match(/^(>=|<=|>|<|!=)\s*([\s\S]+)$/);
  if (cmpMatch) {
    return { operator: cmpMatch[1], value: parseInputValue(cmpMatch[2].trim(), typeRef) };
  }

  // Otherwise treat as a bare literal → equality.
  return { operator: '=', value: parseInputValue(trimmed, typeRef) };
}

function parseInputValue(literal, typeRef) {
  if (isNumericType(typeRef)) {
    // Bare number — leave the string form, the form state stores strings
    // and the generator coerces at emit time.
    return literal;
  }
  if (typeRef === 'boolean') {
    return literal === 'true' ? 'true' : 'false';
  }
  return decodeFeelString(literal);
}

// Decode a FEEL output literal back to the form's value representation.
// Booleans become 'true'/'false' strings; strings are unquoted; numbers
// are kept as their string form. Empty cells default to a type-aware
// empty value.
function parseFeelOutputLiteral(text, typeRef) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    if (typeRef === 'boolean') return 'false';
    return '';
  }
  if (typeRef === 'boolean') {
    return trimmed === 'true' ? 'true' : 'false';
  }
  if (typeRef === 'string') {
    return decodeFeelString(trimmed);
  }
  return trimmed;
}

function isNumericType(typeRef) {
  return (
    typeRef === 'integer' ||
    typeRef === 'double' ||
    typeRef === 'long' ||
    typeRef === 'number'
  );
}

export function parseDmnXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error(`Failed to parse DMN XML: ${parserError.textContent}`);
  }

  // Try NS-aware first, then fall back to local-name traversal.
  let decision =
    doc.getElementsByTagNameNS(DMN_NS, 'decision')[0] ||
    doc.getElementsByTagName('decision')[0];
  if (!decision) throw new Error('No <decision> element in DMN');

  const table =
    findFirstByLocal(decision, 'decisionTable') ||
    decision.getElementsByTagNameNS(DMN_NS, 'decisionTable')[0] ||
    decision.getElementsByTagName('decisionTable')[0];
  if (!table) throw new Error('No <decisionTable> element in DMN');

  const hitPolicy = table.getAttribute('hitPolicy') || 'UNIQUE';

  const inputs = findAllByLocal(table, 'input').map((inputEl, idx) => {
    const exprEl = findFirstByLocal(inputEl, 'inputExpression');
    const textEl = exprEl ? findFirstByLocal(exprEl, 'text') : null;
    return {
      id: inputEl.getAttribute('id') || `Input_${idx + 1}`,
      label: inputEl.getAttribute('label') || '',
      typeRef: exprEl?.getAttribute('typeRef') || 'string',
      expression: textEl?.textContent?.trim() || '',
    };
  });

  const outputs = findAllByLocal(table, 'output').map((outEl, idx) => ({
    id: outEl.getAttribute('id') || `Output_${idx + 1}`,
    name: outEl.getAttribute('name') || '',
    label: outEl.getAttribute('label') || outEl.getAttribute('name') || '',
    typeRef: outEl.getAttribute('typeRef') || 'string',
  }));

  // Decode rules. Each rule becomes { conditions: [...], outputValues: {} }
  // — the same shape the form state uses, so they can be dropped straight
  // into useState initializers.
  const ruleEls = findAllByLocal(table, 'rule');
  const decoded = ruleEls.map((ruleEl) => {
    const inputEntries = findAllByLocal(ruleEl, 'inputEntry');
    const outputEntries = findAllByLocal(ruleEl, 'outputEntry');

    const conditions = [];
    inputEntries.forEach((ie, colIdx) => {
      const input = inputs[colIdx];
      if (!input) return;
      const text = findFirstByLocal(ie, 'text')?.textContent ?? '';
      const parsed = parseFeelInputEntry(text, input.typeRef);
      if (!parsed) return;
      // The attribute name is the input expression text (e.g. "agentStatus").
      conditions.push({
        attribute: input.expression,
        operator: parsed.operator,
        value: parsed.value,
      });
    });

    const outputValues = {};
    outputEntries.forEach((oe, colIdx) => {
      const output = outputs[colIdx];
      if (!output) return;
      const text = findFirstByLocal(oe, 'text')?.textContent ?? '';
      outputValues[output.name] = parseFeelOutputLiteral(text, output.typeRef);
    });

    return { conditions, outputValues };
  });

  // Heuristic: if the last decoded rule has zero conditions, treat it as
  // the catch-all fallback row (matches the builder's own emit shape).
  // Otherwise the DMN has no explicit fallback and the caller falls back
  // to type-aware defaults.
  let rules = decoded;
  let fallbackOutputValues = null;
  if (rules.length > 0 && rules[rules.length - 1].conditions.length === 0) {
    fallbackOutputValues = rules[rules.length - 1].outputValues;
    rules = rules.slice(0, -1);
  }

  return {
    decisionId: decision.getAttribute('id'),
    decisionName: decision.getAttribute('name'),
    hitPolicy,
    inputs,
    outputs,
    rules,
    fallbackOutputValues,
  };
}
