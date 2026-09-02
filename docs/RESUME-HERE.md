# Resume point — 2026-09-02

_Supersedes the 2026-08-12 resume point. Full assessment with evidence:
`~/LLM/BenchmarkCentral/docs/handoffs/detechtor-assessment-2026-09-02.md`. Read that first._

## Reality check before touching patterns

- **deTECHtor produces nothing in production and has not since 2026-07-17.** Connolly's
  `docker-compose.server.yml` sets `ENABLE_TECH_DETECTION=false` — an **uncommitted** edit; the tracked
  copy in `benchmark-agent` still says `true`. Cohorts 133–135: 0 of ~5,000 scans carry
  `technology_stack`. `technology_detections` 0, `tech_scan_logs` last row 2026-07-16,
  `latest_technology_stack` NULL on all 5,132 active institutions (UNI-157 trigger wipe).
- **C12 `js_globals` IS live** (correcting the 08-12 note: cohort 133 has it on 22,350 of 23,568
  `scan_pages`, raw HTML in Wasabi for 22,454). Nothing consumes it. UNI-143's post-run pass was
  never built despite Done — reopened to Todo 2026-09-02; `detectTiered` is the library, no caller.
- **Fleet runs `f18e015`** (= main minus UNI-233). Has UNI-224/225/226; lacks UNI-233/235/237.
- **The agent persists at `DETECHTOR_MIN_CONFIDENCE=50`; a lone `html` match scores 40.** Measured
  on 114 corpus homepages: that floor drops 15% of all and **36% of signal-category** detections
  (Salesforce Education Cloud, Canvas LMS, HubSpot for Education, Algolia, Umbraco, D2L, TargetX,
  Element451). Do not carry it into any consumer.

## Done and shipped in this repo
- **PR #16** — UNI-237 detection precision. Stacked on **#15** (UNI-235); base is
  `joelgoodman/uni-235-semantic-category-audit`, **not main**. Both MERGEABLE/CLEAN, **0 human
  reviews**. Real code: #15 = 8 files / 871 lines; #16 = 17 files / ~2,000 lines (the +250k is
  `patterns/dictionary.txt` + artifacts). `npm test` exit 0 on this branch (2026-09-02).
- `node scripts/uni-237-summary.js`: 78 html + 12 script patterns removed, 151 never-fireable
  technologies deleted, 6,347 loaded, detections 86,645 → 70,745.
- UNI-235's 24 deferred suspects: Ghost 613 → 14, 20 deleted as never-fireable. **3 left**, all
  judgment calls: PWA (678, manifest capability), ServiceNow (36), Salesforce Live Agent (27).
- **UNI-141** — miner prototype `scripts/mine-patterns.js` + write-up on the Linear ticket.

## Next, in order
1. **Reconcile the compose drift + land UNI-157** (COALESCE the `latest_*` trigger, Alembic +
   schema-guardian). Prerequisites for anything writing tech again.
2. **Joel reviews #15 then #16**, merge, re-pin `@speedyu/detechtor` in benchmark-agent
   (`rm -rf node_modules/@speedyu/detechtor && npm install` — npm will not re-resolve a changed git
   spec otherwise).
3. **Build the consumer (UNI-143):** per cohort, Wasabi HTML (`content_archive_key`) + `js_globals`
   → `detectTiered` → `populate_technology_detections` path in `supabase_integration.rb`, invoked
   from `post_cohort.sh`. Replace the 50 floor. Keep `requires`/`implies` off (see
   `docs/uni-237-handoff.md`).
4. **Prove it on the next cohort**: diff vs WhatCMS (cohort 107) + BuiltWith `tech_profile`, run
   `scripts/base-rate-report.js`. That is the evidence UNI-138 needs to close.
5. Only then the pattern tail, gated by the production diff: gate baseline fix + word-boundary
   survival rate + screen the `scripts` channel (below), UNI-141 no-pattern techs (Sitefinity,
   HubSpot CMS, Sakai, Ingeniux, TrustArc — **not** WordPress/Drupal), C13 headers / C14 cookie names.

Deploying to the fleet is a **production action — bring it to Joel**. Do not trigger a scan early;
the Friday cron owns runs.

## Highest-value follow-up on the gate (not a blocker)
The breadth gate's `strongest` baseline is computed from `scripts`/`scriptSrc` — the channel it does
not screen — so a noisier script pattern *earns* a technology more html breadth. Fix: screen the script
channel; compute `strongest` only from channels that have passed a breadth screen. The replacement for
the dictionary screen is measured and ready: **word-boundary survival rate**, offenders 0–13% vs
legitimate vendors 72–100%, no lexicon needed. Detail in `docs/uni-237-handoff.md` under "Known gaps".
Do this **before** a large batch of mined patterns lands (`Cengage` `scripts:["cengage"]` matched
`civicengagement` unscreened).

## Practical notes for whoever picks this up
- Corpus is **homepage-only, from 2026-07-16** (4,215 institutions, 1.1 GB, gitignored). A multi-page
  refresh is `scripts/wasabi-fetch-institutions.js` / `scripts/wasabi-corpus.js` — a deliberate pull
  (~21k objects), and exclude the 8% unscannable captures from denominators (UNI-231).
- Corpus runs take ~30 min each (`npm run breadth`, `npm run prevalence`). Detect completion with a
  sentinel file, and check processes with `ps -eo pid,comm,args | awk '$2=="node" && /name/'` —
  a plain `grep` matches your own shell and has caused a wrong-process kill in this project twice.
- zsh does **not** word-split unquoted `$var`. Use `${=var}` in loops; this broke three checks here.
- When an agent is working in this tree, `git add` explicit paths and check
  `git diff --cached --name-only` — a `git commit` once swept up an agent's staged files.
- DB counts without a SQL tool: PostgREST from inside `speedyu-scan-request-worker` on Connolly
  (`docker exec -i speedyu-scan-request-worker node - < script.js`; `SUPABASE_SECRET_KEY` is a new-style
  key → `apikey` header only, no Bearer). The local `benchmark-agent/.env.production` is a placeholder.
