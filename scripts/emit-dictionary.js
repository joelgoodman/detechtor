#!/usr/bin/env node
// scripts/emit-dictionary.js — emit the category + technology dictionary as JSON (UNI-223).
//
// The shared DB's `categories` / `technologies` / `technology_aliases` tables are regenerated from
// THIS output by speedyu-benchmark's app/scripts/load_tech_dictionary.py on every re-pin, so the
// vocabulary cannot drift from what the engine evaluates. Categories are canonical names with
// overrides already applied (the same resolution a detection reports).
//
// Usage:
//   node scripts/emit-dictionary.js                     # JSON to stdout, version = git HEAD
//   node scripts/emit-dictionary.js --version f18e015   # pin the version string explicitly
'use strict';
const { execSync } = require('node:child_process');
const path = require('node:path');
const DeTECHtor = require('../src/detechtor.js');
const { mapCategory, CANONICAL_CATEGORIES, SIGNAL_CATEGORIES } = require('../src/category-mapping.js');
const { resolvedCategories } = require('../src/category-overrides.js');

function gitVersion() {
  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function buildDictionary({ version } = {}) {
  const engine = new DeTECHtor();
  const aliases = require('../patterns/technology-aliases.json').aliases || {};
  const technologies = Object.entries(engine.patterns).map(([name, def]) => {
    const categories = [...new Set(resolvedCategories(def).map(mapCategory))].filter((c) => c !== 'Unknown');
    return {
      name,
      description: def.description || '',
      website: def.website || '',
      categories,
      curated: def._curated === true,
      is_signal: categories.some((c) => SIGNAL_CATEGORIES.has(c)),
      is_higher_ed: def.higher_ed === true,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    detechtor_version: version || gitVersion(),
    generated_at: new Date().toISOString(),
    pattern_count: technologies.length,
    categories: [...CANONICAL_CATEGORIES].sort(),
    signal_categories: [...SIGNAL_CATEGORIES],
    technologies,
    aliases,
  };
}

if (require.main === module) {
  const i = process.argv.indexOf('--version');
  const version = i === -1 ? undefined : process.argv[i + 1];
  process.stdout.write(JSON.stringify(buildDictionary({ version })));
}

module.exports = { buildDictionary };
