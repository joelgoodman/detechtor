// Type definitions for @speedyu/detechtor
// Project: https://github.com/speedyu/detechtor
// Definitions by: SpeedyU Team

declare module '@speedyu/detechtor' {
  /**
   * Main DeTECHtor class for technology detection
   */
  export default class DeTECHtor {
    /**
     * Loaded detection patterns
     */
    patterns: PatternCollection;

    /**
     * Browser instance (null until initialized)
     */
    browser: any | null;

    /**
     * Scan start time
     */
    startTime: number | null;

    /**
     * Creates a new DeTECHtor instance
     */
    constructor();

    /**
     * Loads detection patterns from configured pattern files
     * @returns Collection of loaded patterns
     */
    loadPatterns(): PatternCollection;

    /**
     * Initializes the browser instance
     * Called automatically by detectTechnologies if not already initialized
     */
    initialize(): Promise<void>;

    /**
     * Scans a URL and detects technologies
     * @param url - The URL to scan (must include protocol)
     * @returns Promise resolving to scan results
     * @throws Error if URL is invalid or unreachable
     * @throws Error if browser fails to launch
     * @throws Error if scan times out
     */
    detectTechnologies(url: string): Promise<ScanResult>;

    /**
     * Closes browser instances and cleans up resources
     * Should always be called when done scanning
     */
    shutdown(): Promise<void>;

    /**
     * Matches collected evidence against all loaded patterns
     * @param evidence - Collected evidence from page scan
     * @returns Array of detected technologies
     */
    matchPatterns(evidence: Evidence): Technology[];

    /**
     * Evaluates a single pattern against evidence
     * @param name - Technology name
     * @param pattern - Pattern definition
     * @param evidence - Collected evidence
     * @returns Technology object with confidence score
     */
    evaluatePattern(name: string, pattern: Pattern, evidence: Evidence): Technology;

    /**
     * Collects evidence from a page for pattern matching
     * @param page - Puppeteer page instance
     * @param response - HTTP response object
     * @returns Promise resolving to collected evidence
     */
    collectEvidence(page: any, response: any): Promise<Evidence>;

    /**
     * Extracts version information for detected technologies
     * @param page - Puppeteer page instance
     * @param html - Page HTML content
     * @returns Promise resolving to version information
     */
    extractVersionInfo(page: any, html: string): Promise<Record<string, string>>;

    /**
     * Discovers API endpoints from page content
     * @param page - Puppeteer page instance
     * @param html - Page HTML content
     * @param scripts - Array of script objects
     * @returns Promise resolving to discovered API endpoints
     */
    discoverApiEndpoints(page: any, html: string, scripts: ScriptInfo[]): Promise<string[]>;

    /**
     * Discovers strategic additional pages to scan
     * @param page - Puppeteer page instance
     * @param baseUrl - Base URL for same-domain filtering
     * @returns Promise resolving to discovered URLs
     */
    discoverAdditionalPages(page: any, baseUrl: string): Promise<string[]>;

    /**
     * Merges technology detections from multiple pages
     * @param allTechnologies - Array of all detected technologies
     * @returns Merged and deduplicated technologies
     */
    mergeTechnologies(allTechnologies: Technology[]): Technology[];

    /**
     * Infers overall technology stack from detected technologies
     * @param technologies - Array of detected technologies
     * @returns Promise resolving to inferred technology stack
     */
    inferTechnologyStack(technologies: Technology[]): Promise<TechnologyStack>;

    /**
     * Extracts version from pattern and evidence
     * @param pattern - Pattern with version regex
     * @param evidence - Collected evidence
     * @returns Version string or null
     */
    extractVersion(pattern: { name?: string }, evidence: Evidence): string | null;

    /**
     * Checks if a path should be excluded from scanning
     * @param path - URL path to check
     * @returns True if path should be excluded
     */
    shouldExcludePath(path: string): boolean;

    /**
     * Scans a single page and returns results
     * @param page - Puppeteer page instance
     * @param url - URL to scan
     * @param isAdditionalPage - Whether this is an additional page scan
     * @returns Promise resolving to page scan results
     */
    scanSinglePage(page: any, url: string, isAdditionalPage?: boolean): Promise<PageScanResult>;
  }

  /**
   * Scan result returned by detectTechnologies()
   */
  export interface ScanResult {
    /** Original URL provided for scanning */
    url: string;
    /** Final URL after redirects */
    finalUrl: string;
    /** Unix timestamp of scan completion */
    timestamp: number;
    /** Array of detected technologies */
    technologies: Technology[];
    /** Number of pages scanned */
    scannedPages: number;
    /** URLs that were scanned */
    scannedUrls: string[];
    /** Discovered API endpoints (if any) */
    apiEndpoints?: string[];
    /** Inferred technology stack */
    inferredStack: TechnologyStack;
    /** Scan metadata */
    meta: ScanMeta;
  }

  /**
   * Individual technology detection result
   */
  export interface Technology {
    /** Technology name */
    name: string;
    /** Confidence score (0-100) */
    confidence: number;
    /** Technology categories */
    categories: string[];
    /** Evidence for detection */
    evidence: string[];
    /** Detected version (if available) */
    version?: string;
    /** Is this a higher education technology */
    isHigherEd: boolean;
    /** Technology description */
    description: string;
  }

  /**
   * Inferred technology stack
   */
  export interface TechnologyStack {
    /** Technology stack components */
    components: {
      /** CMS name */
      cms: string | null;
      /** LMS name */
      lms: string | null;
      /** SIS name */
      sis: string | null;
      /** CRM name */
      crm: string | null;
      /** Analytics tools */
      analytics: string[];
      /** JavaScript frameworks */
      javascript: string[];
      /** Web servers */
      server: string[];
      /** CDN providers */
      cdn: string[];
    };
    /** Stack inferences/observations */
    inferences: string[];
  }

  /**
   * Scan metadata
   */
  export interface ScanMeta {
    /** HTTP response code */
    responseCode: number;
    /** Scan duration in milliseconds */
    scanDuration: number;
    /** User agent used for scanning */
    userAgent: string;
    /** deTECHtor version */
    detechtor_version: string;
  }

  /**
   * Evidence collected from a page scan
   */
  export interface Evidence {
    /** Full HTML content */
    html: string;
    /** HTTP headers */
    headers: Record<string, string>;
    /** Script sources */
    scripts: ScriptInfo[];
    /** Meta tags */
    meta: Record<string, string>;
    /** Cookies */
    cookies: Cookie[];
    /** DOM information */
    dom: DOMInfo;
    /** API endpoints */
    apiEndpoints: string[];
    /** Version information */
    versionInfo: Record<string, string>;
  }

  /**
   * Script information
   */
  export interface ScriptInfo {
    /** Script source URL */
    src: string;
    /** Script version (if detected) */
    version?: string | null;
  }

  /**
   * Cookie information
   */
  export interface Cookie {
    /** Cookie name */
    name: string;
    /** Cookie value */
    value: string;
    /** Cookie domain */
    domain?: string;
    /** Cookie path */
    path?: string;
    /** Cookie expiration */
    expires?: number;
    /** Secure flag */
    secure?: boolean;
    /** HttpOnly flag */
    httpOnly?: boolean;
  }

  /**
   * DOM information
   */
  export interface DOMInfo {
    /** Page title */
    title: string;
    /** Body classes */
    bodyClasses: string;
    /** Body ID */
    bodyId: string;
    /** Head content */
    headContent: string;
    /** Element presence checks */
    hasElements: {
      drupalSettings: boolean;
      wpContent: boolean;
      slateContainer: boolean;
      joomlaSystem: boolean;
      bootstrapClasses: boolean;
      jqueryPresent: boolean;
      reactRoot: boolean;
      vueApp: boolean;
    };
    /** JavaScript object detection */
    jsObjects: Record<string, boolean>;
  }

  /**
   * Pattern definition for technology detection
   */
  export interface Pattern {
    /** Technology description */
    description: string;
    /** Category names */
    categories?: string[];
    /** Category IDs */
    cats?: number[];
    /** HTML regex patterns */
    html?: string[];
    /** Script src regex patterns */
    scripts?: string[];
    /** Alternative script src field */
    scriptSrc?: string[];
    /** Header patterns */
    headers?: Record<string, string>;
    /** Meta tag patterns */
    meta?: Record<string, string>;
    /** Cookie patterns */
    cookies?: Record<string, string>;
    /** JavaScript object patterns */
    js?: Record<string, any>;
    /** DOM element patterns */
    dom?: Record<string, string>;
    /** Is higher education technology */
    higher_ed?: boolean;
    /** Base confidence score */
    confidence?: number;
    /** Version extraction regex */
    version?: string;
    /** Official website */
    website?: string;
    /** Icon filename */
    icon?: string;
    /** Implied technologies */
    implies?: string[];
    /** Mutually exclusive technologies */
    excludes?: string[];
  }

  /**
   * Collection of patterns
   */
  export interface PatternCollection {
    [technologyName: string]: Pattern;
  }

  /**
   * Page scan result
   */
  export interface PageScanResult {
    /** Original URL */
    url: string;
    /** Final URL after redirects */
    finalUrl: string;
    /** Detected technologies */
    technologies: Technology[];
    /** Scan metadata */
    meta: {
      /** HTTP response code */
      responseCode: number;
    };
  }

  /**
   * Configuration options
   */
  export interface Config {
    /** Main page timeout (ms) */
    timeout: number;
    /** Max concurrent scans */
    concurrency: number;
    /** Puppeteer waitUntil option */
    waitUntil: string;
    /** User agent string */
    userAgent: string;
    /** Maximum pages to scan per site */
    maxPagesToScan: number;
    /** Timeout per additional page (ms) */
    pageScanTimeout: number;
    /** Follow external links */
    followExternalLinks: boolean;
    /** Priority paths to discover */
    strategicPaths: string[];
    /** Pattern files to load */
    patternPaths: string[];
    /** Enable verbose logging */
    verbose: boolean;
    /** Include evidence in results */
    includeEvidence: boolean;
    /** Minimum confidence threshold (0-100) */
    minConfidence: number;
    /** Browser options */
    browserOptions: {
      headless: boolean;
      executablePath: string;
      args: string[];
    };
    /** Paths to exclude from scanning */
    excludePaths: string[];
    /** Min delay between requests (ms) */
    minDelayBetweenRequests: number;
    /** Max concurrent scans */
    maxConcurrentScans: number;
    /** Max total scan duration (ms) */
    maxScanDuration: number;
  }
}

declare module '@speedyu/detechtor/src/config' {
  import { Config } from '@speedyu/detechtor';
  const config: Config;
  export = config;
}

declare module '@speedyu/detechtor/src/category-mapping' {
  /**
   * Maps a category ID or string to a standardized category name
   * @param categoryId - Category ID (number) or name (string)
   * @returns Standardized category name
   */
  export function mapCategory(categoryId: number | string): string;

  /**
   * Category ID to name mapping
   */
  export const categoryMapping: Record<number, string>;
}
