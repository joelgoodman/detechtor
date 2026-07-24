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
  304: 'Proctoring' // UNI-156: proctoring/integrity tools (non-signal)
};

function mapCategory(categoryId) {
  if (typeof categoryId === 'string') {
    return categoryId.toLowerCase();
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

module.exports = { mapCategory, categoryMapping, SIGNAL_CATEGORIES, isSignalCategory };
