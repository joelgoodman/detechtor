module.exports = {
  // Scanning configuration
  timeout: 30000,              // 30 second timeout
  concurrency: 3,              // Max concurrent scans
  waitUntil: 'domcontentloaded',   // Wait for DOM instead of networkidle0
  userAgent: 'SpeedyU-deTECHtor/1.0 (+https://speedyu.com/tech-scan)',

  // Multi-page scanning configuration
  maxPagesToScan: 5,           // Maximum pages to crawl per site
  pageScanTimeout: 15000,      // Timeout per additional page
  followExternalLinks: false,  // Stay on same domain
  strategicPaths: [            // Priority paths to look for in hrefs
    '/login', '/portal', '/student', '/faculty', '/courses',
    '/library', '/learn', '/lms', '/sis', '/blackboard', '/canvas',
    '/continuing-education', '/continuing_education', '/professional-development',
    '/workforce', '/catalog', '/ce/', '/extension'
  ],

  // Subdomains and paths derived from the scanned domain and probed with a full
  // Puppeteer pass. Each entry generates two candidates:
  //   subdomain: https://<prefix>.<rootdomain>/
  //   path:      https://www.<rootdomain>/<prefix>/
  // The first that returns a 2xx/3xx response gets scanned for evidence.
  // Useful for products that always live on a predictable subdomain or path but
  // are never linked from the institution's homepage.
  derivedProbes: [
    'catalog',     // Canvas Catalog (*.catalog.canvaslms.com or catalog.domain.edu)
    'events',      // Localist / 25Live public events calendar
    'giving',      // Blackbaud/advancement portals
    'apply',       // Slate, Technolutions application portals
    'library',     // Ex Libris Primo, WorldShare, etc.
    'search',      // Funnelback, Algolia, custom search
  ],

  // Paths probed directly against the root domain regardless of link discovery.
  // Used to detect platforms whose admin interfaces are never linked from public pages
  // (headless CMS backends, auth portals, REST APIs). A 200 or redirect response
  // from any of these is passed through the pattern matcher as additional evidence.
  probePaths: [
    // WordPress — detectable even when frontend is fully headless
    '/wp-login.php',          // login page: 200 confirms WordPress
    '/wp-json/wp/v2/',        // REST API: JSON response confirms WordPress + version
    '/wp-content/',           // media/plugin path: 403 or redirect still confirms WP

    // Drupal
    '/user/login',            // standard Drupal login path
    '/core/install.php',      // Drupal core path (403 still confirms)

    // Common higher-ed portal paths worth probing directly
    '/cas/login',             // CAS SSO — confirms CAS even if not linked
    '/Shibboleth.sso/Metadata', // Shibboleth IdP metadata endpoint
  ],

  // Pattern configuration
  // Load order matters: later files override earlier ones on tech-name collisions.
  // Higher-ed files load LAST so our curated higher-ed definitions win over
  // anything inherited from the WebAppAnalyzer base.
  patternPaths: [
    '../patterns/webappanalyzer-merged.json',            // Base: ~6,400 patterns from WebAppAnalyzer
    '../patterns/general-analytics-extensions.json',     // GA4 and other general patterns not in base
    '../patterns/fediverse-social-patterns.json',        // Fediverse/social networking overrides
    '../patterns/higher-ed-cms.json',                    // Higher-ed CMSes (TerminalFour, Cascade, Modern Campus, etc.)
    '../patterns/higher-ed-lms.json',                    // LMSes + assessment tools (Canvas, Blackboard, Turnitin, etc.)
    '../patterns/higher-ed-sis.json',                    // Student info / ERP / financial aid (Banner, Colleague, Workday, etc.)
    '../patterns/higher-ed-infra.json'                   // Auth, library, CRM, events, payments, video, search, safety
  ],

  // Output configuration
  verbose: false,
  includeEvidence: true,
  minConfidence: 30,

  // Browser configuration
  browserOptions: {
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || (() => {
      const { platform } = process;
      if (platform === 'darwin') {
        // macOS: prefer Chrome, fall back to Chromium
        const candidates = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ];
        const fs = require('fs');
        return candidates.find(p => fs.existsSync(p)) || candidates[0];
      }
      return '/usr/bin/chromium'; // Linux (CI, Docker)
    })(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security'
    ]
  },

  // Security settings
  excludePaths: [
    '/admin', '/login', '/portal',
    '/secure', '/private', '/auth',
    '/wp-admin', '/administrator'
  ],

  // Rate limiting
  minDelayBetweenRequests: 1000, // 1 second
  maxConcurrentScans: 3,
  maxScanDuration: 60000 // 60 seconds
};