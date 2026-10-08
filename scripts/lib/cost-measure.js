// scripts/lib/cost-measure.js -- measure what a regex COSTS on adversarial input, in child processes.
//
// The static rules (regex-shape.js) say what a regex looks like; this says what it does. It exists
// because nothing ever measured runtime cost: `i.*clicker` passed four precision lints and cost 67% of
// all match CPU. Every regex is run against 1 MB single-line adversarial inputs under a hard time
// budget, in a child process the parent can kill, so a catastrophic one fails the build instead of
// hanging it.
//
// Two layers of "cannot hang the suite":
//   1. the child runs each test under a vm timeout (interrupts the regex in practice);
//   2. the parent watches every child and SIGKILLs one that stops answering (the backstop for
//      anything the vm timeout fails to interrupt), records the job as `hung`, and carries on.
'use strict';
const cp = require('child_process');
const os = require('os');
const path = require('path');

const DEFAULT_WORKER = path.join(__dirname, 'cost-worker.js');

/**
 * @param {string[]} sources regex sources (each measured once)
 * @param {object} opts
 *   budgetMs   a regex whose slowest input exceeds this is `slow`
 *   timeoutMs  per-input vm timeout (default 4 x budget); reaching it is `timeout`
 *   hardMs     the parent kills a child silent for this long (default 20 s) -> `hung`
 *   workers    child processes (default min(4, cpus))
 *   exhaustive also run the pump (unbroken-run) inputs
 *   workerPath override the child script (tests use a worker that never answers)
 * @returns {Promise<Map<string, {maxMs:number, shape:string|null, status:'ok'|'slow'|'timeout'|'hung'|'error', shapes:object}>>}
 */
function measureSources(sources, opts = {}) {
  const budgetMs = opts.budgetMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? budgetMs * 4;
  const hardMs = opts.hardMs ?? 20000;
  const workers = Math.max(1, opts.workers ?? Math.min(4, (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
  const workerPath = opts.workerPath || DEFAULT_WORKER;
  const unique = [...new Set(sources)];
  const results = new Map();
  let next = 0;

  return new Promise((resolve, reject) => {
    let live = 0;
    let finished = false;
    const done = () => { if (!finished && next >= unique.length && live === 0) { finished = true; resolve(results); } };

    function slot() {
      live++;
      let child = null;
      let current = null;
      let lastSeen = Date.now();
      let watchdog = null;

      const settle = (i, rec) => { results.set(unique[i], rec); };
      const classify = (r) => {
        if (r.error) return { maxMs: 0, shape: null, status: 'error', shapes: {}, error: r.error };
        let maxMs = 0; let shape = null;
        for (const [s, ms] of Object.entries(r.shapes)) if (ms >= maxMs) { maxMs = ms; shape = s; }
        const status = r.timedOut.length ? 'timeout' : maxMs > budgetMs ? 'slow' : 'ok';
        return { maxMs, shape, status, shapes: r.shapes };
      };

      function feed() {
        if (next >= unique.length) { stop(); return; }
        current = next++;
        lastSeen = Date.now();
        child.send({ type: 'job', i: current, source: unique[current], exhaustive: !!opts.exhaustive, timeoutMs });
      }
      function spawn() {
        child = cp.fork(workerPath, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        child.on('message', (m) => {
          lastSeen = Date.now();
          if (m.ready) { feed(); return; }
          settle(m.i, classify(m));
          current = null;
          feed();
        });
        child.on('error', (e) => { stop(); reject(e); });
        child.on('exit', () => {
          // An exit while a job is in flight is a crash of that job; do not retry it forever.
          if (current !== null) { settle(current, { maxMs: Infinity, shape: null, status: 'hung', shapes: {} }); current = null; }
          if (!finished && next < unique.length && !stopped) spawn(); else if (!stopped) stop();
        });
      }
      let stopped = false;
      function stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(watchdog);
        if (child && child.connected) child.disconnect();
        if (child) child.kill('SIGKILL');
        live--;
        done();
      }
      watchdog = setInterval(() => {
        if (current !== null && Date.now() - lastSeen > hardMs) {
          // Silent for too long: it is stuck in a regex the vm timeout did not interrupt.
          settle(current, { maxMs: Infinity, shape: null, status: 'hung', shapes: {} });
          current = null;
          child.removeAllListeners('exit');
          child.kill('SIGKILL');
          if (next < unique.length) spawn(); else stop();
        }
      }, Math.min(500, hardMs / 4));
      spawn();
    }

    if (!unique.length) { resolve(results); return; }
    for (let w = 0; w < Math.min(workers, unique.length); w++) slot();
  });
}

module.exports = { measureSources, DEFAULT_WORKER };
