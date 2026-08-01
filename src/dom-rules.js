// src/dom-rules.js — the `dom` field shape contract.
//
// Pattern files carry `dom` in three on-disk shapes. The engine historically understood none
// of them (it regex-tested a fixed six-key `evidence.dom` bag, while patterns key `dom` on CSS
// selectors), so all 1,456 dom-carrying techs were dead. This module is the single conversion
// point into one internal rule form:
//
//   { selector, kind: 'exists'|'text'|'attributes'|'properties', name?, regex? }
//
// It THROWS on anything it cannot represent. That is deliberate: the defect being fixed is
// silent death, so an unrepresentable rule must fail loudly at load rather than quietly never
// firing. Callers that want tolerance must catch explicitly.
//
// On-disk vocabulary, enumerated across all 11 pattern files (2026-08-01):
//   attributes 163 · text 63 · exists 19 · properties 1

const CONDITION_KEYS = new Set(['attributes', 'text', 'exists', 'properties']);

/**
 * @param {object} def a technology definition (may or may not carry `dom`)
 * @returns {Array<{selector:string, kind:string, name?:string, regex?:string}>}
 */
function normalizeDomRules(def) {
  const dom = def && def.dom;
  if (dom === undefined || dom === null) return [];

  const rules = [];

  // Shape 3: dom = ["selector", …] — existence alone is the whole rule.
  if (Array.isArray(dom)) {
    for (const selector of dom) {
      if (typeof selector !== 'string') {
        throw new TypeError(
          `dom array entries must be selector strings, got ${typeof selector}: ${JSON.stringify(selector)}`,
        );
      }
      rules.push({ selector, kind: 'exists' });
    }
    return rules;
  }

  if (typeof dom !== 'object') {
    throw new TypeError(`dom must be an object or array of selectors, got ${typeof dom}`);
  }

  for (const [selector, value] of Object.entries(dom)) {
    // Shape 1: dom.<selector> = "regex" — match against the element's text.
    if (typeof value === 'string') {
      rules.push({ selector, kind: 'text', regex: value });
      continue;
    }

    // Shape 2: dom.<selector> = { attributes | text | exists | properties }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(
        `dom["${selector}"] must be a regex string or a condition object, got ${Array.isArray(value) ? 'array' : typeof value}`,
      );
    }

    for (const [key, condition] of Object.entries(value)) {
      if (!CONDITION_KEYS.has(key)) {
        throw new TypeError(
          `dom["${selector}"] has unknown condition "${key}" (expected one of: ${[...CONDITION_KEYS].join(', ')})`,
        );
      }

      if (key === 'exists') {
        rules.push({ selector, kind: 'exists' });
      } else if (key === 'text') {
        rules.push({ selector, kind: 'text', regex: String(condition) });
      } else {
        // attributes / properties: an object of name -> regex
        if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
          throw new TypeError(
            `dom["${selector}"].${key} must be an object of name->regex, got ${typeof condition}`,
          );
        }
        for (const [name, regex] of Object.entries(condition)) {
          rules.push({ selector, kind: key, name, regex: String(regex) });
        }
      }
    }
  }

  return rules;
}

module.exports = { normalizeDomRules, CONDITION_KEYS };
