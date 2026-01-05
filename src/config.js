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
    '/library', '/learn', '/lms', '/sis', '/blackboard', '/canvas'
  ],

  // Pattern configuration
  patternPaths: [
    '../patterns/webappanalyzer-merged.json', // Comprehensive patterns including all CMSes + our higher-ed focus
    '../patterns/enhanced-payment-analytics.json', // Enhanced payment, analytics, and video platforms
    '../patterns/fediverse-social-patterns.json' // Override for Fediverse/social networking platforms
  ],

  // Output configuration
  verbose: false,
  includeEvidence: true,
  minConfidence: 30,

  // Browser configuration
  browserOptions: {
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium',
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