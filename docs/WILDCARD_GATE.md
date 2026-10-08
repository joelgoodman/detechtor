# The wildcard cost gate

An unbounded wildcard in a detection regex (`.*`, `.+`, `[^"]*`, `\s*`, `\w+`, `{n,}`) is a **runtime-cost
bug**, not a precision problem. V8 retries a regex from every start position, so on a page that is
minified onto one line the wildcard rescans to the end of the line from each start letter: quadratic in
page size. `i.*clicker` cost 67% of all match CPU over a 300-institution sample; one 3.35 MB page took
124 s on `canva.*for.*schools` alone.

It had been "fixed" at least four times and kept coming back, because every earlier attempt judged the
pattern's **text** (longest literal run, dictionary words, corpus fire rate) and fixed the offenders those
heuristics could see. `i.*clicker` has a seven-letter literal and sailed through all of them. Nothing
measured runtime cost, and nothing banned the construct. This does both, and applies to what the engine
**loads**, not to the source files: the generated upstream file is re-imported and brings wildcards back.

```
npm test                              # runs the gate (static + measured): ~13 s of the ~19 s the whole chain takes
npm run lint:cost                     # report only
npm run lint:cost:exhaustive          # + unbroken-run ("pump") inputs, see "What it cannot catch"
node scripts/rewrite-unbounded-wildcards.js --corpus <dir> [--write]   # fix offenders with evidence
```

## What is checked

`scripts/lint-pattern-cost.js` loads the effective pattern set through the engine's own loader
(generated artifact, curated files, identity merge, category/removal/rewrite layers) and takes every
string the engine hands to `new RegExp`, in every channel: `html`, `scripts`, `scriptSrc`, `url`, `xhr`,
`network`, `headers`, `meta`, `cookies`, the regexes inside `dom` rules, and `version`.
`tests/pattern-cost-gate.test.js` fails if `src/detechtor.js` gains a `new RegExp(` site that has no
channel here, and the gate fails on any definition field it has not classified, so a new channel
cannot hide.

### 1. Static rules (`scripts/lib/regex-shape.js`, a real parser, not string matching)

| rule | fails |
|---|---|
| `unbounded-span` | `*`, `+` or `{n,}` over `.`, a negated class `[^x]`, `\s \S \w \W \D`, a class containing one of those (`[\s\S]`, `[\w\W]`, `[\w-]`) or as wide as `\w` (`[a-z0-9_-]`), or a repeated group of single-character alternatives (`(?:.\|\n)*`) |
| `multiple-wildcards` | two or more of those on one match path (`a.*b.*c`) |
| `nested-quantifier` | an unbounded repeat inside an unbounded repeat whose characters overlap what may come next: `(a+)+b`, `(.*x)*`. `(?:\d+\.)+` is fine: the `.` the next iteration needs can never be absorbed by `\d+` |
| `ambiguous-alternation` | an unbounded repeat of alternatives that can start with the same character or be empty: `(a\|a)*`, `(a\|ab)+` |
| `unbounded-run` | an unbounded repeat of a narrower class as the **first** thing in the pattern: `\d+x`, `[a-f0-9]{8,}x` |
| `huge-bound` | `{0,100000}`: bounded on paper, unbounded in practice (cap 1000) |

**When an unbounded wildcard is allowed.** Only where it cannot rescan:

* **terminal**: nothing follows it (`foo.*`), so there is nothing to backtrack into and `test()` stops
  at its first success. A following `$`, group or repetition makes it rescan again;
* **in a `^`-anchored branch** (`^AMP Plugin v(\d+\.\d+.*)$`): one start position. No `m` flag is ever
  used. A second wildcard in the same branch is still `multiple-wildcards`.

An unanchored **leading** wildcard (`.*foo`) is the *worst* position, not an exempt one: measured on this
V8, `/.*foo/i` on a 200 KB line with no `foo` takes 22.8 s, `/foo.*bar/i` on `foofoofoo…` 5.9 s,
`/\d+x/` on a 200 KB digit run 30.7 s, `/[a-z0-9-]+\.js/` on a letter run 25.7 s.

### 2. Measured cost

Every distinct regex is run against **two 1 MB single-line adversarial inputs** (three with
`--exhaustive`), in a child process, under a hard budget of **250 ms per regex**:

* **dense**: lowercase letters with `<` `>` `/` `=` `"` and digits mixed as markup mixes them (seeded,
  so every run measures the same text);
* **near-miss**: the pattern's own literal prefixes, repeated, never completing (`i.*clicker` → `i i i i …`),
  so every position starts a match attempt that runs as far as the pattern lets it and fails;
* **pump** (exhaustive only): one unbroken run of a character the pattern's repeated atoms accept.

Each child runs the test under a `vm` timeout; the parent additionally watches every child and
`SIGKILL`s one that goes silent, recording the job as `hung`. A regex that cannot finish fails the build
instead of hanging it. The test is warmed first (V8 interprets a regex once before compiling it) and the
slower of two runs is discarded above 20 ms so one GC pause cannot fail the build.

**Calibration.** Run over the shipped set *before* any rewrite (6,330 distinct regexes): 5,682 took
<= 1 ms, 107 <= 5 ms, 16 between 5 and 100 ms, none between 100 and 250 ms, and 525 were over 250 ms
(524 hit the 1 s timeout; the 525th was a statically clean `<[^>]{1,512}\bwire:` at 422 ms). The slowest
*legitimate* regex was 54 ms (`ps[^<>\n]{0,80}powerschool`). After the rewrite the slowest is ~119 ms. 250 ms
is 2x that, 4.6x the old legitimate maximum and 1.7x under the lowest failing value, so a loaded CI machine
does not flake the build and a quadratic pattern cannot slip under it. (The rewriter targets half the budget,
125 ms, so a bound it chooses has 2x headroom.)

**Wall clock.** The whole measured pass is ~13 s for 6,342 distinct regexes with 4 child processes (on a
machine that was also running an 8-core job), so it runs in full inside `npm test` and no regex is ever
skipped. It scales with the number of regexes, not with how many are slow: a slow one costs at most the
1 s vm timeout per input.

An allowlisted pattern is exempt from the *static* rules only; it must still pass the measured budget.

### 3. Hygiene

* `patterns/wildcard-allowlist.json`: one entry per exception, `{technology, channel, pattern, reason,
  maxSpan, worstCaseMs}`. A stale entry (pattern gone), a no-op entry (pattern no longer offends), a
  duplicate, or one without a real reason, a measured span and a measured cost fails the build, and
  `tests/pattern-cost-gate.test.js` caps the file's length (`MAX_ALLOWLIST`), so adding an exception
  is a visible change to a test.
* `patterns/pattern-rewrites.json`: a rule whose original text is no longer present fails the build.

## What it cannot catch

Be sceptical of a green run. It cannot see:

* **Ambiguity that first-character reasoning cannot see.** The alternation check compares what each
  alternative can START with; ambiguity that lives inside a sequence, not between alternatives, is only
  seen when the nested-repeat check's follow-set test happens to cover it.
* **Adjacent unbounded atoms over overlapping sets when neither is a span-eater and neither leads**: `a\d+\d+x` (cubic on `a000…`; only `--exhaustive` finds it). The leading form `\d+\d+x` is `unbounded-run`.
* **A run that sits inside its own run but is not the first thing**: `x[a-z]+y` on `xaxaxa…` (a leading run
  inside an optional or repeated group too: `(?:(\d+\.)+\d+/)?lib\.js`). `--exhaustive` finds the
  ones a pump input provokes (`x[a-z]+y`, `a\d+\d+x`, the version idiom), and it currently flags 49
  regexes, all of them upstream version-capture idioms on script URLs and link hrefs
  (`(?:((?:\d+\.)+\d+)/)?amazeui\.js` ...): quadratic only on an unbroken digit-and-dot run, and only in
  channels whose input is one URL. That run is not in `npm test`.
* **Back-reference blowup** (`(.+)\1`) and cost driven by look-around.
* **Nested bounds**: `(?:[^<>]{0,80}x){0,80}` is 6,400 steps per start and passes the static rules; only
  the measured check sees it, and only if the adversarial inputs reach it.
* **Anything about input shape the three inputs do not model**: they are 1 MB single lines. A regex
  that is only slow on a particular real page (many newlines, a long unbroken base64 blob) is invisible.
  A bound above ~250 over a 1–2 character prefix is expensive on exactly that kind of page and is caught
  only when the near-miss input hits it.
* **Cost that is not regex**: cheerio parsing, the dom plan, `Array#some` over thousands of script URLs.
* **Cost of a regex the engine compiles but the gate does not know about**: covered by the `new RegExp(` site
  test and the unclassified-field check, but a new *evidence source* that feeds an existing channel with
  much bigger inputs (a 50 MB response body into `html`) changes the budget's meaning without any test failing.
* **Precision.** A bounded `a.{0,80}b` can still match unrelated prose. This gate is about cost.

## Fixing a failure

1. **Bound it.** `[^<>\n]{0,80}` inside a tag, `.{0,80}` otherwise. A wildcard that is the first or last
   thing in a branch is redundant for `test()`: delete it (`.*altcha\.js` ≡ `altcha\.js`).
2. **Or let the tool do it with evidence:**
   `node scripts/rewrite-unbounded-wildcards.js --corpus <dir>` (dry run) then `--write`. It measures the
   real span of each wildcard on the corpus, sets `bound = max(80, 2 × observed max)` rounded up (250 with
   no observation, never the floor), and writes a rewrite only if old and new are **identical** over the
   whole corpus. Anything else goes to `patterns/wildcard-review.tsv` with the evidence for a one-line
   decision (`patterns/wildcard-decisions.json`).
3. **Last resort**: an allowlist entry. It needs a measured span and cost, and `MAX_ALLOWLIST` in
   `tests/pattern-cost-gate.test.js` raised on purpose.

Where it writes: a technology defined in a curated file (`patterns/higher-ed-*.json`, …) is edited in
that file with a minimal diff; a technology that comes from `patterns/generated/` gets an entry in
`patterns/pattern-rewrites.json`, a load-time layer (`src/pattern-rewrites.js`) that names the exact
original text. Never edit `patterns/generated/` by hand: the importer rewrites it wholesale.

## The importer

`npm run update-patterns` evaluates the effective pattern set **with the candidate artifact in place**
and, if it carries any banned shape, throws with the offenders listed before writing anything (neither the
artifact nor the report that records its hash). `--keep-candidate FILE` saves what would have been
written; run the rewriter with `--candidate FILE --write`, then import again. A rewrite names the original
text, so it survives the next import: tested in `tests/import-guard.test.js`. The measured half of the gate
runs in `npm test` right after.
