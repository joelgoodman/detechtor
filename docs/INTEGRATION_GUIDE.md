# deTECHtor Integration Guide

Complete guide for integrating deTECHtor into your applications.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Express.js Integration](#expressjs-integration)
3. [REST API Example](#rest-api-example)
4. [React Integration](#react-integration)
5. [Scheduled Scanning](#scheduled-scanning)
6. [Database Integration](#database-integration)
7. [Production Deployment](#production-deployment)
8. [Performance Optimization](#performance-optimization)
9. [Security Considerations](#security-considerations)

---

## Getting Started

### Installation

```bash
npm install @speedyu/detechtor
```

### Basic Integration

```javascript
const DeTECHtor = require('@speedyu/detechtor');

class TechScanner {
  constructor() {
    this.detector = null;
  }
  
  async initialize() {
    this.detector = new DeTECHtor();
    await this.detector.initialize();
  }
  
  async scan(url) {
    if (!this.detector) {
      await this.initialize();
    }
    return await this.detector.detectTechnologies(url);
  }
  
  async shutdown() {
    if (this.detector) {
      await this.detector.shutdown();
      this.detector = null;
    }
  }
}

module.exports = TechScanner;
```

---

## Express.js Integration

### Basic Express API

```javascript
const express = require('express');
const DeTECHtor = require('@speedyu/detechtor');

const app = express();
app.use(express.json());

// Initialize detector once at startup
let detector = null;

async function initializeDetector() {
  detector = new DeTECHtor();
  await detector.initialize();
  console.log('deTECHtor initialized');
}

// Scan endpoint
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    // Validate URL
    new URL(url);
    
    const results = await detector.detectTechnologies(url);
    
    res.json({
      success: true,
      data: results
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
    detector: detector ? 'initialized' : 'not initialized'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (detector) {
    await detector.shutdown();
  }
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;

initializeDetector().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

---

## REST API Example

Complete REST API with rate limiting, caching, and queuing.

```javascript
const express = require('express');
const DeTECHtor = require('@speedyu/detechtor');
const rateLimit = require('express-rate-limit');
const Redis = require('redis');
const Queue = require('bull');

const app = express();
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);

// Redis for caching
const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

redis.on('error', (err) => console.error('Redis error:', err));

// Bull queue for background jobs
const scanQueue = new Queue('tech-scans', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Initialize detector
let detector = null;

async function initializeDetector() {
  detector = new DeTECHtor();
  await detector.initialize();
}

// Process scan jobs
scanQueue.process(async (job) => {
  const { url, scanId } = job.data;
  
  try {
    const results = await detector.detectTechnologies(url);
    
    // Cache results for 24 hours
    await redis.setex(
      `scan:${scanId}`,
      86400,
      JSON.stringify(results)
    );
    
    return results;
  } catch (error) {
    throw new Error(`Scan failed: ${error.message}`);
  }
});

// API Routes

// Submit scan job
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    // Validate URL
    new URL(url);
    
    // Generate scan ID
    const scanId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check cache first
    const cached = await redis.get(`scan:${url}`);
    if (cached) {
      return res.json({
        success: true,
        cached: true,
        data: JSON.parse(cached)
      });
    }
    
    // Add to queue
    const job = await scanQueue.add({
      url,
      scanId
    });
    
    res.json({
      success: true,
      scanId,
      jobId: job.id,
      message: 'Scan queued'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get scan results
app.get('/api/scan/:scanId', async (req, res) => {
  const { scanId } = req.params;
  
  try {
    const results = await redis.get(`scan:${scanId}`);
    
    if (results) {
      res.json({
        success: true,
        data: JSON.parse(results)
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Scan not found or still processing'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get job status
app.get('/api/job/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    const job = await scanQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const state = await job.getState();
    const progress = job.progress();
    
    res.json({
      success: true,
      jobId,
      state,
      progress,
      result: state === 'completed' ? job.returnvalue : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Queue statistics
app.get('/api/stats', async (req, res) => {
  try {
    const waiting = await scanQueue.getWaitingCount();
    const active = await scanQueue.getActiveCount();
    const completed = await scanQueue.getCompletedCount();
    const failed = await scanQueue.getFailedCount();
    
    res.json({
      success: true,
      stats: {
        waiting,
        active,
        completed,
        failed,
        total: waiting + active + completed + failed
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  
  await scanQueue.close();
  await redis.quit();
  
  if (detector) {
    await detector.shutdown();
  }
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = process.env.PORT || 3000;

initializeDetector().then(() => {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
});

module.exports = app;
```

---

## React Integration

### Frontend Component

```javascript
import React, { useState } from 'react';
import axios from 'axios';

function TechScanner() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleScan = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Submit scan job
      const submitResponse = await axios.post('/api/scan', { url });
      const { scanId, jobId } = submitResponse.data;

      // Poll for results
      const pollResults = async () => {
        try {
          const response = await axios.get(`/api/scan/${scanId}`);
          setResults(response.data.data);
          setLoading(false);
        } catch (err) {
          if (err.response?.status === 404) {
            // Still processing, poll again
            setTimeout(pollResults, 2000);
          } else {
            setError(err.message);
            setLoading(false);
          }
        }
      };

      // Start polling after 3 seconds
      setTimeout(pollResults, 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setLoading(false);
    }
  };

  return (
    <div className="tech-scanner">
      <h1>Technology Scanner</h1>
      
      <form onSubmit={handleScan}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter website URL"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </form>

      {error && (
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="loading">
          <p>Scanning website... This may take a few moments.</p>
        </div>
      )}

      {results && (
        <div className="results">
          <h2>Results for {results.url}</h2>
          <p>Found {results.technologies.length} technologies</p>
          
          <div className="technologies">
            {results.technologies.map((tech, index) => (
              <div key={index} className="technology">
                <h3>
                  {tech.name}
                  {tech.isHigherEd && ' 🎓'}
                </h3>
                <p>{tech.description}</p>
                <div className="meta">
                  <span>Confidence: {tech.confidence}%</span>
                  <span>Categories: {tech.categories.join(', ')}</span>
                  {tech.version && <span>Version: {tech.version}</span>}
                </div>
              </div>
            ))}
          </div>

          {results.inferredStack && (
            <div className="stack">
              <h3>Technology Stack</h3>
              {results.inferredStack.components.cms && (
                <p>CMS: {results.inferredStack.components.cms}</p>
              )}
              {results.inferredStack.components.lms && (
                <p>LMS: {results.inferredStack.components.lms}</p>
              )}
              {results.inferredStack.components.sis && (
                <p>SIS: {results.inferredStack.components.sis}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TechScanner;
```

---

## Scheduled Scanning

Automated scanning with node-cron.

```javascript
const cron = require('node-cron');
const DeTECHtor = require('@speedyu/detechtor');
const { MongoClient } = require('mongodb');

class ScheduledScanner {
  constructor(mongoUri, dbName) {
    this.mongoUri = mongoUri;
    this.dbName = dbName;
    this.detector = null;
    this.db = null;
  }

  async initialize() {
    // Initialize detector
    this.detector = new DeTECHtor();
    await this.detector.initialize();

    // Connect to MongoDB
    const client = await MongoClient.connect(this.mongoUri);
    this.db = client.db(this.dbName);

    console.log('Scheduled scanner initialized');
  }

  async scanWebsite(url) {
    try {
      console.log(`Scanning ${url}...`);
      
      const results = await this.detector.detectTechnologies(url);
      
      // Save to database
      await this.db.collection('scans').insertOne({
        url,
        timestamp: new Date(),
        technologies: results.technologies,
        stack: results.inferredStack,
        meta: results.meta
      });

      console.log(`Scan completed for ${url}`);
      return results;
    } catch (error) {
      console.error(`Scan failed for ${url}:`, error.message);
      
      // Log error to database
      await this.db.collection('scan_errors').insertOne({
        url,
        timestamp: new Date(),
        error: error.message
      });
    }
  }

  async getWebsitesToScan() {
    // Get websites from database
    const websites = await this.db
      .collection('websites')
      .find({ active: true })
      .toArray();
    
    return websites.map(w => w.url);
  }

  async runDailyScan() {
    console.log('Starting daily scan...');
    
    const urls = await this.getWebsitesToScan();
    console.log(`Scanning ${urls.length} websites`);

    for (const url of urls) {
      await this.scanWebsite(url);
      
      // Rate limiting - wait 5 seconds between scans
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('Daily scan completed');
  }

  startSchedule() {
    // Run daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.runDailyScan();
    });

    console.log('Scan schedule started (daily at 2 AM)');
  }

  async shutdown() {
    if (this.detector) {
      await this.detector.shutdown();
    }
    console.log('Scanner shut down');
  }
}

// Usage
async function main() {
  const scanner = new ScheduledScanner(
    'mongodb://localhost:27017',
    'tech_scanner'
  );

  await scanner.initialize();
  scanner.startSchedule();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await scanner.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);

module.exports = ScheduledScanner;
```

---

## Database Integration

### MongoDB Integration

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const { MongoClient } = require('mongodb');

class TechScannerDB {
  constructor(mongoUri, dbName) {
    this.mongoUri = mongoUri;
    this.dbName = dbName;
    this.detector = null;
    this.db = null;
  }

  async initialize() {
    this.detector = new DeTECHtor();
    const client = await MongoClient.connect(this.mongoUri);
    this.db = client.db(this.dbName);
    
    // Create indexes
    await this.db.collection('scans').createIndex({ url: 1, timestamp: -1 });
    await this.db.collection('technologies').createIndex({ name: 1 });
  }

  async scanAndStore(url) {
    try {
      // Check if recently scanned (within 24 hours)
      const recent = await this.db.collection('scans').findOne({
        url,
        timestamp: { $gte: new Date(Date.now() - 86400000) }
      });

      if (recent) {
        console.log('Using cached scan results');
        return recent;
      }

      // Perform scan
      const results = await this.detector.detectTechnologies(url);

      // Store scan
      const scan = {
        url,
        finalUrl: results.finalUrl,
        timestamp: new Date(),
        technologies: results.technologies,
        stack: results.inferredStack,
        scannedPages: results.scannedPages,
        meta: results.meta
      };

      await this.db.collection('scans').insertOne(scan);

      // Update technology statistics
      for (const tech of results.technologies) {
        await this.db.collection('technologies').updateOne(
          { name: tech.name },
          {
            $set: {
              name: tech.name,
              categories: tech.categories,
              isHigherEd: tech.isHigherEd,
              description: tech.description
            },
            $inc: { detectionCount: 1 },
            $addToSet: { seenOnUrls: url },
            $max: { lastSeen: new Date() }
          },
          { upsert: true }
        );
      }

      return scan;
    } catch (error) {
      console.error(`Scan failed:`, error);
      throw error;
    }
  }

  async getScanHistory(url, limit = 10) {
    return await this.db
      .collection('scans')
      .find({ url })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  async getTechnologyStats() {
    return await this.db
      .collection('technologies')
      .find()
      .sort({ detectionCount: -1 })
      .limit(50)
      .toArray();
  }

  async compareScans(url, days = 30) {
    const scans = await this.db
      .collection('scans')
      .find({
        url,
        timestamp: { $gte: new Date(Date.now() - days * 86400000) }
      })
      .sort({ timestamp: 1 })
      .toArray();

    if (scans.length < 2) {
      return { changes: [], scans: scans.length };
    }

    const changes = [];
    const latest = scans[scans.length - 1];
    const previous = scans[scans.length - 2];

    // Find added technologies
    const previousNames = new Set(previous.technologies.map(t => t.name));
    const latestNames = new Set(latest.technologies.map(t => t.name));

    for (const name of latestNames) {
      if (!previousNames.has(name)) {
        changes.push({
          type: 'added',
          technology: name,
          timestamp: latest.timestamp
        });
      }
    }

    // Find removed technologies
    for (const name of previousNames) {
      if (!latestNames.has(name)) {
        changes.push({
          type: 'removed',
          technology: name,
          timestamp: latest.timestamp
        });
      }
    }

    return { changes, scans: scans.length };
  }

  async shutdown() {
    if (this.detector) {
      await this.detector.shutdown();
    }
  }
}

module.exports = TechScannerDB;
```

---

## Production Deployment

### Docker Configuration

**Dockerfile:**

```dockerfile
FROM node:18-alpine

# Install Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Chromium path
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - MONGODB_URI=mongodb://mongo:27017/techscanner
    depends_on:
      - redis
      - mongo
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

volumes:
  redis-data:
  mongo-data:
```

---

## Performance Optimization

### Connection Pooling

```javascript
class DetectorPool {
  constructor(size = 3) {
    this.size = size;
    this.pool = [];
    this.queue = [];
  }

  async initialize() {
    for (let i = 0; i < this.size; i++) {
      const detector = new DeTECHtor();
      await detector.initialize();
      this.pool.push({ detector, busy: false });
    }
  }

  async acquire() {
    const available = this.pool.find(d => !d.busy);
    
    if (available) {
      available.busy = true;
      return available.detector;
    }

    // Wait for available detector
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(detector) {
    const poolItem = this.pool.find(d => d.detector === detector);
    
    if (poolItem) {
      poolItem.busy = false;

      if (this.queue.length > 0) {
        const resolve = this.queue.shift();
        poolItem.busy = true;
        resolve(poolItem.detector);
      }
    }
  }

  async shutdown() {
    for (const { detector } of this.pool) {
      await detector.shutdown();
    }
  }
}

// Usage
const pool = new DetectorPool(5);
await pool.initialize();

async function scan(url) {
  const detector = await pool.acquire();
  try {
    return await detector.detectTechnologies(url);
  } finally {
    pool.release(detector);
  }
}
```

### Caching Strategy

```javascript
const NodeCache = require('node-cache');

class CachedScanner {
  constructor(cacheTTL = 86400) { // 24 hours default
    this.detector = new DeTECHtor();
    this.cache = new NodeCache({ stdTTL: cacheTTL });
  }

  async scan(url) {
    // Check cache
    const cached = this.cache.get(url);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Perform scan
    const results = await this.detector.detectTechnologies(url);

    // Cache results
    this.cache.set(url, results);

    return { ...results, cached: false };
  }

  async shutdown() {
    await this.detector.shutdown();
    this.cache.close();
  }
}
```

---

## Security Considerations

### Input Validation

```javascript
const validator = require('validator');

function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  if (!validator.isURL(url, { 
    protocols: ['http', 'https'],
    require_protocol: true 
  })) {
    throw new Error('Invalid URL format');
  }

  // Block internal/private IPs
  const hostname = new URL(url).hostname;
  if (
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
  ) {
    throw new Error('Scanning internal/private IPs is not allowed');
  }

  return true;
}

// Usage in API
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;

  try {
    validateUrl(url);
    const results = await detector.detectTechnologies(url);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

### Rate Limiting per User

```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('redis');

const redis = Redis.createClient();

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many scan requests, please try again later'
});

app.use('/api/scan', limiter);
```

---

## Complete Example Application

See the [examples](../examples/) directory for complete working applications:

- `examples/express-api/` - Full Express.js API server
- `examples/react-app/` - React frontend application
- `examples/scheduled-scanner/` - Automated scanning service
- `examples/batch-processor/` - Batch processing system

---

## Support

For integration questions:
- [GitHub Issues](https://github.com/speedyu/detechtor/issues)
- [API Documentation](./API_DOCUMENTATION.md)
- [Quick Reference](./QUICK_REFERENCE.md)

---

**Version:** 2.0.0  
**Last Updated:** 2025-11-16
