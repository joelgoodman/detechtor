# Category-id remap decisions (UNI-156 Phase 1, Task 1.2)

Source of truth: `docs/category-id-audit.json` (empirical audit of every numeric category id the
un-audited Wappalyzer base uses, with count + sample techs). Curated partials' id usage (verified
2026-07-16 via `node -e` over the actual JSON, not assumed):

- `higher-ed-cms.json` → `[1]`
- `higher-ed-lms.json` → `[21, 53]`
- `higher-ed-sis.json` → `[53]`
- `higher-ed-infra.json` → `[6, 10, 14, 29, 32, 52, 53, 98]`
- `higher-ed-accessibility.json` → `[111]`

Curated-used id set: `{1, 6, 10, 14, 21, 29, 32, 52, 53, 98, 111}`. Per the controller's explicit
rule, **the only curated-used id re-tagged in this pass is `111`** (rule 3 below); every other
curated-used id is left untouched even where the audit sample suggests it's mislabeled — those are
called out as concerns at the bottom instead of silently changed.

## Rule 1 — safe polluter remaps (base-only ids, not curated-used)

| id | old name | new name | justification (sample techs) |
|----|----------|----------|-------------------------------|
| 87 | CMS | **WordPress Plugin** | 238 techs: AMP for WordPress, Advanced Custom Fields, Akismet, All in One SEO Pack, Asgaros Forum, Astra Widgets, Autoptimize, Beaver Builder — WP plugins, not a CMS. |
| 96 | CMS | **Widget** | 35 techs: Bazaarvoice Curation, Ceros, Cevoid, ContentGems, ContentStudio, Foleon, Foursixty — embeddable content/UGC widgets, not a CMS. |
| 89 | CMS | **Localization** | 15 techs: Bablic, ConveyThis, GTranslate, Linguise, Polylang, Smartling, WPML, Weglot — translation/localization tools, not a CMS. |
| 5  | LMS | **Widget** | 198 techs: AccuWeather, AddShoppers, AddThis, AddToAny, Airtable, Algolia DocSearch, AnswerDash, Answerbase, Arena — generic embeddable widgets/services, not an LMS. |

These four kill the named-product bug the task targets: WooCommerce `[6,87]`, Email Encoder for
WordPress `[5,87]`, Juicer `[96]`, Weglot `[89]` no longer resolve to any signal category.

## Rule 2 — explicitly untouched

| id | name | reason |
|----|------|--------|
| 6 | Web Server | Curated infra uses it; WooCommerce's false-CMS bug is already fixed via the `87` remap, not `6`. |
| 52 | Chatbot | Sample (AINIRO, Acquire Live Chat, Ada, Aircall, Aivo, Alive5, ApexChat, Apple Business Chat, ArrowChat, ArtiBot) is genuinely live-chat. Trusting these is a later gate's job (Task 4), not this map's. |

## Rule 3 — id 111 collision (curated Accessibility vs. base Fundraising)

Base id `111` (39 techs: ActBlue, AlumnIQ, Arreva, BRYNK, BackerKit, Blackbaud CRM, Buy me a
coffee, Classy, Click & Pledge, Community Funded, DonorPerfect, Donorbox, EveryAction, FundRazr,
Fundraise Up) is unambiguously **fundraising / donor-management / advancement** tooling — not
accessibility. But `patterns/higher-ed-accessibility.json` (5 hand-curated, data-mined entries:
AudioEye, UserWay, accessiBe, Monsido, Siteimprove) was tagged `cats: [111]`, so the shared id was
overloaded between two unrelated meanings.

Resolution:
- New dedicated id **`306` → `Accessibility`** (unused integer, picked clear of the base's 1–111
  range and clear of the new `305` Site Search id below).
- `patterns/higher-ed-accessibility.json`: all 5 entries re-tagged `cats: [111]` → `cats: [306]`.
  Only the `cats` array changed — descriptions, `signal_polarity`, confidence, etc. are untouched.
- Base `111` renamed **`Fundraising`** (not a signal category) — it now correctly describes the 39
  donor/advancement techs and no longer collides with the curated accessibility id.

## Rule 4 — new Site Search id (registration only, Phase 3 fills it) — SUPERSEDED

~~New id `305` → `Site Search`. No entries carry it yet; Phase 3's data-mined patterns will.~~
Superseded by the Fix pass (see "Resolved (Fix pass...)" below): base id `29` already carries 16
curated search-vendor patterns and its audit sample is genuinely Site Search, so `29` was made the
canonical Site Search id instead and the placeholder `305` was removed. Phase 3 should target `29`.

## Rule 5 — kept as-is (genuine signal ids, controller pre-approved)

| id | name |
|----|------|
| 1  | CMS (448 techs — real CMS platforms: AbhiCMS, Adobe Experience Manager, Agility CMS, Ametys, ApostropheCMS, Arc XP…) |
| 53 | SIS (335 techs, curated-used by sis/lms/infra — left untouched per controller instruction even though the sample skews CRM/chat-flavored; not remapped without sign-off) |
| 52 | Chatbot (see rule 2) |
| 6  | Web Server (see rule 2) |

## Rule 6 — sweep of the rest: every id whose *current* name is a signal-category name

Every id below currently resolves to `CMS` or `CRM` in `src/category-mapping.js` but its audit
sample is clearly something else. None of these ids are curated-used (id `98` is the one exception
— see Concerns), so all are remapped freely.

### Currently mis-tagged `CRM` (ids 54–56 — none of the three are genuinely CRM)

| id | old | new | justification |
|----|-----|-----|----------------|
| 54 | CRM | **SEO Tool** | Ahrefs, All in One SEO Pack, Alli, Atomseo, Attracta, Auto HQ, Avada SEO, BrightEdge, BrightLocal, RankMath SEO — SEO tooling. |
| 55 | CRM | **Financial Software** | Akaunting, Carta, Ignition, Iress, Jibres, Taxdome, Tiller — accounting/fintech, not CRM. |
| 56 | CRM | **Cryptomining** | CoinHive, CoinHive Captcha, Coinhave, Coinimp, Crypto-Loot, deepMiner, JSEcoin, Minero.cc, Minerstat — browser cryptojacking scripts. |

Net effect: after this pass, no base id currently resolves to `CRM`. `CRM` remains a valid
protected signal-category name (for future/curated use); it's just not populated from the
un-audited base right now — consistent with the mission (stop *false positives*, not force a
match).

### Currently mis-tagged `CMS` (the `57, 58, 80–106` block)

| id | old | new | justification |
|----|-----|-----|----------------|
| 57 | CMS | **Static Site Generator** | Astro, Bridgetown, Cecil, Docusaurus, Eleventy, Gatsby, Gridsome, Hexo, Hugo, Jekyll, Lume, Mintlify, Next.js, Nextra — SSG frameworks, not CMS platforms. |
| 58 | CMS | **Product Onboarding** | Appcues, Chameleon, Elevio, Pendo, Poper, Stonly, Toonimo, Userflow — in-app guidance/digital-adoption tools. |
| 80 | CMS | **WordPress Theme** | AFThemes CoverNews, AitThemes, AndersNoren Baskerville/Fukasawa/Hemingway, Astra, Auberge, aThemes Airi/Astrid/Hiero — WP theme names. |
| 81 | CMS | **Ecommerce** | Shoptimized — a Shopify conversion theme (1 tech; folded into the Ecommerce bucket used by 100/102/106). |
| 82 | CMS | *(left unchanged — see Concerns)* | 0 techs in the current merged base (`docs/category-id-audit.json` has no entry; confirmed via direct scan of `webappanalyzer-merged.json`). No sample to justify a target; flagged rather than guessed. |
| 83 | CMS | **Fraud Detection** | ClientJS, FingerprintJS, MaxMind, ThreatMetrix, TruValidate — device fingerprinting/fraud tooling. |
| 84 | CMS | **Loyalty Program** | BON Loyalty, Beans, Captain Up, Extole, Gameball, Kangaroo Rewards, LoyaltyLion, Loyoly — ecommerce loyalty/rewards. |
| 85 | CMS | **Product Management Tool** | Beamer, FlagSmith, LaunchDarkly, LaunchNotes, Split, Statsig, Upvoty, Usersnap — feature-flagging/changelog/feedback tools. |
| 86 | CMS | **Data Management Platform** | Adobe Audience Manager, Cxense, Oracle BlueKai, Salesforce Audience Studio/Interaction Studio, Tealium AudienceStream — audience DMPs. |
| 87 | CMS | **WordPress Plugin** | see Rule 1. |
| 88 | CMS | **Hosting Provider** | ALL-INKL, Acquia Cloud Site Factory, Bluehost, Contabo, DreamHost, Drupal Multisite, FastComet, Flywheel — web hosts. |
| 89 | CMS | **Localization** | see Rule 1. |
| 90 | CMS | **Reviews** | Alchemer Mobile, Ali Reviews, Appzi, Bazaarvoice Reviews, Clutch, Feefo — review/ratings platforms. |
| 91 | CMS | **Payment Processor** | Affirm, Afterpay, Aplazame, Atome, Bread, ChargeAfter, Divido, Fundiin — buy-now-pay-later financial products; folded into the existing Payment Processor bucket (ids 107–110). |
| 92 | CMS | **Performance Optimization** | Autoptimize, Azure Monitor, Cloudflare Rocket Loader, Cloudflare Zaraz, EWWW Image Optimizer, FlyingPress — perf/speed tooling. |
| 93 | CMS | **Booking System** | Bentobox, BeyondMenu, Bookatable, Clock PMS, CoverManager, Cubilis — restaurant/hospitality booking; folded into the existing Booking System bucket (ids 71–76). |
| 94 | CMS | **Referral Marketing** | Aklamio, Ambassador, Buyapowa, Extole, Friendbuy, Mention Me — referral-program tools. |
| 95 | CMS | **Digital Asset Management** | Adobe Dynamic Media Classic, Aprimo, Celum, Cloudinary, CoreMedia Content Cloud, Frontify — DAM/PIM platforms. |
| 96 | CMS | **Widget** | see Rule 1. |
| 97 | CMS | **Customer Data Platform** | Able CDP, Acquia Customer Data Platform, Adobe Experience Platform Identity Service, BlueConic, Emarsys, Exponea — CDPs (distinct from CRM). |
| 98 | CMS | *(left unchanged — see Concerns)* | 24 techs (Aument, Barilliance, BiteSpeed, CareCart, CartBot, CartRocket, CartStack, Jilt, Justuno, OptiMonk) are cart-abandonment/ecommerce marketing tools, clearly not CMS — but `98` is curated-used by `higher-ed-infra.json`, so per the controller's explicit constraint it is **not** re-tagged in this pass. Flagged below. |
| 99 | CMS | **Shipping & Logistics** | APC, Asendia, Australia Post, BRT, Billbee, Bleckmann, Boxtal, Bpost, Chronopost — carriers/logistics. |
| 100 | CMS | **Ecommerce** | Accentuate Custom Fields, AdNabu, Ali Reviews, Autocommerce, Avada AVASHIP/Boost Sales/SEO, BON Loyalty, Back In Stock — Shopify/ecommerce app grab-bag. |
| 101 | CMS | **HR / Recruiting** | Appcast, ApplicantStack, BambooHR, Breezy HR, Comeet, DreamApply, Ellucian CRM Recruit, Freshteam, Greenhouse — HR/ATS/admissions-recruiting tools. |
| 102 | CMS | **Ecommerce** | AfterShip Returns Center, Happy Returns, Loop Returns, Narvar, Returnly, ShippyPro — ecommerce returns management. |
| 103 | CMS | **Video Platform** | Acquire Cobrowse, Apizee, Bambuser, BigMarker, Cloudflare Stream, Conviva, EasyWebinar, Firework — video/webinar/live-shopping; folded into the existing Video Platform bucket (id 14). |
| 104 | CMS | **Booking System** | Adalte, Agoda, Cvent, Etix, Evvnt, EzTix, Fever — event/travel booking; folded into Booking System. |
| 105 | CMS | **3D/AR Visualization** | A-Frame, Auglio, Cylindo, DeepAR, Expivi, ModiFace, mirrAR, Plattar, Tangiblee — AR/3D product-visualization/virtual-try-on tools. |
| 106 | CMS | **Ecommerce** | Azoya, Borderfree, ESW, Global-e, GlobalShopex, Glopal, ShopBase, Zonos — cross-border-commerce enablement. |

## Not touched (out of Phase-1 scope)

Ids whose *current* name is **not** a signal-category name are out of scope for this pass, even
where the sample suggests a better bucket exists (e.g. the huge generic `JavaScript Framework` /
`Advertising` / `Web Server` catch-all reuse across ids 9, 11, 12, 17, 18–24, 25–35, 36–51, 59–70,
77–79). Fixing those is real taxonomy debt but doesn't create signal-category false positives, so
it's not this task's problem to solve.

## Resolved (Fix pass, controller-decided — supersedes the four DONE_WITH_CONCERNS items below)

The four curated-id collisions the first pass correctly declined to guess at were resolved by the
controller and applied in a follow-up fix pass:

1. **id `29`: `JavaScript Framework` → `Site Search`.** Its audit sample (Addsearch, Algolia,
   Apisearch, Athena Search, Attraqt, Awesomplete, Baidu Search Box, Bloomreach Discovery, Boost
   Commerce, Cludo, Convermax, Coveo, Doofinder, ElasticSuite, Elasticsearch — 57 techs total) is
   dominated by search vendors with no meaningful fraction of genuine JS frameworks (spot-checked
   before applying). `higher-ed-infra.json` already tags 16 curated search vendors (SearchStax,
   AddSearch, Algolia, Azure Cognitive Search, Cludo, Coveo, Elasticsearch, Element451 Search,
   Funnelback, Google Custom Search, Lucidworks Fusion, Meilisearch, Sajari, SearchBlox, Site
   Search 360, Swiftype) with `cats: [29]`, so `29` is now the canonical Site Search id and those
   16 patterns light up correctly. The placeholder `305 → Site Search` registered in the first pass
   was **removed** — it's redundant now that `29` carries the real meaning. **Consequence for
   Phase 3:** target id `29` for any new data-mined Site Search patterns, not a new id.
2. **id `21`: `Web Server` (Envoy) → `LMS`.** Its audit sample (Absorb, AccessAlly, Accredible,
   Aforest LMS, aSc EduPage, Chamilo, Classeh, Coachy, Dokeos, Edmingle, Edwiser Bridge, Eloomi,
   Elopage, eChalk) is genuinely LMS, and `higher-ed-lms.json` already uses `cats: [21, 53]`
   expecting `21` to mean LMS — base `21` staying `Web Server` was under-labeling, not pollution,
   but it left the curated LMS partial's intent and the base map disagreeing. Envoy (the actual
   base `21` tech) has no curated LMS-partial collision risk in the higher-ed corpus.
3. **id `98`: `CMS` → `Ecommerce Marketing`.** Base 98 (24 techs: Aument, Barilliance, BiteSpeed,
   CareCart, CartBot, CartRocket, CartStack, Jilt, Justuno, OptiMonk) is cart-abandonment /
   ecommerce-marketing tooling, not CMS — this was the exact false-positive shape Phase 1 targets.
   `higher-ed-infra.json`'s CAS/Shibboleth entries carry `cats: [53, 98]`; with this change they
   now resolve to `[SIS, Ecommerce Marketing]` instead of `[SIS, CMS]`, killing the false CMS
   signal. This is the intended outcome — their `cats` arrays were left untouched.
4. **id `82`: removed entirely.** It had 0 techs in the merged base and no sample to justify a
   target; rather than leave it mapped to `CMS` (a latent false-positive risk if a future base
   update ever populates it), the entry was dropped from `categoryMapping`. `mapCategory()`
   already returns `'Unknown'` for unmapped ids, which is the correct neutral result.

Out-of-scope note (unchanged from the first pass): **id `53`** (SIS) still carries the same
CRM/chat-flavored audit-sample skew noted in Rule 5 — that observation stands as a pre-existing
condition, not addressed by this fix pass. CAS/Shibboleth's `53` (SIS) tagging is untouched.
