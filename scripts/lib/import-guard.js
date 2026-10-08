// scripts/lib/import-guard.js -- refuse to write a generated artifact that brings the construct back.
//
// patterns/generated/webappanalyzer-merged.json is rewritten WHOLESALE from upstream by
// scripts/import-webappanalyzer.js, so every import is a chance for an unbounded wildcard to return:
// the upstream corpus is full of them, and the engine would load them unless something in the
// curated layers already covers each one. This asks the question BEFORE the artifact is written: with
// the candidate in the generated slot, plus every curated file, override and rewrite the engine loads
// on top of it, does the effective set pass the gate's static rules?
//
// If not, the import fails with the offenders listed and NOTHING is written. The next step is
// `node scripts/rewrite-unbounded-wildcards.js --corpus <dir> --candidate <file> --write`, which bounds
// them with corpus evidence and records the result in patterns/pattern-rewrites.json (which survives
// the import because it names the original text). The MEASURED half of the gate (1 MB adversarial
// inputs) is slower and runs in `npm test` right after the import.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../src/config.js');
const { loadEffective } = require('./pattern-channels.js');
const { checkStatic, loadAllowlist, formatViolation } = require('./cost-gate.js');

/**
 * @param {object} mergedPatterns the artifact content that WOULD be written
 * @returns {{violations: object[], unclassified: Map, candidatePath: string|null}}
 */
function guardImport(mergedPatterns, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detechtor-import-'));
  const candidate = path.join(dir, 'webappanalyzer-merged.json');
  try {
    fs.writeFileSync(candidate, JSON.stringify(mergedPatterns));
    const patternPaths = [...config.patternPaths];
    patternPaths[0] = candidate; // the generated slot is always first
    const effective = loadEffective({ patternPaths });
    const checked = checkStatic(effective, { allowlist: opts.allowlist || loadAllowlist() });
    return { violations: checked.violations, unclassified: checked.unclassified, total: checked.total };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

class ImportGuardError extends Error {
  constructor(result) {
    const lines = result.violations.slice(0, 80).map((v) => `  - ${formatViolation(v)}`);
    const more = result.violations.length > 80 ? `\n  … ${result.violations.length - 80} more` : '';
    super(
      `import refused: ${result.violations.length} regex(es) in the effective pattern set carry an unbounded wildcard ` +
      `(or another shape banned by scripts/lib/regex-shape.js).\nNothing was written.\n${lines.join('\n')}${more}\n\n` +
      'Fix: save the candidate (re-run with --keep-candidate), then\n' +
      '  node scripts/rewrite-unbounded-wildcards.js --corpus <dir> --candidate <file> --write\n' +
      'which bounds each one with corpus evidence, or add a reviewed entry to patterns/wildcard-allowlist.json.',
    );
    this.name = 'ImportGuardError';
    this.violations = result.violations;
  }
}

module.exports = { guardImport, ImportGuardError };
