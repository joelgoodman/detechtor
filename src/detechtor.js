const puppeteer = require('puppeteer');
const https     = require('https');
const http      = require('http');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { mapCategory } = require('./category-mapping');
const { admittedDomRules, checkDomRules } = require('./dom-rules');
const { normalizeDefinition } = require('./pattern-normalize');
const { resolveIdentities } = require('./technology-identity');
const ALIASES = require('../patterns/technology-aliases.json');
const { applyCategoryOverrides } = require('./category-overrides');
const CATEGORY_OVERRIDES = require('../patterns/category-overrides.json');
const PATTERN_OVERRIDES = require('../patterns/pattern-overrides.json');
const { applyPatternOverrides } = require('./pattern-overrides');

class DeTECHtor {
  constructor(options = {}) {
    this.patterns = this.loadPatterns();
    // UNI-224: the set of CSS selectors the admitted `dom` rules need, computed once.
    // Without this the engine has nothing to query and every dom rule is dead.
    this.domPlan = this.buildDomPlan();
    this.browser = null;
    this.startTime = null;
    // UNI-140: when enabled, observe runtime network requests (page.on('request'))
    // and expose the set of hostnames as evidence.networkHosts, so async/bundled
    // vendors that never leave a static HTML host (Algolia {appId}-dsn.algolia.net,
    // Swiftype api.swiftype.com, Salesforce, Google CSE) can be matched via a
    // `network` pattern field. Off by default (adds a settle wait + listener).
    this.captureNetwork = options.captureNetwork || false;
    // Extra idle time after navigation for late XHR/fetch to fire (only when capturing).
    this.networkSettleMs = options.networkSettleMs || 2000;
  }
  
  /**
   * Build the per-selector collection plan for `dom` rules (UNI-224).
   *
   * Collects ONLY what the admitted rules actually need per selector — text, specific attribute
   * names, specific property names — rather than serializing whole elements. With ~1,570 distinct
   * selectors in play, dumping every attribute of every match would balloon the page.evaluate
   * payload for no gain.
   */
  buildDomPlan(options = {}) {
    // strict: fail LOUDLY at load on any dom rule the engine cannot evaluate. This is the Phase C
    // guardrail — the whole defect was that unevaluable rules died silently. Default off so a
    // single bad pattern cannot abort a production scan; the CI lint is where it must bite.
    const strict = options.strict === true;
    const plan = new Map();
    const problems = [];
    for (const [name, def] of Object.entries(this.patterns)) {
      if (name === '_metadata' || !def || typeof def !== 'object' || def.dom === undefined) continue;
      const { rules, problems: found } = checkDomRules(name, def);
      if (found.length) {
        problems.push(...found);
        if (!strict && config.verbose) {
          for (const p of found) console.warn(`Unusable dom rule for ${p.tech}: ${p.message}`);
        }
        def._domRules = [];
        continue;
      }
      def._domRules = rules; // cached for evaluatePattern
      for (const r of rules) {
        if (!plan.has(r.selector)) {
          plan.set(r.selector, { selector: r.selector, text: false, attrs: new Set(), props: new Set() });
        }
        const entry = plan.get(r.selector);
        if (r.kind === 'text') entry.text = true;
        else if (r.kind === 'attributes') entry.attrs.add(r.name);
        else if (r.kind === 'properties') entry.props.add(r.name);
      }
    }
    if (strict && problems.length) {
      throw new Error(
        `${problems.length} dom rule(s) the engine cannot evaluate:\n` +
          problems.map((p) => `  ${p.tech} [${p.kind}]: ${p.message}`).join('\n'),
      );
    }
    return [...plan.values()].map((e) => ({
      selector: e.selector,
      text: e.text,
      attrs: [...e.attrs],
      props: [...e.props],
    }));
  }

  // options.applyOverrides — set false to obtain the pristine, pre-override map. Only the
  // override validator wants this; everything else must see corrected categories.
  loadPatterns(options = {}) {
    const patterns = {};
    // Curated (higher-ed-authored) partials get provenance-stamped so downstream
    // consumers (residual-audit.js, benchmark-agent's signal gate) can tell a
    // hand-vetted higher-ed match from a bare WebAppAnalyzer base-pattern match.
    const CURATED_RE = /(higher-ed-|general-analytics-extensions|fediverse-social)/;

    config.patternPaths.forEach(patternPath => {
      const fullPath = path.resolve(__dirname, patternPath);
      if (fs.existsSync(fullPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          const curated = CURATED_RE.test(patternPath);
          const sourceFile = path.basename(patternPath);
          for (const [name, def] of Object.entries(data)) {
            if (name === '_metadata') continue;
            if (def && typeof def === 'object') {
              // UNI-226: strip upstream `\;confidence:NN` / `\;version:\1` suffixes before the
              // engine ever sees them. Unstripped, they become literal regex requirements no page
              // can satisfy — 939 values were silently dead. Stripping at LOAD (not only at
              // import) covers hand-written pattern files too.
              normalizeDefinition(def);
              def._curated = curated;
              def._sourceFile = sourceFile;
              // UNI-237: anything under patterns/generated/ is a build artifact —
              // scripts/import-webappanalyzer.js rewrites it wholesale. Stamped so any script,
              // test or reader inspecting a definition knows an in-place edit will be reverted.
              def._generated = /(^|[\\/])generated[\\/]/.test(patternPath);
            }
            // Later (curated) files still override earlier (base) on name collision.
            patterns[name] = def;
          }
          if (config.verbose) {
            console.log(`Loaded ${Object.keys(data).length} patterns from ${fullPath}`);
          }
        } catch (error) {
          console.warn(`Failed to load patterns from ${fullPath}: ${error.message}`);
        }
      } else {
        console.warn(`Pattern file not found: ${fullPath}`);
      }
    });
    
    // UNI-233: one technology, one entry. Curated files are meant to OVERRIDE the base, but the
    // assignment above keys on the exact name — so a casing difference (accessiBe vs AccessiBe)
    // left both alive, curated correct and base wrong, both firing. Vendor renames did the same
    // (Omni CMS / Modern Campus CMS). Evidence is unioned, so the losing entry's patterns — such
    // as the dom rule UNI-224 recovered Omni CMS with — survive the merge.
    const before = Object.keys(patterns).length;
    let resolved = resolveIdentities(patterns, ALIASES.aliases || {});
    if (config.verbose && before !== Object.keys(resolved).length) {
      console.log(`Collapsed ${before - Object.keys(resolved).length} duplicate technology name(s)`);
    }

    // UNI-235: human-adjudicated category corrections, applied AFTER identity resolution so an
    // override names the surviving canonical technology rather than a name that just got merged
    // away. Rewrites `categories` only — see src/category-overrides.js.
    if (options.applyOverrides !== false) {
      const rules = CATEGORY_OVERRIDES.overrides || {};
      resolved = applyCategoryOverrides(resolved, rules);
      if (config.verbose) {
        const n = Object.keys(rules).filter((k) => k !== '_comment' && resolved[k]).length;
        if (n) console.log(`Applied ${n} category override(s)`);
      }

      // UNI-237: evidence-pattern removals, applied after the category layer. Order does not matter
      // — the two layers touch disjoint fields — but keeping them adjacent keeps the "what does a
      // pristine load mean" answer in one place.
      const patternRules = PATTERN_OVERRIDES.overrides || {};
      resolved = applyPatternOverrides(resolved, patternRules);
      if (config.verbose) {
        const n2 = Object.keys(patternRules).filter((k) => k !== '_comment' && resolved[k]).length;
        if (n2) console.log(`Applied ${n2} pattern override(s)`);
      }
    }

    if (config.verbose) {
      console.log(`Total patterns loaded: ${Object.keys(resolved).length}`);
    }

    return resolved;
  }
  
  async initialize() {
    if (this.browser) {
      return; // Already initialized
    }
    
    try {
      this.browser = await puppeteer.launch(config.browserOptions);
      if (config.verbose) {
        console.log('deTECHtor browser initialized');
      }
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }
  
  async detectTechnologies(url) {
    this.startTime = Date.now();
    
    if (!this.browser) {
      await this.initialize();
    }
    
    const mainPage = await this.browser.newPage();
    let allDetected = [];
    let scannedUrls = [];
    
    try {
      // Scan main page first
      const mainResults = await this.scanSinglePage(mainPage, url);
      allDetected = [...allDetected, ...mainResults.technologies];
      scannedUrls.push(mainResults.finalUrl);
      
      if (config.verbose) {
        console.log(`Main page scanned: ${mainResults.technologies.length} technologies detected`);
      }
      
      // Discover additional pages from hrefs
      const additionalUrls = await this.discoverAdditionalPages(mainPage, mainResults.finalUrl);
      
      // Scan strategic additional pages
      for (const additionalUrl of additionalUrls.slice(0, config.maxPagesToScan - 1)) {
        if (scannedUrls.includes(additionalUrl)) continue;
        
        try {
          const additionalPage = await this.browser.newPage();
          const additionalResults = await this.scanSinglePage(additionalPage, additionalUrl, true);
          allDetected = [...allDetected, ...additionalResults.technologies];
          scannedUrls.push(additionalResults.finalUrl);
          
          if (config.verbose) {
            console.log(`Additional page scanned: ${additionalResults.technologies.length} technologies`);
          }
          
          await additionalPage.close();
        } catch (error) {
          if (config.verbose) {
            console.warn(`Failed to scan additional page ${additionalUrl}: ${error.message}`);
          }
        }
      }
      
      // Probe derived subdomains/paths (catalog, events, apply, etc.)
      // Each is checked with a lightweight HTTP request first; only resolved
      // URLs get a full Puppeteer evidence pass.
      const derivedResults = await this.scanDerivedProbes(url);
      allDetected = [...allDetected, ...derivedResults];

      // Probe admin/API paths that are never linked from public pages
      const probeEvidence = await this.probePaths(url);
      if (probeEvidence.length > 0) {
        const probeDetected = this.matchPatterns({
          html: probeEvidence.map(p => p.body).join('\n'),
          headers: probeEvidence.reduce((acc, p) => Object.assign(acc, p.headers), {}),
          scripts: [],
          meta: {},
          cookies: [],
          dom: { jsObjects: {} },
          apiEndpoints: probeEvidence.filter(p => p.status === 200).map(p => p.path),
          versionInfo: {},
        });
        allDetected = [...allDetected, ...probeDetected];
      }

      // Deduplicate and merge results
      const mergedTechnologies = this.mergeTechnologies(allDetected);
      const inferredStack = this.inferTechnologyStack(mergedTechnologies);
      
      const scanDuration = Date.now() - this.startTime;
      
      return {
        url: url,
        finalUrl: mainResults.finalUrl,
        timestamp: Date.now(),
        technologies: mergedTechnologies,
        scannedPages: scannedUrls.length,
        scannedUrls: scannedUrls,
        inferredStack: { components: { cms: null, lms: null, sis: null, crm: null, analytics: [], javascript: [], server: [], cdn: [] }, inferences: [] },
        meta: {
          responseCode: mainResults.meta.responseCode,
          scanDuration: scanDuration,
          userAgent: config.userAgent,
          detechtor_version: '2.0.0'
        }
      };
      
    } finally {
      await mainPage.close();
    }
  }

  // UNI-145: detect technologies on a KNOWN set of URLs (the agent's already-resolved
  // canonical pages) WITHOUT any self-crawl. Scans each provided URL via scanSinglePage
  // and merges — skips discoverAdditionalPages, the additional-page crawl loop,
  // scanDerivedProbes, and probePaths (the slow parts). Detecting on 2–3 rendered
  // canonical pages (home + admissions + program) catches CMS/chatbot/analytics/a11y
  // (home) + CRM/forms/marketing-automation (lead-capture pages) without guessing pages.
  async detectTechnologiesOnUrls(urls) {
    this.startTime = Date.now();

    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('detectTechnologiesOnUrls requires a non-empty array of URLs');
    }

    if (!this.browser) {
      await this.initialize();
    }

    let allDetected = [];
    const scannedUrls = [];
    let firstFinalUrl = null;
    let firstResponseCode = null;

    for (const targetUrl of urls) {
      const page = await this.browser.newPage();
      try {
        const res = await this.scanSinglePage(page, targetUrl);
        allDetected = [...allDetected, ...res.technologies];
        scannedUrls.push(res.finalUrl);
        if (firstFinalUrl === null) {
          firstFinalUrl = res.finalUrl;
          firstResponseCode = res.meta ? res.meta.responseCode : null;
        }
        if (config.verbose) {
          console.log(`Scanned (no-crawl) ${targetUrl}: ${res.technologies.length} technologies`);
        }
      } catch (error) {
        if (config.verbose) {
          console.warn(`Failed to scan ${targetUrl}: ${error.message}`);
        }
      } finally {
        await page.close();
      }
    }

    const mergedTechnologies = this.mergeTechnologies(allDetected);
    const scanDuration = Date.now() - this.startTime;

    return {
      url: urls[0],
      finalUrl: firstFinalUrl || urls[0],
      timestamp: Date.now(),
      technologies: mergedTechnologies,
      scannedPages: scannedUrls.length,
      scannedUrls: scannedUrls,
      inferredStack: { components: { cms: null, lms: null, sis: null, crm: null, analytics: [], javascript: [], server: [], cdn: [] }, inferences: [] },
      meta: {
        responseCode: firstResponseCode,
        scanDuration: scanDuration,
        userAgent: config.userAgent,
        detechtor_version: '2.0.0',
        mode: 'no-crawl'
      }
    };
  }

  shouldExcludePath(path) {
    return config.excludePaths.some(excludePath => 
      path.toLowerCase().includes(excludePath.toLowerCase())
    );
  }
  
  async scanSinglePage(page, url, isAdditionalPage = false) {
    // UNI-140: collect runtime request hostnames when network capture is enabled.
    // page.on('request') observes every request without enabling interception (so
    // no request.continue() is required) — cheap and complete from navigation start.
    const networkHosts = new Set();
    if (this.captureNetwork) {
      page.on('request', req => {
        try { networkHosts.add(new URL(req.url()).hostname); } catch { /* ignore */ }
      });
    }

    // Stealth setup to hide automation detection
    await page.setUserAgent(config.userAgent);
    
    // Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });
    
    // Hide chrome automation
    await page.evaluateOnNewDocument(() => {
      window.chrome = {
        runtime: {},
      };
    });
    
    // Hide permissions
    await page.evaluateOnNewDocument(() => {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
    
    // Hide plugins
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    
    // Hide languages
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    // Set reasonable viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Small delay to appear more human
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (config.verbose) {
      console.log(`Scanning ${url}${isAdditionalPage ? ' (additional page)' : ''}...`);
    }
    
    const response = await page.goto(url, {
      waitUntil: config.waitUntil,
      timeout: isAdditionalPage ? config.pageScanTimeout : config.timeout
    });
    
    // Check if we should exclude this path
    const urlPath = new URL(response.url()).pathname;
    if (this.shouldExcludePath(urlPath)) {
      throw new Error(`Excluded path detected: ${urlPath}`);
    }
    
    // Let late async XHR/fetch fire so runtime vendor hosts are captured (UNI-140).
    if (this.captureNetwork && this.networkSettleMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.networkSettleMs));
    }

    // Collect evidence from page
    const evidence = await this.collectEvidence(page, response);
    evidence.networkHosts = this.captureNetwork ? [...networkHosts] : [];

    // Match against patterns
    const detected = this.matchPatterns(evidence);
    
    return {
      url: url,
      finalUrl: response.url(),
      technologies: detected,
      networkHosts: evidence.networkHosts,
      meta: {
        responseCode: response.status()
      }
    };
  }
  
  async discoverAdditionalPages(page, baseUrl) {
    const discoveredUrls = [];
    
    try {
      // Extract all href links from the page
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map(a => ({
          href: a.href,
          text: a.textContent?.trim().toLowerCase() || ''
        }));
      });
      
      const baseDomain = new URL(baseUrl).hostname;
      
      // Prioritize strategic paths
      for (const link of links) {
        try {
          const linkUrl = new URL(link.href);
          
          // Stay on same domain unless external links are allowed
          if (linkUrl.hostname !== baseDomain && !config.followExternalLinks) {
            continue;
          }
          
          const pathname = linkUrl.pathname.toLowerCase();
          
          // Check for strategic paths
          for (const strategicPath of config.strategicPaths) {
            if (pathname.includes(strategicPath) || link.text.includes(strategicPath)) {
              if (!discoveredUrls.includes(link.href)) {
                discoveredUrls.push(link.href);
              }
              break;
            }
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
      
      // If no strategic paths found, look for common higher-ed links
      if (discoveredUrls.length === 0) {
        for (const link of links) {
          try {
            const linkUrl = new URL(link.href);
            
            if (linkUrl.hostname !== baseDomain && !config.followExternalLinks) {
              continue;
            }
            
            // Look for common higher-ed indicators in text or URL
            const indicators = ['student', 'faculty', 'portal', 'login', 'course', 'learn', 'library'];
            const textAndPath = (link.text + ' ' + linkUrl.pathname).toLowerCase();
            
            if (indicators.some(indicator => textAndPath.includes(indicator))) {
              if (!discoveredUrls.includes(link.href)) {
                discoveredUrls.push(link.href);
              }
            }
          } catch (e) {
            // Skip invalid URLs
          }
        }
      }
      
    } catch (error) {
      if (config.verbose) {
        console.warn(`Error discovering additional pages: ${error.message}`);
      }
    }
    
    return discoveredUrls;
  }
  
  mergeTechnologies(allTechnologies) {
    const merged = {};
    
    for (const tech of allTechnologies) {
      const key = tech.name.toLowerCase();
      
      if (merged[key]) {
        // Merge evidence and update confidence
        merged[key].evidence = [...new Set([...merged[key].evidence, ...tech.evidence])];
        merged[key].confidence = Math.max(merged[key].confidence, tech.confidence);

        // Merge categories
        merged[key].categories = [...new Set([...merged[key].categories, ...tech.categories])];

        // Use version if available
        if (tech.version && !merged[key].version) {
          merged[key].version = tech.version;
        }

        // Provenance: curated if ANY contributing detection was curated; keep
        // the first non-null sourceFile.
        merged[key].curated = merged[key].curated || tech.curated || false;
        if (!merged[key].sourceFile && tech.sourceFile) {
          merged[key].sourceFile = tech.sourceFile;
        }
      } else {
        merged[key] = { ...tech };
      }
    }
    
    return Object.values(merged).sort((a, b) => b.confidence - a.confidence);
  }
  
  async inferTechnologyStack(technologies) {
    if (config.verbose) {
      console.log(`Debug: Running inference on ${technologies.length} technologies`);
      const cmsTechs = technologies.filter(t => 
        Array.isArray(t.categories) && 
        t.categories.some(c => c.toLowerCase().includes('cms'))
      );
      console.log(`Debug: Found ${cmsTechs.length} CMS technologies:`, cmsTechs.map(t => t.name));
    }
    
    const stack = {
      cms: null,
      lms: null,
      sis: null,
      crm: null,
      analytics: [],
      javascript: [],
      server: [],
      cdn: []
    };
    
    for (const tech of technologies) {
      // Categories are already normalized as strings from evaluatePattern
      const categories = Array.isArray(tech.categories) 
        ? tech.categories.map(c => c.toLowerCase()) 
        : [];
      
      if (categories.includes('cms')) {
        stack.cms = tech.name;
      }
      if (categories.includes('lms')) {
        stack.lms = tech.name;
      }
      if (categories.includes('sis')) {
        stack.sis = tech.name;
      }
      if (categories.includes('crm')) {
        stack.crm = tech.name;
      }
      if (categories.includes('analytics')) {
        stack.analytics.push(tech.name);
      }
      if (categories.includes('javascript framework') || categories.includes('javascript')) {
        stack.javascript.push(tech.name);
      }
      if (categories.includes('web server')) {
        stack.server.push(tech.name);
      }
      if (categories.includes('cdn')) {
        stack.cdn.push(tech.name);
      }
    }
    
    // Infer common stacks
    const inferences = [];
    
    if (stack.cms === 'WordPress' && stack.javascript.includes('React')) {
      inferences.push('WordPress with React frontend (likely headless WordPress)');
    }
    
    if (stack.lms === 'Canvas LMS' && stack.server.includes('Apache')) {
      inferences.push('Canvas LMS hosted on Apache (standard institutional setup)');
    }
    
    if (stack.cms === 'Drupal' && stack.analytics.includes('Google Analytics')) {
      inferences.push('Enterprise Drupal with Google Analytics integration');
    }
    
    if (stack.sis && stack.lms) {
      inferences.push(`Integrated SIS (${stack.sis}) and LMS (${stack.lms}) environment`);
    }
    
    return {
      components: stack,
      inferences: inferences
    };
  }
  
  async collectEvidence(page, response) {
    const evidence = {
      html: '',
      headers: response.headers(),
      scripts: [],
      meta: {},
      cookies: [],
      dom: {},
      apiEndpoints: [],
      networkHosts: [],
      versionInfo: {}
    };
    
    try {
      // Get HTML content
      evidence.html = await page.content();
      
      // Extract script sources with version detection
      evidence.scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]'))
          .map(script => ({
            src: script.src,
            version: script.src.match(/[?&]ver=([^&]+)/)?.[1] || null
          }))
          .filter(item => item.src && item.src.length > 0);
      });
      
      // Extract meta tags with enhanced version detection
      evidence.meta = await page.evaluate(() => {
        const meta = {};
        document.querySelectorAll('meta').forEach(tag => {
          const name = tag.getAttribute('name') || tag.getAttribute('property');
          const content = tag.getAttribute('content');
          if (name && content) {
            meta[name.toLowerCase()] = content;
          }
        });
        return meta;
      });
      
      // Enhanced version extraction
      evidence.versionInfo = await this.extractVersionInfo(page, evidence.html);
      
      // API endpoint discovery
      evidence.apiEndpoints = await this.discoverApiEndpoints(page, evidence.html, evidence.scripts);
      
      // Extract DOM elements for pattern matching
      evidence.dom = await page.evaluate(() => {
        return {
          title: document.title || '',
          bodyClasses: document.body?.className || '',
          bodyId: document.body?.id || '',
          headContent: document.head?.innerHTML || '',
          // Check for specific elements that indicate technologies
          hasElements: {
            drupalSettings: !!window.Drupal?.settings,
            wpContent: !!document.querySelector('#wp-content, .wp-content, [class*="wp-"]'),
            slateContainer: !!document.querySelector('.slate-container, [class*="slate"]'),
            joomlaSystem: !!document.querySelector('[name="generator"][content*="Joomla"]'),
            bootstrapClasses: !!document.querySelector('[class*="bootstrap"], [class*="btn-"], [class*="col-"]'),
            jqueryPresent: typeof window.jQuery !== 'undefined',
            reactRoot: !!document.querySelector('#root, [data-reactroot], [data-react-class]'),
            vueApp: !!document.querySelector('[data-v-], [v-cloak]')
          },
          // JavaScript object detection for webappanalyzer patterns
          jsObjects: {
            // Higher Ed specific objects
            'Banner': typeof window.Banner !== 'undefined',
            'BWCK': typeof window.BWCK !== 'undefined',
            'Colleague': typeof window.Colleague !== 'undefined',
            'DatatelUI': typeof window.DatatelUI !== 'undefined',
            'PeopleSoft': typeof window.PeopleSoft !== 'undefined',
            'PS': typeof window.PS !== 'undefined',
            'Jenzabar': typeof window.Jenzabar !== 'undefined',
            'JICS': typeof window.JICS !== 'undefined',
            'PowerCampus': typeof window.PowerCampus !== 'undefined',
            'Blackboard': typeof window.Blackboard !== 'undefined',
            'bbNG': typeof window.bbNG !== 'undefined',
            'page.bbNG': typeof window.page?.bbNG !== 'undefined',
            'D2L': typeof window.D2L !== 'undefined',
            'd2l': typeof window.d2l !== 'undefined',
            'sakai': typeof window.sakai !== 'undefined',
            'Sakai': typeof window.Sakai !== 'undefined',
            'OmniCMS': typeof window.OmniCMS !== 'undefined',
            'omni': typeof window.omni !== 'undefined',
            'TerminalFour': typeof window.TerminalFour !== 'undefined',
            'T4': typeof window.T4 !== 'undefined',
            'ModernCampus': typeof window.ModernCampus !== 'undefined',
            'Shibboleth': typeof window.Shibboleth !== 'undefined',
            'CAS': typeof window.CAS !== 'undefined',
            'Navigate': typeof window.Navigate !== 'undefined',
            'EAB': typeof window.EAB !== 'undefined',
            'Starfish': typeof window.Starfish !== 'undefined',
            'kaltura': typeof window.kaltura !== 'undefined',
            'kWidget': typeof window.kWidget !== 'undefined',
            'Panopto': typeof window.Panopto !== 'undefined',
            'ExLibris': typeof window.ExLibris !== 'undefined',
            'Alma': typeof window.Alma !== 'undefined',
            'Primo': typeof window.Primo !== 'undefined',
            'TouchNet': typeof window.TouchNet !== 'undefined',
            'uPay': typeof window.uPay !== 'undefined',
            'Transact': typeof window.Transact !== 'undefined',
            'BBTransact': typeof window.BBTransact !== 'undefined',
            'CBORD': typeof window.CBORD !== 'undefined',
            'TwentyFiveLive': typeof window.TwentyFiveLive !== 'undefined',
            'EMS': typeof window.EMS !== 'undefined',
            'Localist': typeof window.Localist !== 'undefined',
            // Common JS frameworks
            'webpackChunkcanvas_lms': typeof window.webpackChunkcanvas_lms !== 'undefined',
            'M.core': typeof window.M?.core !== 'undefined',
            'Y.Moodle': typeof window.Y?.Moodle !== 'undefined'
          }
        };
      });
      
      // Selector-based DOM evidence (UNI-224). Patterns key `dom` on CSS selectors; this is the
      // step that was never implemented, which is why all 1,456 dom-carrying techs were dead.
      // Returns { selector: [ { text, attributes, properties } ] }, collecting only the fields the
      // admitted rules ask for. An invalid selector is skipped rather than aborting the sweep.
      evidence.domNodes = await page.evaluate((plan) => {
        const MAX_NODES = 25;   // enough for "any match"; bounds the payload
        const MAX_TEXT = 500;   // dom text regexes are anchored/short
        const out = {};
        for (const spec of plan) {
          let els;
          try {
            els = document.querySelectorAll(spec.selector);
          } catch (e) {
            continue; // malformed selector — Phase C rejects these at load
          }
          if (!els.length) continue;
          const nodes = [];
          const limit = Math.min(els.length, MAX_NODES);
          for (let i = 0; i < limit; i++) {
            const el = els[i];
            const node = {};
            if (spec.text) node.text = (el.textContent || '').slice(0, MAX_TEXT);
            if (spec.attrs.length) {
              node.attributes = {};
              for (const a of spec.attrs) {
                const v = el.getAttribute(a);
                if (v !== null) node.attributes[a] = v;
              }
            }
            if (spec.props.length) {
              node.properties = {};
              for (const p of spec.props) {
                const v = el[p];
                if (v !== undefined && v !== null) {
                  node.properties[p] = typeof v === 'object' ? '[object]' : String(v);
                }
              }
            }
            nodes.push(node);
          }
          out[spec.selector] = nodes;
        }
        return out;
      }, this.domPlan);

      // Extract cookies (limited for privacy)
      evidence.cookies = await page.cookies();
      
    } catch (error) {
      if (config.verbose) {
        console.warn(`Error collecting evidence: ${error.message}`);
      }
    }
    
    return evidence;
  }
  
  async extractVersionInfo(page, html) {
    const versionInfo = {};
    
    try {
      // Extract version information from various sources
      const versions = await page.evaluate(() => {
        const versions = {};
        
        // WordPress version detection
        const wpGenerator = document.querySelector('meta[name="generator"][content*="WordPress"]');
        if (wpGenerator) {
          const wpVersion = wpGenerator.content.match(/WordPress (\d+\.\d+(?:\.\d+)?)/);
          if (wpVersion) versions.wordpress = wpVersion[1];
        }
        
        // Drupal version detection
        if (window.Drupal?.settings) {
          // Try to extract from Drupal settings or JS files
          const drupalJs = Array.from(document.querySelectorAll('script[src*="drupal.js"]'));
          if (drupalJs.length > 0) {
            const src = drupalJs[0].src;
            const version = src.match(/(\d+\.\d+)/);
            if (version) versions.drupal = version[1];
          }
        }
        
        // Joomla version detection
        const joomlaGenerator = document.querySelector('meta[name="generator"][content*="Joomla"]');
        if (joomlaGenerator) {
          const joomlaVersion = joomlaGenerator.content.match(/Joomla! (\d+\.\d+(?:\.\d+)?)/);
          if (joomlaVersion) versions.joomla = joomlaVersion[1];
        }
        
        // Canvas LMS version
        if (window.webpackChunkcanvas_lms) {
          // Try to extract from Canvas environment
          const canvasEnv = document.querySelector('meta[name="canvas-environment"]');
          if (canvasEnv) {
            versions.canvas = canvasEnv.content;
          }
        }
        
        // jQuery version
        if (window.jQuery && window.jQuery.fn) {
          versions.jquery = window.jQuery.fn.jquery;
        }
        
        // Bootstrap version
        const bootstrapJs = Array.from(document.querySelectorAll('script[src*="bootstrap"]'));
        if (bootstrapJs.length > 0) {
          const src = bootstrapJs[0].src;
          const bsVersion = src.match(/bootstrap[\/](\d+\.\d+(?:\.\d+)?)/i);
          if (bsVersion) versions.bootstrap = bsVersion[1];
        }
        
        return versions;
      });
      
      Object.assign(versionInfo, versions);
      
      // Additional version extraction from HTML content
      const htmlVersionPatterns = [
        { name: 'wordpress', pattern: /wp-includes\/js\/wp-embed\.min\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i },
        { name: 'drupal', pattern: /drupal\.js\?(\d+\.\d+)/i },
        { name: 'joomla', pattern: /joomla\.js\?(\d+\.\d+)/i },
        { name: 'moodle', pattern: /moodle\/lib\/javascript\.js\?(\d+\.\d+)/i }
      ];
      
      for (const { name, pattern } of htmlVersionPatterns) {
        if (!versionInfo[name]) {
          const match = html.match(pattern);
          if (match) versionInfo[name] = match[1];
        }
      }
      
    } catch (error) {
      if (config.verbose) {
        console.warn(`Error extracting version info: ${error.message}`);
      }
    }
    
    return versionInfo;
  }
  
  async discoverApiEndpoints(page, html, scripts) {
    const endpoints = [];
    
    try {
      // Extract API endpoints from JavaScript
      const jsEndpoints = await page.evaluate(() => {
        const endpoints = new Set();
        
        // Look for common API patterns in JavaScript
        const scripts = Array.from(document.querySelectorAll('script:not([src])'));
        scripts.forEach(script => {
          const content = script.textContent || '';
          
          // Common API endpoint patterns
          const apiPatterns = [
            /(['"])(\/api\/v\d+[^'"]*)\1/g,
            /(['"])(\/wp-json\/[^'"]*)\1/g,
            /(['"])(\/learn\/api\/[^'"]*)\1/g,
            /(['"])(\/d2l\/api\/[^'"]*)\1/g,
            /(['"])(\/canvas\/api\/[^'"]*)\1/g,
            /(['"])(\/rest\/[^'"]*)\1/g
          ];
          
          apiPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              endpoints.add(match[2]);
            }
          });
        });
        
        return Array.from(endpoints);
      });
      
      endpoints.push(...jsEndpoints);
      
      // Look for API endpoints in script sources
      scripts.forEach(script => {
        const src = script.src;
        if (src.includes('/api/') || src.includes('/wp-json/') || src.includes('/rest/')) {
          const url = new URL(src);
          const pathname = url.pathname.split('/').slice(0, -1).join('/') + '/';
          if (!endpoints.includes(pathname)) {
            endpoints.push(pathname);
          }
        }
      });
      
      // Look for API endpoints in HTML content
      const htmlApiPatterns = [
        /href=['"](\/api\/[^'"]*)['"]/gi,
        /href=['"](\/wp-json\/[^'"]*)['"]/gi,
        /action=['"](\/api\/[^'"]*)['"]/gi
      ];
      
      htmlApiPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          if (!endpoints.includes(match[1])) {
            endpoints.push(match[1]);
          }
        }
      });
      
    } catch (error) {
      if (config.verbose) {
        console.warn(`Error discovering API endpoints: ${error.message}`);
      }
    }
    
    return endpoints.slice(0, 20); // Limit to prevent too many endpoints
  }
  
  matchPatterns(evidence) {
    const detected = [];
    
    for (const [techName, pattern] of Object.entries(this.patterns)) {
      try {
        const match = this.evaluatePattern(techName, pattern, evidence);
        
        if (match.confidence >= config.minConfidence) {
          detected.push(match);
        }
      } catch (error) {
        if (config.verbose) {
          console.warn(`Error evaluating pattern for ${techName}: ${error.message}`);
        }
      }
    }
    
    return detected.sort((a, b) => b.confidence - a.confidence);
  }
  
  evaluatePattern(name, pattern, evidence) {
    let confidence = 0;
    const matchEvidence = [];
    
    // HTML pattern matching
    if (pattern.html && Array.isArray(pattern.html)) {
      for (const htmlPattern of pattern.html) {
        try {
          const regex = new RegExp(htmlPattern, 'i');
          if (regex.test(evidence.html)) {
            confidence += 40;
            matchEvidence.push(`HTML: ${htmlPattern}`);
            if (matchEvidence.length > 10) break; // Limit evidence collection
          }
        } catch (regexError) {
          // Skip invalid regex patterns
          if (config.verbose) {
            console.warn(`Invalid HTML regex for ${name}: ${htmlPattern}`);
          }
        }
      }
    }
    
    // Script source matching (support both formats)
    // UNI-237: `||` discarded scriptSrc entirely whenever scripts was also present — 85 patterns
    // declare both and 54 of those with DIFFERENT content, so half their evidence never ran.
    const scriptPatterns = [
      ...(Array.isArray(pattern.scripts) ? pattern.scripts : []),
      ...(Array.isArray(pattern.scriptSrc) ? pattern.scriptSrc : []),
    ];
    if (Array.isArray(scriptPatterns)) {
      for (const scriptPattern of scriptPatterns) {
        try {
          const regex = new RegExp(scriptPattern, 'i');
          // evidence.scripts is an array of { src, version } objects (see collectEvidence);
          // test the regex against the src STRING, not the object (which stringifies to
          // "[object Object]" and never matches). Tolerate a plain-string element too. UNI-139.
          const match = evidence.scripts.some(s => regex.test(typeof s === 'string' ? s : (s && s.src) || ''));
          if (match) {
            confidence += 60;
            matchEvidence.push(`Script: ${scriptPattern}`);
          }
        } catch (regexError) {
          if (config.verbose) {
            console.warn(`Invalid script regex for ${name}: ${scriptPattern}`);
          }
        }
      }
    }
    
    // Network host matching (UNI-140). Regex-tested against the hostnames of runtime
    // requests (evidence.networkHosts, populated only when --capture-network is set).
    // This is the only evidence type that sees async/bundled vendors whose API host
    // never appears in static HTML (Algolia, Swiftype, Salesforce, Google CSE). A live
    // request to a dedicated vendor host is strong evidence (+70).
    const networkPatterns = pattern.network || [];
    if (Array.isArray(networkPatterns) && Array.isArray(evidence.networkHosts) && evidence.networkHosts.length) {
      for (const networkPattern of networkPatterns) {
        try {
          const regex = new RegExp(networkPattern, 'i');
          if (evidence.networkHosts.some(h => regex.test(h))) {
            confidence += 70;
            matchEvidence.push(`Network: ${networkPattern}`);
          }
        } catch (regexError) {
          if (config.verbose) {
            console.warn(`Invalid network regex for ${name}: ${networkPattern}`);
          }
        }
      }
    }

    // Header matching
    if (pattern.headers && typeof pattern.headers === 'object') {
      for (const [headerName, headerPattern] of Object.entries(pattern.headers)) {
        const headerValue = evidence.headers[headerName.toLowerCase()];
        if (headerValue) {
          try {
            if (new RegExp(headerPattern, 'i').test(headerValue)) {
              confidence += 80;
              matchEvidence.push(`Header: ${headerName}=${headerPattern}`);
            }
          } catch (regexError) {
            if (config.verbose) {
              console.warn(`Invalid header regex for ${name}: ${headerPattern}`);
            }
          }
        }
      }
    }
    
    // Meta tag matching
    if (pattern.meta && typeof pattern.meta === 'object') {
      for (const [metaName, metaPattern] of Object.entries(pattern.meta)) {
        const metaValue = evidence.meta[metaName.toLowerCase()];
        if (metaValue) {
          try {
            if (new RegExp(metaPattern, 'i').test(metaValue)) {
              confidence += 100;
              matchEvidence.push(`Meta: ${metaName}=${metaPattern}`);
            }
          } catch (regexError) {
            if (config.verbose) {
              console.warn(`Invalid meta regex for ${name}: ${metaPattern}`);
            }
          }
        }
      }
    }
    
    // DOM element matching.
    //
    // Patterns key `dom` on a CSS SELECTOR. The old code regex-tested `evidence.dom[domKey]`,
    // a fixed six-key bag (title/bodyClasses/bodyId/headContent/hasElements/jsObjects), so every
    // selector-keyed rule was dropped before the regex ran — all 1,456 dom-carrying techs were
    // dead, and the one rule that could fire did so via new RegExp({text:…}) => /[object Object]/i.
    // Selectors are now evaluated for real in the page and delivered as `evidence.domNodes`:
    //   { selector: [ { text, attributes, properties } ] }
    // Rules are normalized through one shape contract and filtered by the Phase A evidence gate
    // (UNI-224). See src/dom-rules.js.
    if (pattern.dom !== undefined && evidence.domNodes) {
      let domRules = pattern._domRules;
      if (domRules === undefined) {
        try {
          domRules = admittedDomRules(name, pattern);
        } catch (shapeError) {
          // Unrepresentable shape. Phase C promotes this to a hard error at load; here we skip
          // the tech's dom rules rather than abort the whole scan.
          domRules = [];
          if (config.verbose) {
            console.warn(`Unusable dom shape for ${name}: ${shapeError.message}`);
          }
        }
        pattern._domRules = domRules;
      }

      for (const rule of domRules) {
        const nodes = evidence.domNodes[rule.selector];
        if (!nodes || nodes.length === 0) continue;

        if (rule.kind === 'exists') {
          confidence += 70;
          matchEvidence.push(`DOM: ${rule.selector}`);
          continue;
        }

        let regex = null;
        if (rule.regex) {
          try {
            regex = new RegExp(rule.regex, 'i');
          } catch (regexError) {
            if (config.verbose) {
              console.warn(`Invalid DOM regex for ${name}: ${rule.regex}`);
            }
            continue;
          }
        }

        const matched = nodes.some((node) => {
          if (rule.kind === 'text') {
            return regex ? regex.test(node.text || '') : Boolean(node.text);
          }
          const bag = rule.kind === 'attributes' ? node.attributes : node.properties;
          const value = bag && bag[rule.name];
          if (value === undefined || value === null) return false;
          return regex ? regex.test(String(value)) : true;
        });

        if (matched) {
          confidence += 70;
          matchEvidence.push(`DOM: ${rule.selector}[${rule.kind}${rule.name ? `.${rule.name}` : ''}]`);
        }
      }
    }
    
    // JavaScript object detection (webappanalyzer format).
    // RUNTIME PRESENCE ONLY: a JS global actually existing in the live page is real
    // evidence (+80). We deliberately do NOT fall back to an HTML substring search on
    // the object's name — that produced the false-positive flood, because bare tokens
    // (`s`->Adobe Analytics, `va`->Vercel, `wp`, `ga`, `PS`, `Banner`) appear as
    // substrings in nearly every page's HTML. A name is not evidence; presence is. UNI-139.
    if (pattern.js && typeof pattern.js === 'object') {
      for (const jsObject of Object.keys(pattern.js)) {
        try {
          if (evidence.dom.jsObjects && evidence.dom.jsObjects[jsObject]) {
            confidence += 80;
            matchEvidence.push(`JS: ${jsObject}`);
          }
        } catch (error) {
          if (config.verbose) {
            console.warn(`Error checking JS object ${jsObject} for ${name}`);
          }
        }
      }
    }
    
    // Cookie matching (webappanalyzer format)
    if (pattern.cookies && typeof pattern.cookies === 'object') {
      for (const [cookieName, cookiePattern] of Object.entries(pattern.cookies)) {
        const cookie = evidence.cookies.find(c => c.name === cookieName);
        if (cookie) {
          try {
            if (!cookiePattern || new RegExp(cookiePattern, 'i').test(cookie.value)) {
              confidence += 70;
              matchEvidence.push(`Cookie: ${cookieName}`);
            }
          } catch (regexError) {
            if (config.verbose) {
              console.warn(`Invalid cookie regex for ${name}: ${cookiePattern}`);
            }
          }
        }
      }
    }

    // UNI-237: `url` (76 patterns) and `xhr` (100) were declared and read by nothing. Both are
    // live-path only — evidenceFromHtml supplies neither finalUrl nor networkHosts, so these never
    // fire during a corpus pass. That is expected, not a bug.
    if (Array.isArray(pattern.url) && typeof evidence.finalUrl === 'string') {
      for (const urlPattern of pattern.url) {
        try {
          if (new RegExp(urlPattern, 'i').test(evidence.finalUrl)) {
            confidence += 70;
            matchEvidence.push(`URL: ${urlPattern}`);
          }
        } catch { /* invalid regex; lint-patterns gates these */ }
      }
    }

    if (Array.isArray(pattern.xhr) && Array.isArray(evidence.networkHosts)) {
      for (const xhrPattern of pattern.xhr) {
        try {
          const re = new RegExp(xhrPattern, 'i');
          if (evidence.networkHosts.some((h) => re.test(String(h)))) {
            confidence += 70;
            matchEvidence.push(`XHR: ${xhrPattern}`);
          }
        } catch { /* invalid regex; lint-patterns gates these */ }
      }
    }

    // Normalize categories to always be strings
    let categories = pattern.categories || pattern.cats || ['Unknown'];
    if (Array.isArray(categories)) {
      categories = categories.map(c => mapCategory(c));
    } else {
      categories = ['Unknown'];
    }
    
    return {
      name,
      confidence: Math.min(confidence, 100),
      categories: categories,
      evidence: config.includeEvidence ? matchEvidence : [],
      version: this.extractVersion({name: name}, evidence),
      isHigherEd: pattern.higher_ed || false,
      description: pattern.description || '',
      curated: pattern._curated || false,
      sourceFile: pattern._sourceFile || null
    };
  }
  
  extractVersion(pattern, evidence) {
    // Enhanced version extraction using multiple sources
    let version = null;
    
    // First check if we have version info from our enhanced detection
    if (evidence.versionInfo) {
      const techNameLower = pattern.name?.toLowerCase() || '';
      for (const [tech, versionValue] of Object.entries(evidence.versionInfo)) {
        if (techNameLower.includes(tech) || tech.includes(techNameLower)) {
          version = versionValue;
          break;
        }
      }
    }
    
    // Fall back to pattern-based extraction
    if (!version && pattern.version && typeof pattern.version === 'string') {
      try {
        const regex = new RegExp(pattern.version, 'i');
        const match = evidence.html.match(regex);
        if (match && match[1]) {
          version = match[1];
        }
      } catch (error) {
        // Skip invalid version regex
      }
    }
    
    // Try to extract from script versions
    if (!version && evidence.scripts) {
      for (const script of evidence.scripts) {
        if (script.version) {
          version = script.version;
          break;
        }
      }
    }
    
    return version;
  }
  
  // For each derived probe prefix, construct a subdomain URL and a path URL,
  // do a quick HTTP check on both, and run a full Puppeteer scan on whichever
  // resolves first. Skips if the resolved URL is the same domain already scanned.
  async scanDerivedProbes(siteUrl) {
    if (!config.derivedProbes || config.derivedProbes.length === 0) return [];

    let parsed;
    try { parsed = new URL(siteUrl); } catch { return []; }

    // Extract root domain (strip www. prefix)
    const hostname  = parsed.hostname.replace(/^www\./, '');
    const protocol  = parsed.protocol;
    const allDetected = [];

    for (const prefix of config.derivedProbes) {
      const candidates = [
        `${protocol}//${prefix}.${hostname}/`,
        `${protocol}//${parsed.hostname}/${prefix}/`,
      ];

      for (const candidate of candidates) {
        // Skip if it's just the site we already scanned
        if (candidate === siteUrl || candidate === siteUrl + '/') continue;

        // Lightweight check first — don't spin up Puppeteer for a 404
        const reachable = await new Promise(resolve => {
          const mod = candidate.startsWith('https') ? https : http;
          const req = mod.get(candidate, { rejectUnauthorized: false,
            headers: { 'User-Agent': config.userAgent } }, res => {
            resolve(res.statusCode < 400 || res.statusCode === 401 || res.statusCode === 403);
          });
          req.on('error', () => resolve(false));
          req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        });

        if (!reachable) continue;

        if (config.verbose) {
          console.log(`  derived probe resolved: ${candidate}`);
        }

        try {
          const page = await this.browser.newPage();
          const result = await this.scanSinglePage(page, candidate, true);
          allDetected.push(...result.technologies);
          await page.close();
        } catch {
          // Probe failed (auth wall, timeout, etc.) — skip silently
        }

        break; // Found one that works for this prefix — don't try the path variant
      }
    }

    return allDetected;
  }

  // Probe paths are fetched directly (no browser) to detect admin/API endpoints
  // that are never linked from public pages (headless CMS backends, SSO portals, REST APIs).
  async probePaths(siteUrl) {
    if (!config.probePaths || config.probePaths.length === 0) return [];

    let origin;
    try {
      origin = new URL(siteUrl).origin;
    } catch {
      return [];
    }

    const results = [];

    for (const probePath of config.probePaths) {
      const target = origin + probePath;
      try {
        const result = await new Promise((resolve) => {
          const mod = target.startsWith('https') ? https : http;
          const timer = setTimeout(() => resolve(null), 6000);
          const req = mod.get(target, {
            headers: { 'User-Agent': config.userAgent },
            rejectUnauthorized: false,
          }, res => {
            clearTimeout(timer);
            let body = '';
            res.on('data', chunk => { if (body.length < 8192) body += chunk; });
            res.on('end', () => resolve({
              path: probePath,
              url: target,
              status: res.statusCode,
              headers: res.headers,
              body,
            }));
          });
          req.on('error', () => { clearTimeout(timer); resolve(null); });
          req.setTimeout(6000, () => { req.destroy(); clearTimeout(timer); resolve(null); });
        });

        // A 200 or redirect is useful evidence; 404/403 is noise
        if (result && (result.status === 200 || result.status === 301 || result.status === 302)) {
          results.push(result);
          if (config.verbose) {
            console.log(`  probe ${target} → ${result.status}`);
          }
        }
      } catch {
        // Ignore probe errors — these are best-effort
      }
    }

    return results;
  }

  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      if (config.verbose) {
        console.log('deTECHtor browser closed');
      }
    }
  }
}

module.exports = DeTECHtor;