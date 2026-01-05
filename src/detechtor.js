const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { mapCategory } = require('./category-mapping');

class DeTECHtor {
  constructor() {
    this.patterns = this.loadPatterns();
    this.browser = null;
    this.startTime = null;
  }
  
  loadPatterns() {
    const patterns = {};
    
    config.patternPaths.forEach(patternPath => {
      const fullPath = path.resolve(__dirname, patternPath);
      if (fs.existsSync(fullPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          Object.assign(patterns, data);
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
    
    if (config.verbose) {
      console.log(`Total patterns loaded: ${Object.keys(patterns).length}`);
    }
    
    return patterns;
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
  
  shouldExcludePath(path) {
    return config.excludePaths.some(excludePath => 
      path.toLowerCase().includes(excludePath.toLowerCase())
    );
  }
  
  async scanSinglePage(page, url, isAdditionalPage = false) {
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
    
    // Collect evidence from page
    const evidence = await this.collectEvidence(page, response);
    
    // Match against patterns
    const detected = this.matchPatterns(evidence);
    
    return {
      url: url,
      finalUrl: response.url(),
      technologies: detected,
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
    const scriptPatterns = pattern.scripts || pattern.scriptSrc || [];
    if (Array.isArray(scriptPatterns)) {
      for (const scriptPattern of scriptPatterns) {
        try {
          const regex = new RegExp(scriptPattern, 'i');
          const match = evidence.scripts.some(src => regex.test(src));
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
    
    // DOM element matching (custom for higher-ed patterns)
    if (pattern.dom && typeof pattern.dom === 'object') {
      for (const [domKey, domPattern] of Object.entries(pattern.dom)) {
        if (evidence.dom[domKey]) {
          try {
            if (new RegExp(domPattern, 'i').test(evidence.dom[domKey])) {
              confidence += 70;
              matchEvidence.push(`DOM: ${domKey}=${domPattern}`);
            }
          } catch (regexError) {
            if (config.verbose) {
              console.warn(`Invalid DOM regex for ${name}: ${domPattern}`);
            }
          }
        }
      }
    }
    
    // JavaScript object detection (webappanalyzer format)
    if (pattern.js && typeof pattern.js === 'object') {
      for (const jsObject of Object.keys(pattern.js)) {
        try {
          // Check if JS object exists in DOM evidence
          const jsExists = evidence.dom.jsObjects && evidence.dom.jsObjects[jsObject];
          if (jsExists) {
            confidence += 80;
            matchEvidence.push(`JS: ${jsObject}`);
          }
          // Fallback to HTML content search
          else if (evidence.html.includes(jsObject)) {
            confidence += 30;
            matchEvidence.push(`JS: ${jsObject} (HTML)`);
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
      description: pattern.description || ''
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