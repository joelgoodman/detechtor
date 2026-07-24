# detval — deTECHtor on/off recall harness (UNI-145 + UNI-156)

Compares full-crawl (OFF) vs `--skip-crawl` multi-URL (ON) detection over a fixed 20-institution set,
and reports big-signal-category recall. Rehomed into the repo under UNI-156.

- `run.sh` — runs deTECHtor twice per institution (OFF = crawl homepage; ON = `--skip-crawl` on
  home+admissions+program). Needs network + Chrome. `DET` resolves to the repo root from this dir.
- `analyze.js <dir>` — off/on tech-count, name retention, and big-signal recall (8 signal categories).
- `floored.js <dir> [floor=50]` — same, filtered to a confidence floor.

BIG signal set = the UNI-156 signal categories: CMS, LMS, SIS, CRM, Chatbot, Site Search,
Accessibility, Marketing Automation.

Run: `bash tests/detval/run.sh && node tests/detval/floored.js <output-dir> 50`
(Live-network; run on Connolly or a box with Chrome. Not part of `npm test`.)
