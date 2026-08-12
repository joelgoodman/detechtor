# Resume point — 2026-08-12

## Done and shipped
- **PR #16** — UNI-237 detection precision. Stacked on **#15** (UNI-235); base is
  `joelgoodman/uni-235-semantic-category-audit`, **not main**. Review #15 first.
  Gate at 0 violations, `npm test` green, tree clean, pushed.
- **UNI-141** — miner prototype `scripts/mine-patterns.js` committed + full write-up posted as a
  Linear comment.

## Next: benchmark-agent evidence capture, before Friday's cohort
Friday's cron fires on its own. **Nothing should trigger a scan early.** The Docker rebuild and
deploy to connolly can happen any day this week; only the *run* is boundary-bound.

1. **Push `joelgoodman/ai-visibility-batch` first** — it is main + 1 commit (`471c4a3`) and exists
   **only on this machine**. Then branch the capture work off `main` (`69386ec`).
2. **C12 — `js_globals`.** Contract already written in `docs/DATA_CONTRACTS.md`; consumer shipped in
   detechtor (UNI-225); **producer unbuilt**. Probe list generates from the patterns via
   `node scripts/emit-js-probe.js --names-only` — never hardcode it. 3,062 patterns declare `js`;
   109 signal-category technologies set a global and leave nothing in markup.
3. **C13 (headers, 580 patterns) and C14 (cookies, 314) — to be written.** Copy C12's shape exactly:
   generate the name list from the patterns, store only what is present, absent = NOT PROBED.
   **Cookie NAMES only, never values. Filter `set-cookie` out of headers.** Both are additive keys
   in the jsonb bundle the agent already writes — no migration, no schema-guardian blast radius.
4. **Do NOT ship UNI-237's pattern changes in Friday's cohort.** Pin the currently published
   `@speedyu/detechtor`. Capturing new evidence is additive and safe; changing what 5,000
   institutions detect as, on unreviewed changes, in the same run, is not.
5. **The deploy is a production action — bring it to Joel, do not do it unilaterally.**

## Highest-value follow-up on the gate (not a blocker)
The breadth gate's `strongest` baseline is computed from `scripts`/`scriptSrc` — the channel it does
not screen — so a noisier script pattern *earns* a technology more html breadth. Fixing it (screen
the script channel; compute `strongest` only from channels that have passed a breadth screen) closes
that and the unscreened-scripts gap together. The replacement for the dictionary screen is measured
and ready: **word-boundary survival rate**, offenders 0–13% vs legitimate vendors 72–100%, no lexicon
needed. Full detail in `docs/uni-237-handoff.md` under "Known gaps in what was built".

## Practical notes for whoever picks this up
- Corpus runs take ~30 min each (`npm run breadth`, `npm run prevalence`). Detect completion with a
  sentinel file, and check processes with `ps -eo pid,comm,args | awk '$2=="node" && /name/'` —
  a plain `grep` matches your own shell and has caused a wrong-process kill in this project twice.
- zsh does **not** word-split unquoted `$var`. Use `${=var}` in loops; this broke three checks here.
- When an agent is working in this tree, `git add` explicit paths and check
  `git diff --cached --name-only` — a `git commit` once swept up an agent's staged files.
