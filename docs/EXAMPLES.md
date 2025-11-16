# deTECHtor Examples

Comprehensive collection of real-world usage examples.

## Table of Contents

1. [Basic Examples](#basic-examples)
2. [Express.js Examples](#expressjs-examples)
3. [Database Examples](#database-examples)
4. [Advanced Examples](#advanced-examples)
5. [Production Examples](#production-examples)

---

## Basic Examples

### Example 1: Simple Website Scan

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function basicScan() {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies('https://mit.edu');
    
    console.log(`\nScan Results for ${results.url}`);
    console.log(`─────────────────────────────────────`);
    console.log(`Technologies Found: ${results.technologies.length}`);
    console.log(`Pages Scanned: ${results.scannedPages}`);
    console.log(`Scan Duration: ${results.meta.scanDuration}ms\n`);
    
    results.technologies.forEach(tech => {
      console.log(`✓ ${tech.name} (${tech.confidence}% confidence)`);
    });
  } finally {
    await detector.shutdown();
  }
}

basicScan();
```

---

### Example 2: Scan Multiple Universities

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function scanUniversities() {
  const universities = [
    { name: 'MIT', url: 'https://mit.edu' },
    { name: 'Harvard', url: 'https://harvard.edu' },
    { name: 'Stanford', url: 'https://stanford.edu' },
    { name: 'Berkeley', url: 'https://berkeley.edu' }
  ];

  const detector = new DeTECHtor();
  const results = [];

  try {
    for (const university of universities) {
      console.log(`\nScanning ${university.name}...`);
      
      try {
        const result = await detector.detectTechnologies(university.url);
        
        results.push({
          name: university.name,
          url: university.url,
          cms: result.inferredStack.components.cms,
          lms: result.inferredStack.components.lms,
          sis: result.inferredStack.components.sis,
          totalTech: result.technologies.length,
          higherEdTech: result.technologies.filter(t => t.isHigherEd).length
        });
        
        console.log(`✓ ${university.name} scan completed`);
      } catch (error) {
        console.error(`✗ ${university.name} scan failed: ${error.message}`);
        results.push({
          name: university.name,
          url: university.url,
          error: error.message
        });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Display comparison table
    console.log('\n\nUniversity Technology Comparison');
    console.log('═══════════════════════════════════════════════════════');
    console.table(results);

  } finally {
    await detector.shutdown();
  }
}

scanUniversities();
```

---

### Example 3: Filter by Technology Category

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function findCMSandLMS(url) {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies(url);
    
    // Filter by category
    const cms = results.technologies.filter(t => 
      t.categories.includes('CMS')
    );
    
    const lms = results.technologies.filter(t => 
      t.categories.includes('LMS')
    );
    
    const sis = results.technologies.filter(t => 
      t.categories.includes('SIS')
    );

    console.log(`\nTechnology Stack for ${url}`);
    console.log('─────────────────────────────────────\n');

    if (cms.length > 0) {
      console.log('📝 Content Management Systems:');
      cms.forEach(tech => {
        console.log(`   • ${tech.name} (${tech.confidence}% confidence)`);
        if (tech.version) console.log(`     Version: ${tech.version}`);
      });
      console.log();
    }

    if (lms.length > 0) {
      console.log('🎓 Learning Management Systems:');
      lms.forEach(tech => {
        console.log(`   • ${tech.name} (${tech.confidence}% confidence)`);
        if (tech.version) console.log(`     Version: ${tech.version}`);
      });
      console.log();
    }

    if (sis.length > 0) {
      console.log('📊 Student Information Systems:');
      sis.forEach(tech => {
        console.log(`   • ${tech.name} (${tech.confidence}% confidence)`);
        if (tech.version) console.log(`     Version: ${tech.version}`);
      });
      console.log();
    }

    // Display inferred stack
    if (results.inferredStack.inferences.length > 0) {
      console.log('💡 Stack Insights:');
      results.inferredStack.inferences.forEach(inference => {
        console.log(`   • ${inference}`);
      });
    }

  } finally {
    await detector.shutdown();
  }
}

findCMSandLMS('https://example.edu');
```

---

## Express.js Examples

### Example 4: Simple Express API

```javascript
const express = require('express');
const DeTECHtor = require('@speedyu/detechtor');

const app = express();
app.use(express.json());

let detector = null;

// Initialize detector on startup
async function initialize() {
  detector = new DeTECHtor();
  await detector.initialize();
  console.log('Detector initialized');
}

// Scan endpoint
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    // Validate URL
    new URL(url);

    const results = await detector.detectTechnologies(url);

    res.json({
      success: true,
      data: {
        url: results.url,
        technologies: results.technologies,
        stack: results.inferredStack,
        scannedPages: results.scannedPages,
        scanDuration: results.meta.scanDuration
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    detector: detector ? 'ready' : 'not initialized'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (detector) await detector.shutdown();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

---

### Example 5: Express API with Caching

```javascript
const express = require('express');
const DeTECHtor = require('@speedyu/detechtor');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

const detector = new DeTECHtor();
const cache = new NodeCache({ stdTTL: 86400 }); // 24 hour cache

app.post('/api/scan', async (req, res) => {
  const { url, skipCache = false } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    // Check cache first
    if (!skipCache) {
      const cached = cache.get(url);
      if (cached) {
        return res.json({
          success: true,
          cached: true,
          data: cached
        });
      }
    }

    // Perform scan
    const results = await detector.detectTechnologies(url);

    // Cache results
    cache.set(url, results);

    res.json({
      success: true,
      cached: false,
      data: results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear cache endpoint
app.delete('/api/cache/:url?', (req, res) => {
  if (req.params.url) {
    cache.del(req.params.url);
    res.json({ message: 'Cache cleared for URL' });
  } else {
    cache.flushAll();
    res.json({ message: 'All cache cleared' });
  }
});

// Cache stats
app.get('/api/cache/stats', (req, res) => {
  const stats = cache.getStats();
  res.json(stats);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## Database Examples

### Example 6: MongoDB Integration

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const { MongoClient } = require('mongodb');

async function scanAndStore(url, mongoUri = 'mongodb://localhost:27017') {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db('techscanner');
  const detector = new DeTECHtor();

  try {
    // Check if recently scanned (within 24 hours)
    const recentScan = await db.collection('scans').findOne({
      url,
      timestamp: { $gte: new Date(Date.now() - 86400000) }
    });

    if (recentScan) {
      console.log('Using cached scan from database');
      return recentScan;
    }

    // Perform scan
    console.log(`Scanning ${url}...`);
    const results = await detector.detectTechnologies(url);

    // Store in database
    const scan = {
      url,
      finalUrl: results.finalUrl,
      timestamp: new Date(),
      technologies: results.technologies,
      stack: results.inferredStack,
      meta: results.meta
    };

    await db.collection('scans').insertOne(scan);

    // Update technology statistics
    for (const tech of results.technologies) {
      await db.collection('technologies').updateOne(
        { name: tech.name },
        {
          $set: {
            name: tech.name,
            categories: tech.categories,
            isHigherEd: tech.isHigherEd
          },
          $inc: { detectionCount: 1 },
          $addToSet: { seenOnUrls: url },
          $max: { lastSeen: new Date() }
        },
        { upsert: true }
      );
    }

    console.log('Scan stored in database');
    return scan;

  } finally {
    await detector.shutdown();
    await client.close();
  }
}

// Usage
scanAndStore('https://mit.edu').then(result => {
  console.log('Scan complete');
  console.log(`Found ${result.technologies.length} technologies`);
});
```

---

### Example 7: PostgreSQL Integration

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const { Pool } = require('pg');

async function scanAndStorePostgres(url) {
  const pool = new Pool({
    host: 'localhost',
    database: 'techscanner',
    port: 5432
  });

  const detector = new DeTECHtor();

  try {
    // Perform scan
    const results = await detector.detectTechnologies(url);

    // Store scan
    const scanResult = await pool.query(
      `INSERT INTO scans (url, final_url, timestamp, scan_duration, response_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        results.url,
        results.finalUrl,
        new Date(),
        results.meta.scanDuration,
        results.meta.responseCode
      ]
    );

    const scanId = scanResult.rows[0].id;

    // Store technologies
    for (const tech of results.technologies) {
      await pool.query(
        `INSERT INTO detected_technologies 
         (scan_id, name, confidence, categories, version, is_higher_ed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          scanId,
          tech.name,
          tech.confidence,
          JSON.stringify(tech.categories),
          tech.version,
          tech.isHigherEd
        ]
      );
    }

    console.log(`Scan stored with ID: ${scanId}`);
    return scanId;

  } finally {
    await detector.shutdown();
    await pool.end();
  }
}

// Usage
scanAndStorePostgres('https://harvard.edu');
```

---

## Advanced Examples

### Example 8: Custom Configuration

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const config = require('@speedyu/detechtor/src/config');

async function advancedScan(url) {
  // Customize configuration
  config.verbose = true;
  config.minConfidence = 70;
  config.maxPagesToScan = 10;
  config.timeout = 60000;
  config.includeEvidence = true;

  const detector = new DeTECHtor();

  try {
    const results = await detector.detectTechnologies(url);

    console.log(`\nAdvanced Scan Results`);
    console.log(`═══════════════════════════════════════`);
    console.log(`URL: ${results.url}`);
    console.log(`Technologies: ${results.technologies.length}`);
    console.log(`Pages Scanned: ${results.scannedPages}`);
    console.log(`Duration: ${results.meta.scanDuration}ms\n`);

    // High-confidence technologies only
    const highConfidence = results.technologies.filter(t => t.confidence >= 90);
    
    console.log(`High Confidence Technologies (90%+):`);
    highConfidence.forEach(tech => {
      console.log(`  ${tech.name} - ${tech.confidence}%`);
      if (tech.evidence.length > 0) {
        console.log(`    Evidence: ${tech.evidence[0]}`);
      }
    });

    return results;

  } finally {
    await detector.shutdown();
  }
}

advancedScan('https://example.edu');
```

---

### Example 9: Retry Logic with Exponential Backoff

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function scanWithRetry(url, maxRetries = 3) {
  const detector = new DeTECHtor();
  let lastError;

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt} of ${maxRetries}...`);
        
        const results = await detector.detectTechnologies(url);
        console.log(`✓ Scan successful on attempt ${attempt}`);
        
        return results;

      } catch (error) {
        lastError = error;
        console.error(`✗ Attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Scan failed after ${maxRetries} attempts: ${lastError.message}`);

  } finally {
    await detector.shutdown();
  }
}

// Usage
scanWithRetry('https://example.edu', 3)
  .then(results => {
    console.log('\nScan successful!');
    console.log(`Found ${results.technologies.length} technologies`);
  })
  .catch(error => {
    console.error('\nScan failed:', error.message);
  });
```

---

### Example 10: Technology Change Detection

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const fs = require('fs-extra');
const path = require('path');

async function detectChanges(url) {
  const detector = new DeTECHtor();
  const cacheDir = './scan-cache';
  const cacheFile = path.join(cacheDir, `${encodeURIComponent(url)}.json`);

  try {
    // Ensure cache directory exists
    await fs.ensureDir(cacheDir);

    // Perform current scan
    const currentScan = await detector.detectTechnologies(url);
    const currentTechs = new Set(currentScan.technologies.map(t => t.name));

    // Check for previous scan
    let changes = { added: [], removed: [], unchanged: [] };

    if (await fs.pathExists(cacheFile)) {
      const previousScan = await fs.readJson(cacheFile);
      const previousTechs = new Set(previousScan.technologies.map(t => t.name));

      // Find added technologies
      for (const tech of currentTechs) {
        if (!previousTechs.has(tech)) {
          changes.added.push(tech);
        } else {
          changes.unchanged.push(tech);
        }
      }

      // Find removed technologies
      for (const tech of previousTechs) {
        if (!currentTechs.has(tech)) {
          changes.removed.push(tech);
        }
      }

      console.log(`\nTechnology Changes for ${url}`);
      console.log(`═══════════════════════════════════════`);

      if (changes.added.length > 0) {
        console.log(`\n✅ Added (${changes.added.length}):`);
        changes.added.forEach(tech => console.log(`   + ${tech}`));
      }

      if (changes.removed.length > 0) {
        console.log(`\n❌ Removed (${changes.removed.length}):`);
        changes.removed.forEach(tech => console.log(`   - ${tech}`));
      }

      if (changes.added.length === 0 && changes.removed.length === 0) {
        console.log(`\n✓ No changes detected`);
      }
    } else {
      console.log(`\nFirst scan for ${url} - no previous data to compare`);
    }

    // Save current scan
    await fs.writeJson(cacheFile, currentScan, { spaces: 2 });

    return { currentScan, changes };

  } finally {
    await detector.shutdown();
  }
}

// Usage
detectChanges('https://mit.edu')
  .then(({ changes }) => {
    console.log(`\nTotal changes: ${changes.added.length + changes.removed.length}`);
  });
```

---

## Production Examples

### Example 11: Worker Queue with Bull

```javascript
const Queue = require('bull');
const DeTECHtor = require('@speedyu/detechtor');
const { MongoClient } = require('mongodb');

// Create queue
const scanQueue = new Queue('tech-scans', {
  redis: { port: 6379, host: 'localhost' }
});

// Initialize detector
let detector = null;
let db = null;

async function initialize() {
  detector = new DeTECHtor();
  await detector.initialize();

  const client = await MongoClient.connect('mongodb://localhost:27017');
  db = client.db('techscanner');
}

// Process jobs
scanQueue.process(async (job) => {
  const { url } = job.data;

  try {
    // Update progress
    job.progress(10);

    // Perform scan
    const results = await detector.detectTechnologies(url);

    job.progress(80);

    // Store results
    await db.collection('scans').insertOne({
      url,
      timestamp: new Date(),
      technologies: results.technologies,
      stack: results.inferredStack,
      meta: results.meta
    });

    job.progress(100);

    return results;

  } catch (error) {
    console.error(`Scan failed for ${url}:`, error.message);
    throw error;
  }
});

// Job events
scanQueue.on('completed', (job, result) => {
  console.log(`✓ Job ${job.id} completed: ${result.technologies.length} technologies found`);
});

scanQueue.on('failed', (job, err) => {
  console.error(`✗ Job ${job.id} failed: ${err.message}`);
});

// Start worker
initialize().then(() => {
  console.log('Worker started and ready to process scans');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await scanQueue.close();
  if (detector) await detector.shutdown();
  process.exit(0);
});
```

---

### Example 12: Scheduled Daily Scans

```javascript
const cron = require('node-cron');
const DeTECHtor = require('@speedyu/detechtor');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

class DailyScanner {
  constructor(mongoUri, emailConfig) {
    this.mongoUri = mongoUri;
    this.emailConfig = emailConfig;
    this.detector = null;
    this.db = null;
    this.transporter = null;
  }

  async initialize() {
    this.detector = new DeTECHtor();
    await this.detector.initialize();

    const client = await MongoClient.connect(this.mongoUri);
    this.db = client.db('techscanner');

    this.transporter = nodemailer.createTransport(this.emailConfig);

    console.log('Daily scanner initialized');
  }

  async scanWebsite(url) {
    try {
      const results = await this.detector.detectTechnologies(url);

      await this.db.collection('scans').insertOne({
        url,
        timestamp: new Date(),
        technologies: results.technologies,
        stack: results.inferredStack
      });

      return { success: true, url, techCount: results.technologies.length };

    } catch (error) {
      await this.db.collection('scan_errors').insertOne({
        url,
        timestamp: new Date(),
        error: error.message
      });

      return { success: false, url, error: error.message };
    }
  }

  async runDailyScan() {
    console.log('\n═══════════════════════════════════════');
    console.log(`Daily Scan Started: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════\n');

    // Get active websites from database
    const websites = await this.db
      .collection('websites')
      .find({ active: true })
      .toArray();

    const results = [];

    for (const site of websites) {
      console.log(`Scanning ${site.url}...`);
      const result = await this.scanWebsite(site.url);
      results.push(result);

      // Rate limiting
      await new Promise(r => setTimeout(r, 5000));
    }

    // Send summary email
    await this.sendSummaryEmail(results);

    console.log('\n═══════════════════════════════════════');
    console.log('Daily Scan Completed');
    console.log('═══════════════════════════════════════\n');
  }

  async sendSummaryEmail(results) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const html = `
      <h2>Daily Scan Summary</h2>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      
      <h3>Statistics</h3>
      <ul>
        <li>Total Scans: ${results.length}</li>
        <li>Successful: ${successful.length}</li>
        <li>Failed: ${failed.length}</li>
      </ul>

      ${failed.length > 0 ? `
        <h3>Failed Scans</h3>
        <ul>
          ${failed.map(r => `<li>${r.url}: ${r.error}</li>`).join('')}
        </ul>
      ` : ''}
    `;

    await this.transporter.sendMail({
      from: 'scanner@example.com',
      to: 'admin@example.com',
      subject: `Daily Scan Summary - ${new Date().toLocaleDateString()}`,
      html
    });
  }

  startSchedule() {
    // Run daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.runDailyScan();
    });

    console.log('Scheduled daily scans at 2:00 AM');
  }
}

// Usage
const scanner = new DailyScanner(
  'mongodb://localhost:27017',
  {
    host: 'smtp.example.com',
    port: 587,
    auth: { user: 'user', pass: 'pass' }
  }
);

scanner.initialize().then(() => {
  scanner.startSchedule();
});
```

---

## More Examples

For additional examples, see:
- [API Documentation - Examples Section](./API_DOCUMENTATION.md#examples)
- [Integration Guide](./INTEGRATION_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)

---

**Version:** 2.0.0  
**Last Updated:** 2025-11-16
