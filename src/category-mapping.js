// WebAppAnalyzer category ID to name mapping
//
// Remap decisions (UNI-156 Phase 1 / Task 1.2, plus the controller-decided Fix pass) are recorded
// in docs/category-remap.md — read that file before changing any id below. In short: the
// un-audited Wappalyzer base dumped a lot of ecommerce/widget/plugin/translation/fundraising
// tooling into signal-category names (CMS, LMS, CRM, Accessibility); this map corrects those so
// mapCategory() + isSignalCategory() can be trusted as a gate. The four curated-id collisions
// flagged DONE_WITH_CONCERNS in the first pass (29, 21, 98, 82) were resolved in the Fix pass: see
// docs/category-remap.md's "Resolved (Fix pass)" section.
const categoryMapping = {
  1: 'CMS',
  111: 'Fundraising', // was 'Accessibility' — real content is donor/advancement tooling (ActBlue, DonorPerfect, Classy…); see docs/category-remap.md rule 3
  306: 'Accessibility', // new dedicated id (UNI-156 rule 3) — replaces 111 for the curated higher-ed-accessibility.json partial
  2: 'Message Boards', // Originally CMS but includes forums and social platforms
  3: 'Message Boards',
  4: 'Wiki',
  5: 'Widget', // was 'LMS' — real content is generic embeddable widgets/services (AddThis, AddToAny, Algolia DocSearch…); see docs/category-remap.md rule 1
  6: 'Web Server', // Apache, Nginx
  7: 'CDN',
  8: 'Programming Language', // PHP, Python, Ruby
  9: 'JavaScript Framework',
  10: 'Analytics',
  11: 'Advertising',
  12: 'JavaScript Framework', // ExtJS
  // UNI-233: 77 technologies carried id 13 with no entry here, so every one of them resolved to
  // 'Unknown'. Named from what actually carries it — Asana, Atlassian Jira, Bugzilla, MantisBT,
  // Flyspray, Statuspage, Cachet, Instatus, BugHerd, Marker, Nolt — issue trackers, status pages
  // and feedback widgets. Named empirically per the standing rule that these ids are ours to
  // define, not copied from upstream. Not a signal category.
  13: 'Issue Tracker',
  14: 'Video Platform',
  15: 'Image Processing',
  16: 'Database',
  17: 'JavaScript Framework', // Twemoji
  18: 'Web Server', // IIS
  19: 'Operating System',
  20: 'Web Server', // LiteSpeed
  21: 'LMS', // was 'Web Server' (Envoy) — audit sample (Absorb, Chamilo, Dokeos…) is genuine LMS; higher-ed-lms.json already tags Canvas/Blackboard/Brightspace/etc. with [21]; see docs/category-remap.md Fix 2
  22: 'Web Server', // Caddy
  23: 'Web Server', // OpenResty
  24: 'Web Server', // Tengine
  25: 'JavaScript Framework',
  26: 'JavaScript Framework',
  27: 'JavaScript Framework',
  28: 'JavaScript Framework',
  29: 'Site Search', // was 'JavaScript Framework' — audit sample is all search vendors (Algolia, Coveo, Elasticsearch, Doofinder…); canonical Site Search id, resolves higher-ed-infra.json's 16 curated search vendors; see docs/category-remap.md Fix 1
  30: 'JavaScript Framework',
  31: 'JavaScript Framework',
  32: 'JavaScript Framework',
  33: 'JavaScript Framework',
  34: 'JavaScript Framework',
  35: 'JavaScript Framework',
  36: 'Advertising',
  37: 'Advertising',
  38: 'Advertising',
  39: 'Advertising',
  40: 'Advertising',
  41: 'Advertising',
  42: 'Advertising',
  43: 'Advertising',
  44: 'Advertising',
  45: 'Advertising',
  46: 'Advertising',
  47: 'Advertising',
  48: 'Advertising',
  49: 'Advertising',
  50: 'Advertising',
  51: 'Advertising',
  52: 'Chatbot',
  53: 'Business Software', // was 'SIS' — base 53 is actually a CRM/chatbot grab-bag (Agile CRM, amoCRM, Aivo, ArtiBot…); declassified out of signal categories, see docs/category-remap.md
  54: 'SEO Tool', // was 'CRM' — real content is SEO tooling (Ahrefs, RankMath SEO, BrightEdge…); see docs/category-remap.md rule 6
  55: 'Financial Software', // was 'CRM' — real content is accounting/fintech (Carta, Ignition, Taxdome…); see docs/category-remap.md rule 6
  56: 'Cryptomining', // was 'CRM' — real content is browser cryptojacking scripts (CoinHive, Crypto-Loot…); see docs/category-remap.md rule 6
  57: 'Static Site Generator', // was 'CMS' — Astro, Hugo, Jekyll, Next.js…
  58: 'Product Onboarding', // was 'CMS' — Appcues, Pendo, Userflow…
  59: 'JavaScript Framework',
  60: 'JavaScript Framework',
  61: 'JavaScript Framework',
  62: 'JavaScript Framework',
  63: 'JavaScript Framework',
  64: 'JavaScript Framework',
  65: 'JavaScript Framework',
  66: 'JavaScript Framework',
  67: 'JavaScript Framework',
  68: 'JavaScript Framework',
  69: 'JavaScript Framework',
  70: 'JavaScript Framework',
  71: 'Booking System',
  72: 'Booking System',
  73: 'Booking System',
  74: 'Booking System',
  75: 'Booking System',
  76: 'Booking System',
  77: 'Advertising',
  78: 'Advertising',
  79: 'Advertising',
  80: 'WordPress Theme', // was 'CMS' — AndersNoren, Astra, aThemes…
  81: 'Ecommerce', // was 'CMS' — Shoptimized (Shopify theme)
  // 82 intentionally dropped (was 'CMS') — 0 techs in the base; mapCategory() returns 'Unknown' for
  // unmapped ids, which is the desired neutral result and avoids a latent CMS false-positive if the
  // base ever populates it. See docs/category-remap.md Fix 4.
  83: 'Fraud Detection', // was 'CMS' — ClientJS, FingerprintJS, MaxMind, ThreatMetrix…
  84: 'Loyalty Program', // was 'CMS' — BON Loyalty, LoyaltyLion, Kangaroo Rewards…
  85: 'Product Management Tool', // was 'CMS' — LaunchDarkly, Statsig, Usersnap…
  86: 'Data Management Platform', // was 'CMS' — Adobe Audience Manager, Oracle BlueKai…
  87: 'WordPress Plugin', // was 'CMS' — AMP for WordPress, Advanced Custom Fields, Akismet…; see docs/category-remap.md rule 1
  88: 'Hosting Provider', // was 'CMS' — Bluehost, DreamHost, Flywheel…
  89: 'Localization', // was 'CMS' — GTranslate, Weglot, WPML…; see docs/category-remap.md rule 1
  90: 'Reviews', // was 'CMS' — Bazaarvoice Reviews, Feefo, Clutch…
  91: 'Payment Processor', // was 'CMS' — Affirm, Afterpay, Divido (buy-now-pay-later)
  92: 'Performance Optimization', // was 'CMS' — Autoptimize, Cloudflare Rocket Loader…
  93: 'Booking System', // was 'CMS' — Bentobox, Bookatable, CoverManager (hospitality)
  94: 'Referral Marketing', // was 'CMS' — Ambassador, Extole, Friendbuy…
  95: 'Digital Asset Management', // was 'CMS' — Cloudinary, Frontify, Aprimo…
  96: 'Widget', // was 'CMS' — Bazaarvoice Curation, Ceros…; see docs/category-remap.md rule 1
  97: 'Customer Data Platform', // was 'CMS' — Acquia CDP, BlueConic, Exponea…
  98: 'Ecommerce Marketing', // was 'CMS' — cart-abandonment tools (CartStack, Justuno, OptiMonk…), not CMS; curated-used by higher-ed-infra.json (CAS/Shibboleth carry [53,98]) — this intentionally kills their false CMS signal, leaving them resolve to [SIS, Ecommerce Marketing]; see docs/category-remap.md Fix 3
  99: 'Shipping & Logistics', // was 'CMS' — Australia Post, Bpost, Chronopost…
  100: 'Ecommerce', // was 'CMS' — Shopify app grab-bag (AdNabu, Ali Reviews, BON Loyalty…)
  101: 'HR / Recruiting', // was 'CMS' — BambooHR, Greenhouse, DreamApply…
  102: 'Ecommerce', // was 'CMS' — returns management (Happy Returns, Loop Returns, Narvar…)
  103: 'Video Platform', // was 'CMS' — Bambuser, BigMarker, Cloudflare Stream (webinar/live-shopping)
  104: 'Booking System', // was 'CMS' — Cvent, Etix, Evvnt (event/travel booking)
  105: '3D/AR Visualization', // was 'CMS' — A-Frame, DeepAR, ModiFace, Plattar…
  106: 'Ecommerce', // was 'CMS' — cross-border commerce (Global-e, Zonos, ShopBase…)
  107: 'Payment Processor',
  108: 'Payment Processor',
  109: 'Payment Processor',
  110: 'Payment Processor',
  307: 'Marketing Automation', // UNI-156: 8th signal category (Marketing Automation), added 2026-07-16
  303: 'CRM', // UNI-156: dedicated CRM id (curated); old 54-56 were remapped
  302: 'SIS', // UNI-156: dedicated SIS id (curated); base 53 was CRM/chatbot-skewed
  304: 'Proctoring', // UNI-156: proctoring/integrity tools (non-signal)
  // UNI-235: course catalog + curriculum management. Eight vendors were filed as SIS (and Canvas
  // Catalog as LMS), so an institution running Acalog registered as having a Student Information
  // System — it has a course catalog. That is ~14% of the SIS category counting the wrong market.
  //
  // ONE category, not two, because the market is sold that way: CourseLeaf ships CAT and CIM
  // together, Modern Campus sells Acalog and Curriculog as a pair, and Smart Catalog, Kuali CM and
  // ScholarSite each describe themselves as doing both. Splitting would file most vendors twice.
  //
  // Non-signal deliberately: it does not join SIGNAL_CATEGORIES, so no downstream consumer or
  // tiered-detection escalation changes behaviour. Promotable later if the competitive intel earns
  // it — that promotion is a blast-radius decision, not a categorisation one.
  305: 'Catalog & Curriculum',
  // UNI-235: six curated digital-signage vendors all sat in Business Software — 635 detections,
  // led by Rise Vision (390) and Scala (244). Campus signage is a distinct procurement.
  308: 'Digital Signage',
  // UNI-235: eighteen consent-management vendors, ALL filed JavaScript Framework — ~440 detections
  // led by CookieYes (173), OneTrust (100), Cookiebot (78). A consent platform is not a JS
  // framework, and which one an institution runs is a real privacy-posture signal.
  309: 'Cookie Consent',
  // UNI-235: machine-readable metadata, not a vendor. Open Graph was filed 'Operating System'.
  // Named for what it IS rather than who consumes it ("Social" would be wrong — social platforms
  // are one consumer; AI answer engines are now another, which is why this matters to the GEO/AEO
  // work). Forward-compatible with schema.org / JSON-LD / Twitter Cards when those are detected.
  // ⚠️ NOT a home for PWA (678 insts, also mis-filed 'Operating System'): PWA is an app capability,
  // not metadata. Left flagged rather than forced somewhere wrong.
  310: 'Structured Data',
  // UNI-235: web-font and icon-font services — ~4,700 detections led by Google Font API (1,943)
  // and Font Awesome (1,275). Kept out of CDN, which is for generic asset delivery, for a concrete
  // reason: German courts have ruled that serving Google Fonts from Google's servers violates
  // GDPR, so a 1,943-institution detection carries a privacy-compliance implication that should
  // not be buried among script CDNs. Licensed foundries (Adobe, Hoefler, MyFonts) vs free Google
  // Fonts is also a design-maturity signal. Icon fonts live here too — Font Awesome and Bootstrap
  // Icons are fonts, not CSS frameworks.
  311: 'Web Fonts',
  // UNI-235: an honest home for "we do not know what this is".
  //
  // 204 technologies were reviewed and not recognised. Leaving them in JavaScript Framework — the
  // bucket they happened to be dumped in by an un-audited upstream import — silently converted
  // "no opinion" into the positive claim "this is a JavaScript framework". That is the same defect
  // as filing every unknown under Business Software, and it is how JavaScript Framework reached
  // 1,252 entries of which only ~25 were real frameworks.
  //
  // Unclassified asserts nothing. It is not a signal category, nothing downstream acts on it, and
  // an entry sitting here is a visible invitation to identify it rather than a wrong answer that
  // reads as settled.
  312: 'Unclassified',
  // UNI-235: library services platforms — ILS, discovery layers and research guides. ~400
  // detections led by LibGuides (224) and FOLIO (57), every one of them previously filed
  // 'Business Software'. Every university runs one, and which one is real competitive intel, but
  // the market was invisible to any sector-specific query while sitting in the grab-bag.
  313: 'Library Systems'
};

// `Student Success` already existed in STRING_ONLY_CATEGORIES below and had never been used —
// a defined category with zero members while EAB Navigate, Ready Education, Campus Labs and
// Anthology Engage sat in 'Business Software'. UNI-235 populates it.

// UNI-233. Some categories are only ever written as STRINGS and have no numeric id, so they are
// absent from the id map above yet are perfectly legitimate. Registering them explicitly is what
// makes "one shared category set" true rather than aspirational — without it the audit reports
// them as unknown forever and stops being worth reading.
const STRING_ONLY_CATEGORIES = [
  'Fediverse',          // curated fediverse-social-patterns.json (9 techs)
  'Social Network',     // curated fediverse-social-patterns.json (8 techs)
  'CSS Framework',      // base, string form
  'JavaScript Library', // base, string form
  'Web Framework',      // base, string form
  'Student Success',    // base, string form
];

/** The complete vocabulary: every name mapCategory can legitimately produce. */
const CANONICAL_CATEGORIES = new Set([
  ...Object.values(categoryMapping),
  ...STRING_ONLY_CATEGORIES,
]);

// Indexed case-insensitively, built once at load from the vocabulary so it cannot drift from it.
const CANONICAL_BY_LOWER = new Map();
for (const name of CANONICAL_CATEGORIES) CANONICAL_BY_LOWER.set(name.toLowerCase(), name);

function mapCategory(categoryId) {
  if (typeof categoryId === 'string') {
    // ⚠️ This used to `return categoryId.toLowerCase()`, while the numeric branch returned Title
    // Case — and `SIGNAL_CATEGORIES.has()`, the check used across the codebase, is case-sensitive.
    // So a pattern file writing cats:['CMS'] became 'cms' and silently stopped counting as a
    // signal category. Two shipped technologies were affected (UNI-233).
    //
    // An unrecognised name is returned unchanged rather than normalised: inventing a canonical
    // form for a category we do not know would hide the fact that we do not know it.
    return CANONICAL_BY_LOWER.get(categoryId.toLowerCase()) || categoryId;
  }
  if (typeof categoryId === 'number') {
    return categoryMapping[categoryId] || 'Unknown';
  }
  return 'Unknown';
}

// The protected set of category names that downstream signal logic (higher-ed CMS/LMS/SIS/CRM/
// Chatbot/Site Search/Accessibility/Marketing Automation detection) is allowed to trust. Nothing else — however
// confident-looking — should be treated as a signal category. See docs/category-remap.md.
const SIGNAL_CATEGORIES = new Set(['CMS', 'LMS', 'SIS', 'CRM', 'Chatbot', 'Site Search', 'Accessibility', 'Marketing Automation']);

function isSignalCategory(name) {
  return typeof name === 'string' && [...SIGNAL_CATEGORIES].some((c) => c.toLowerCase() === name.toLowerCase());
}

module.exports = { mapCategory, categoryMapping, SIGNAL_CATEGORIES, isSignalCategory, CANONICAL_CATEGORIES, STRING_ONLY_CATEGORIES };
