/* Codetime minimal server: single port HTTP + WS + static */
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { WebSocketServer } = require('ws');
const { createStore, minuteBucket } = require('./store');
const session = require('express-session');
const passport = require('passport');
const { initPassport } = require('./auth');
const client = require('prom-client');
const { parseRange, isValidProjectName } = require('./utils');
const { migrateIfNeeded } = require('./migrate');

// Config
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const WS_PATH = process.env.WS_PATH || '/ws';
const CONCURRENCY_POLICY = (process.env.CODETIME_CONCURRENCY_POLICY || 'exclusive').toLowerCase(); // 'exclusive' | 'allow-multi'
const RATE_HTTP_PER_MIN = process.env.RATE_HTTP_PER_MIN ? Number(process.env.RATE_HTTP_PER_MIN) : 1200; // per token
const RATE_WS_PER_MIN = process.env.RATE_WS_PER_MIN ? Number(process.env.RATE_WS_PER_MIN) : 120; // per token (heartbeats)

// Store (MySQL-backed if env provided; else in-memory)
const store = createStore();

// Track active connections (for health/debug)
let activeWsCount = 0;

// HTTP app
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json());

// Sessions & Passport (optional)
if (process.env.SESSION_SECRET) {
  app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  initPassport(store);
  app.use(passport.initialize());
  app.use(passport.session());
}

// Metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();
const httpRequests = new client.Counter({ name: 'http_requests_total', help: 'HTTP requests', labelNames: ['route','method','status'] });
const httpDuration = new client.Histogram({ name: 'http_duration_seconds', help: 'HTTP duration seconds', labelNames: ['route','method','status'], buckets: [0.01,0.05,0.1,0.2,0.5,1,2] });
const wsActive = new client.Gauge({ name: 'ws_active_connections', help: 'Active WS connections' });
const wsHeartbeats = new client.Counter({ name: 'ws_heartbeats_total', help: 'Total WS heartbeats' });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// HTTP timing middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const sec = Number(end - start) / 1e9;
    const route = req.route && req.route.path ? req.route.path : req.path;
    httpDuration.labels(route, req.method, String(res.statusCode)).observe(sec);
    httpRequests.labels(route, req.method, String(res.statusCode)).inc();
  });
  next();
});

// Auth helpers
async function bearerToUserId(authorization) {
  const m = (authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  if (store.getUserIdByToken) {
    try { return await store.getUserIdByToken(token); } catch { return null; }
  }
  // In-memory fallback: treat token as user id
  return token || null;
}

// Replace basic authMiddleware with bearer validation but allow anonymous read
async function authMiddleware(req, res, next) {
  const uid = await bearerToUserId(req.headers['authorization'] || '');
  req.userId = uid || null;
  next();
}

// In-memory simple rate limiter: token -> { windowStart, count }
const httpRate = new Map();
function httpRateLimit(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : 'anonymous';
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const st = httpRate.get(token);
  if (!st || st.windowStart !== minute) {
    httpRate.set(token, { windowStart: minute, count: 1 });
    return next();
  }
  if (st.count >= RATE_HTTP_PER_MIN) {
    return res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: 'Too many requests' });
  }
  st.count++;
  next();
}

// Apply rate limiter for API routes
app.use('/api', httpRateLimit);

// HTTP app routes
app.get('/api/health', (req, res) => {
  const hasDb = !!process.env.DB_HOST;
  res.json({ ok: true, data: { status: 'ok', db: hasDb ? 'configured' : 'in-memory', build: { version: 'dev', ts: Date.now() }, ws: { active: activeWsCount } } });
});

app.get('/api/stats/summary', authMiddleware, async (req, res) => {
  try {
    const range = String(req.query.range || '').toLowerCase();
    if (!range) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'range is required' });
    const project = req.query.project ? String(req.query.project) : undefined;
    const token = (req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
    const data = await store.summarize(range, token, project, parseRange);
    res.json({ ok: true, data, meta: { range, tzUsed: Intl.DateTimeFormat().resolvedOptions().timeZone, concurrencyPolicy: CONCURRENCY_POLICY } });
  } catch (e) {
    res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message });
  }
});

app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const range = req.query.range ? String(req.query.range).toLowerCase() : undefined;
    const token = (req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
    const arr = await store.listProjects(range, token, parseRange);
    res.json({ ok: true, data: arr });
  } catch (e) {
    res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message });
  }
});

app.get('/api/stats/daily', authMiddleware, async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!from || !to) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'from and to are required (YYYY-MM-DD)' });
    const project = req.query.project ? String(req.query.project) : undefined;
    const token = (req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
    const data = await store.dailyRange(from, to, token, project);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message });
  }
});

// Session guard for PAT APIs
function requireSession(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Login required' });
}

// GitHub OAuth routes (enabled only if SESSION_SECRET and GitHub creds exist)
app.get('/auth/github', (req, res, next) => {
  if (!process.env.SESSION_SECRET || !process.env.GITHUB_CLIENT_ID) return res.status(503).send('GitHub OAuth not configured');
  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});
app.get('/auth/github/callback', (req, res, next) => {
  if (!process.env.SESSION_SECRET || !process.env.GITHUB_CLIENT_ID) return res.redirect('/');
  passport.authenticate('github', { failureRedirect: '/' })(req, res, () => res.redirect('/'));
});

// PAT management (session required)
app.post('/api/token/rotate', requireSession, async (req, res) => {
  try {
    if (!store.createToken) return res.status(503).json({ ok: false, code: 'UNAVAILABLE', message: 'Token service not available' });
    const label = req.body && req.body.label;
    const result = await store.createToken(req.user.id, label);
    res.json({ ok: true, data: { token: result.token } }); // show once
  } catch (e) {
    res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message });
  }
});
app.get('/api/token/list', requireSession, async (req, res) => {
  try {
    const rows = await store.listTokens(req.user.id);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message }); }
});
app.post('/api/token/revoke', requireSession, async (req, res) => {
  try {
    const id = req.body && req.body.id;
    if (!id) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'id required' });
    await store.revokeToken(req.user.id, Number(id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, code: 'INTERNAL', message: e.message }); }
});

// Static hosting (placeholder). In production, place Vue build into /public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next();
  });
});

// Create HTTP server and attach WS
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: WS_PATH });

// WS rate limit per token per minute
const wsRate = new Map(); // token -> { windowStart, count }

wss.on('connection', (ws, req) => {
  activeWsCount++;
  wsActive.set(activeWsCount);
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || undefined;
    const clientId = url.searchParams.get('clientId') || undefined;
    const ctx = { userId: null, clientId: clientId || 'unknown', lastHeartbeatMs: 0 };

    async function ensureUserId(t) {
      if (ctx.userId) return true;
      if (!t) return false;
      if (store.getUserIdByToken) {
        const uid = await store.getUserIdByToken(t);
        if (!uid) return false;
        ctx.userId = uid; return true;
      } else { ctx.userId = t; return true; }
    }

    ws.on('message', async (buf) => {
      let msg; try { msg = JSON.parse(buf.toString()); } catch { ws.send(JSON.stringify({ ok: false, code: 'INVALID_JSON', message: 'Payload must be JSON' })); return; }
      const projectName = msg.projectName ? String(msg.projectName) : undefined;
      if (!isValidProjectName(projectName || '')) { ws.send(JSON.stringify({ ok: false, code: 'INVALID_PAYLOAD', message: 'invalid projectName' })); return; }
      const tok = msg.token || token;
      // WS rate limit
      const now = Date.now();
      const minuteWindow = Math.floor(now / 60000);
      const st = wsRate.get(tok || 'anonymous');
      if (!st || st.windowStart !== minuteWindow) {
        wsRate.set(tok || 'anonymous', { windowStart: minuteWindow, count: 1 });
      } else if (st.count >= RATE_WS_PER_MIN) {
        ws.send(JSON.stringify({ ok: false, code: 'RATE_LIMITED', message: 'Too many heartbeats' }));
        return;
      } else {
        st.count++;
      }
      let ok;
      try {
        ok = await ensureUserId(tok);
      } catch (e) {
        ws.send(JSON.stringify({ ok: false, code: 'INTERNAL', message: e && e.message || 'auth error' }));
        return;
      }
      if (!ok) { ws.send(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid token' })); ws.close(); return; }
      const nowMs = Date.now();
      const bucket = minuteBucket(nowMs);
      try { await store.addMinute(tok, projectName, bucket); wsHeartbeats.inc(); ctx.lastHeartbeatMs = nowMs; ws.send(JSON.stringify({ ok: true, minute: bucket })); }
      catch (e) { const code = e && e.code || 'INTERNAL'; ws.send(JSON.stringify({ ok: false, code, message: e.message || 'error' })); }
    });

    ws.on('close', () => { activeWsCount--; wsActive.set(activeWsCount); });
    ws.on('error', () => {});
  } catch (e) { activeWsCount--; wsActive.set(activeWsCount); }
});


server.listen(PORT, () => {
  console.log(`[codetime] Server listening on http://localhost:${PORT} (WS path: ${WS_PATH}, policy: ${CONCURRENCY_POLICY})`);
});
