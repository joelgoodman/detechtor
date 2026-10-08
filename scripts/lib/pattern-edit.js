// scripts/lib/pattern-edit.js -- change a pattern string inside a curated JSON file with a MINIMAL diff.
//
// The curated files are not uniformly formatted (four of them do not survive a JSON.stringify
// round-trip), and a fix that re-indents a whole file buries the change it exists to make. So edits are
// made by finding the exact string token in the exact technology and field and swapping that one token.
// The result is then parsed and compared with the same edit applied to the parsed object; any
// disagreement throws instead of writing.
'use strict';
const assert = require('assert');

const WS = /\s/;

function skipString(t, i) {
  for (i++; i < t.length; i++) {
    if (t[i] === '\\') i++;
    else if (t[i] === '"') return i + 1;
  }
  throw new SyntaxError('unterminated string');
}

function skipWs(t, i) { while (i < t.length && WS.test(t[i])) i++; return i; }

/** End index (exclusive) of the JSON value starting at i. */
function skipValue(t, i) {
  const c = t[i];
  if (c === '"') return skipString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const d = t[i];
      if (d === '"') { i = skipString(t, i) - 1; continue; }
      if (d === '{' || d === '[') depth++;
      else if (d === '}' || d === ']') { depth--; if (depth === 0) return i + 1; }
    }
    throw new SyntaxError('unterminated container');
  }
  let j = i;
  while (j < t.length && !/[,}\]\s]/.test(t[j])) j++;
  return j;
}

/** Members of the object whose `{` is at `start`: [{key, valueStart, valueEnd}] */
function members(t, start) {
  const out = [];
  let i = skipWs(t, start + 1);
  while (t[i] !== '}') {
    const keyEnd = skipString(t, i);
    const key = JSON.parse(t.slice(i, keyEnd));
    i = skipWs(t, keyEnd);
    if (t[i] !== ':') throw new SyntaxError('expected :');
    i = skipWs(t, i + 1);
    const valueEnd = skipValue(t, i);
    out.push({ key, valueStart: i, valueEnd });
    i = skipWs(t, valueEnd);
    if (t[i] === ',') i = skipWs(t, i + 1);
  }
  return out;
}

/** Elements of the array whose `[` is at `start`. */
function elements(t, start) {
  const out = [];
  let i = skipWs(t, start + 1);
  while (t[i] !== ']') {
    const end = skipValue(t, i);
    out.push({ valueStart: i, valueEnd: end });
    i = skipWs(t, end);
    if (t[i] === ',') i = skipWs(t, i + 1);
  }
  return out;
}

const member = (t, objStart, key) => members(t, objStart).find((m) => m.key === key);

function applyToObject(root, e) {
  const def = root[e.tech];
  if (e.field === 'dom') {
    const v = def.dom[e.selector];
    if (e.kind === 'text') { if (typeof v === 'string') def.dom[e.selector] = e.to; else v.text = e.to; }
    else v[e.kind][e.name] = e.to;
  } else if (Array.isArray(def[e.field])) {
    def[e.field] = def[e.field].map((p) => (p === e.from ? e.to : p));
  } else {
    def[e.field][e.key] = e.to;
  }
}

/**
 * @param {string} text the file
 * @param {Array<{tech, field, from, to, key?, selector?, kind?, name?}>} edits
 * @returns {string} the edited file text
 */
function editJsonText(text, edits) {
  const root = JSON.parse(text);
  const start = skipWs(text, 0);
  const spans = [];

  for (const e of edits) {
    if (!root[e.tech] || typeof root[e.tech] !== 'object') throw new Error(`no technology "${e.tech}"`);
    const techM = member(text, start, e.tech);
    const fieldM = member(text, techM.valueStart, e.field);
    if (!fieldM) throw new Error(`edit not found: ${e.tech}.${e.field} is absent`);
    const want = JSON.stringify(e.from);
    const hits = [];

    if (e.field === 'dom') {
      const selM = member(text, fieldM.valueStart, e.selector);
      if (selM) {
        if (text[selM.valueStart] === '"') hits.push(selM);
        else {
          const inner = e.kind === 'text' ? member(text, selM.valueStart, 'text') : member(text, selM.valueStart, e.kind);
          if (inner && e.kind === 'text') hits.push(inner);
          else if (inner) { const leaf = member(text, inner.valueStart, e.name); if (leaf) hits.push(leaf); }
        }
      }
    } else if (text[fieldM.valueStart] === '[') {
      hits.push(...elements(text, fieldM.valueStart));
    } else if (text[fieldM.valueStart] === '{') {
      const m = member(text, fieldM.valueStart, e.key);
      if (m) hits.push(m);
    }

    const matched = hits.filter((h) => text.slice(h.valueStart, h.valueEnd) === want);
    if (!matched.length) throw new Error(`edit not found: ${e.tech}.${e.field} has no ${want}`);
    for (const h of matched) spans.push({ start: h.valueStart, end: h.valueEnd, text: JSON.stringify(e.to) });
    applyToObject(root, e);
  }

  let out = text;
  for (const s of spans.sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  assert.deepStrictEqual(JSON.parse(out), root, 'the textual edit disagrees with the parsed edit; refusing to write');
  return out;
}

module.exports = { editJsonText, members, elements };
