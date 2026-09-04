#!/usr/bin/env node

/**
 * Script to import WebAppAnalyzer technology patterns and merge with our custom higher-ed patterns
 * This gives us comprehensive technology detection while maintaining our higher-ed focus
 */

const fs = require('fs-extra');
const https = require('https');
const path = require('path');
const { normalizeDefinition } = require('../src/pattern-normalize.js');

const WEBAPPANALYZER_BASE_URL = 'https://raw.githubusercontent.com/enthec/webappanalyzer/main/src/technologies/';

// UNI-237 Task 8: technologies with no evidence field the engine reads (see
// F = ["html","scripts","scriptSrc","headers","meta","dom","js","cookies","url","xhr"]
// in the recount script). They can never fire — mostly `dns`/`cpe`/`implies`/`cats`-only
// upstream stubs (carriers, mail/DNS/hosting providers, languages, databases) — and a
// re-import would otherwise bring them back. The list is generated, not hand-curated;
// see Task 8 of docs/superpowers/plans/2026-08-11-detection-precision.md.
const NEVER_FIREABLE = new Set([
  "34SP.com",
  "4Partners",
  "ALL-INKL",
  "ANS",
  "APC",
  "AWS Certificate Manager",
  "Amazon Aurora",
  "Amazon EFS",
  "Amazon SES",
  "Apple iCloud Mail",
  "Asendia",
  "Australia Post",
  "Autoketing",
  "B2C Europe",
  "BRT",
  "Billbee",
  "Boxtal",
  "Bpost",
  "Budbee",
  "Bugcrowd",
  "CTT",
  "Celeritas",
  "Chronofresh",
  "Chronopost",
  "CityMail",
  "Colis Privé",
  "Colissimo",
  "Contabo",
  "Correos",
  "Coureon",
  "DPD",
  "DX",
  "Dachser",
  "Delivengo",
  "Deno",
  "Detectify",
  "Deutsche Post",
  "DigiCert",
  "DomainFactory",
  "Doteasy",
  "DreamHost",
  "Dropbox",
  "DutchIS",
  "Easylog",
  "Ecovium",
  "Elixir",
  "Envialia",
  "Facebook Ads",
  "FastComet",
  "FedEx",
  "France Express",
  "Frequenceo",
  "GEODIS",
  "GLS",
  "Genoo",
  "Go",
  "GoDaddy",
  "Google Ads",
  "Google App Engine",
  "Google Cloud",
  "Haskell",
  "Hermes",
  "Homerr",
  "HostEurope",
  "Hostens",
  "Hostgator",
  "Hosting Ukraine",
  "Hostiq",
  "Hostpoint",
  "IONOS",
  "Identrust",
  "Infomaniak",
  "JsObservable",
  "Keen Delivery",
  "Keybase",
  "Kotlin",
  "Leaseweb",
  "Let's Encrypt",
  "LogoiX",
  "Lucene",
  "MRW",
  "Macaron",
  "Mailgun",
  "Mailjet",
  "MariaDB",
  "Microsoft 365",
  "Mittwald",
  "Mondial Relay",
  "MongoDB",
  "My Flying Box",
  "MySQL",
  "NACEX",
  "Nexive",
  "One.com",
  "Oracle WebLogic Server",
  "Osterreichische Post",
  "Panda CSS",
  "Parcelforce",
  "Percona",
  "Poste Italiane",
  "PostgreSQL",
  "PrimeNG",
  "PrimeReact",
  "Proton Mail",
  "QUIC.cloud",
  "REG.RU",
  "Red Hat Gluster",
  "Red je Pakketje",
  "Redis",
  "Relais Colis",
  "Royal Mail",
  "Rspack",
  "Rust",
  "SEUR",
  "SQLite",
  "SWC",
  "Saba.Host",
  "Sakura Internet",
  "Scala",
  "Sectigo",
  "Sendgrid",
  "Sitecore Experience Platform",
  "Solr",
  "SparkPost",
  "Strato",
  "Thawte",
  "Tipsa",
  "Transmart",
  "Trunkrs",
  "TypeDoc",
  "TypeScript",
  "UK Mail",
  "UKFast",
  "UPS",
  "USPS",
  "VentraIP",
  "Vultr",
  "WebHostUK",
  "WebRTC",
  "Webmin",
  "Whistl",
  "World4You",
  "Xserver",
  "YalinHost",
  "Yandex.Cloud",
  "Yodel",
  "Zeleris",
  "Zoho",
  "Zoho Mail",
  "idCloudHost",
  "shadcn/ui",
]);

// Letters that contain major CMSes and technologies we care about
const IMPORTANT_LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '_'
];

async function downloadPatterns() {
  const allPatterns = {};

  console.log('Downloading WebAppAnalyzer patterns...');

  for (const letter of IMPORTANT_LETTERS) {
    try {
      const url = `${WEBAPPANALYZER_BASE_URL}${letter}.json`;
      const patterns = await downloadJSON(url);

      if (patterns && typeof patterns === 'object') {
        Object.assign(allPatterns, patterns);
        console.log(`Downloaded ${Object.keys(patterns).length} patterns from ${letter}.json`);
      }
    } catch (error) {
      console.warn(`Failed to download ${letter}.json: ${error.message}`);
    }
  }

  return allPatterns;
}

function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Invalid JSON: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function mergeWithExistingPatterns(webappPatterns) {
  const mergedPatterns = { ...webappPatterns };

  // Load our existing higher-ed patterns and merge them in
  const configPath = path.join(__dirname, '../src/config.js');
  if (fs.existsSync(configPath)) {
    const config = require(configPath);

    for (const patternPath of config.patternPaths) {
      // Resolve relative paths from scripts directory
      const resolvedPath = path.isAbsolute(patternPath)
        ? patternPath
        : path.resolve(__dirname, '..', patternPath);

      if (fs.existsSync(resolvedPath)) {
        try {
          const customPatterns = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

          // Our custom patterns take precedence over WebAppAnalyzer patterns
          Object.assign(mergedPatterns, customPatterns);

          console.log(`Merged ${Object.keys(customPatterns).length} custom patterns from ${resolvedPath}`);
        } catch (error) {
          console.warn(`Failed to merge patterns from ${resolvedPath}: ${error.message}`);
        }
      }
    }
  }

  return mergedPatterns;
}

function categorizePatterns(patterns) {
  const categories = {
    cms: [],
    lms: [],
    sis: [],
    higherEd: [],
    general: []
  };

  for (const [name, pattern] of Object.entries(patterns)) {
    const cats = pattern.cats || pattern.categories || [];
    const isHigherEd = pattern.higher_ed === true;

    // Category 1 = CMS, 21 = LMS, 53 = SIS/Enterprise
    if (cats.includes(1)) {
      categories.cms.push(name);
    } else if (cats.includes(21)) {
      categories.lms.push(name);
    } else if (cats.includes(53)) {
      categories.sis.push(name);
    }

    if (isHigherEd) {
      categories.higherEd.push(name);
    } else {
      categories.general.push(name);
    }
  }

  return categories;
}

async function main() {
  try {
    console.log('Starting WebAppAnalyzer pattern import...');

    // Download all WebAppAnalyzer patterns
    const webappPatterns = await downloadPatterns();
    console.log(`Downloaded ${Object.keys(webappPatterns).length} total patterns from WebAppAnalyzer`);

    // Merge with our existing patterns (our patterns take precedence)
    const mergedPatterns = await mergeWithExistingPatterns(webappPatterns);
    console.log(`Final merged pattern count: ${Object.keys(mergedPatterns).length}`);

    // UNI-226: strip upstream `\;confidence:NN` / `\;version:\1` modifier suffixes. Left in place
    // they become literal requirements in every regex-tested field, so the pattern can never match
    // real content — 939 values shipped silently dead because this step did not exist.
    let stripped = 0;
    for (const [name, def] of Object.entries(mergedPatterns)) {
      if (name === '_metadata' || !def || typeof def !== 'object') continue;
      // UNI-237 Task 8: technologies with no evidence field the engine reads. See NEVER_FIREABLE
      // above — the override layer can't help here since it removes patterns, not technologies.
      if (NEVER_FIREABLE.has(name)) { delete mergedPatterns[name]; continue; }
      const raw = JSON.stringify(def);
      normalizeDefinition(def);
      // UNI-237: `text` is read by nothing in src/ and duplicates `html`. Strip at import so a
      // re-import does not resurrect 60 dead declarations.
      if (def && typeof def === 'object' && def.text !== undefined) delete def.text;
      if (JSON.stringify(def) !== raw) stripped++;
    }
    console.log(`Stripped Wappalyzer modifiers from ${stripped} technologies`);

    // Save the merged patterns
    // UNI-237: lives under patterns/generated/ — a build artifact, moved so the path itself says so.
    const outputPath = path.join(__dirname, '..', 'patterns', 'generated', 'webappanalyzer-merged.json');
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, mergedPatterns, { spaces: 2 });
    console.log(`Saved merged patterns to ${outputPath}`);

    // UNI-237: record the artifact's hash so scripts/lint-generated.js can detect a hand-edit.
    // Must be computed AFTER the file is written, from the file itself — hashing the in-memory
    // object would not catch an edit made to the file on disk, which is the whole point.
    const crypto = require('crypto');
    const artifactSha256 = crypto.createHash('sha256')
      .update(require('fs').readFileSync(outputPath))
      .digest('hex');

    // Generate a report
    const categories = categorizePatterns(mergedPatterns);

    console.log('\\n=== Pattern Summary ===');
    console.log(`CMS Patterns: ${categories.cms.length}`);
    console.log(`LMS Patterns: ${categories.lms.length}`);
    console.log(`SIS/Enterprise Patterns: ${categories.sis.length}`);
    console.log(`Higher Ed Specific: ${categories.higherEd.length}`);
    console.log(`General Patterns: ${categories.general.length}`);

    // Show some popular CMS patterns we now have
    const popularCMS = categories.cms.filter(name =>
      ['WordPress', 'Drupal', 'Joomla', 'Sitecore', 'Adobe Experience Manager',
       'Wix', 'Squarespace', 'Ghost', 'TYPO3', 'Umbraco', 'Kentico'].includes(name)
    );

    console.log('\\n=== Popular CMS Patterns Detected ===');
    console.log(popularCMS.join(', '));

    // Save a summary report
    const reportPath = path.join(__dirname, '..', 'patterns', 'import-report.json');
    await fs.writeJson(reportPath, {
      importDate: new Date().toISOString(),
      totalPatterns: Object.keys(mergedPatterns).length,
      webappPatternsImported: Object.keys(webappPatterns).length,
      categories,
      popularCMS,
      artifactSha256
    }, { spaces: 2 });

    console.log(`\\nImport complete! Report saved to ${reportPath}`);

  } catch (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { downloadPatterns, mergeWithExistingPatterns };