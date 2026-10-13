'use strict';
/**
 * Vision7 BioStar Relay
 *
 * A small HTTPS gateway that sits on the club's LAN between the Vision7 CRM (in the browser) and the
 * BioStar 2 server. The relay logs in to BioStar with its own account and injects the session, so BioStar
 * credentials never reach a browser:
 *
 *   CRM (browser) ──►  RELAY (this)  ──bs-session-id injected──►  BioStar 2
 *
 * Contract the CRM relies on (see vision7_crm/lib/biostar-relay.ts):
 *   GET  /relay/health      → { ok, reachable, biostar, ... }
 *   ANY  /api/*             → proxied to BioStar, raw BioStar JSON back
 *
 * Zero dependencies — Node's standard library only, so there is nothing to `npm install`.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = __dirname;
const VERSION = '2.0.0';

// ── Config ──────────────────────────────────────────────────────────────────────

function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function loadConfig(env = process.env, file = path.join(ROOT, 'config.env')) {
  const fromFile = fs.existsSync(file) ? parseEnvFile(fs.readFileSync(file, 'utf8')) : {};
  const get = (k, d = '') => (fromFile[k] !== undefined && fromFile[k] !== '' ? fromFile[k] : env[k] !== undefined && env[k] !== '' ? env[k] : d);
  // The first-generation relay used BIOSTAR_LOGIN and PORT — accept both so an existing config.env keeps working.
  const getAny = (keys, d = '') => {
    for (const k of keys) {
      const v = get(k);
      if (v !== '') return v;
    }
    return d;
  };
  const bool = (v) => /^(1|true|yes|on)$/i.test(String(v));
  const cfg = {
    port: Number(getAny(['RELAY_PORT', 'PORT'], '8443')),
    bind: get('RELAY_BIND', '0.0.0.0'),
    biostarHost: get('BIOSTAR_HOST'),
    biostarPort: Number(get('BIOSTAR_PORT', '443')),
    biostarProtocol: get('BIOSTAR_PROTOCOL', 'https').toLowerCase() === 'http' ? 'http' : 'https',
    biostarVerifyTls: bool(get('BIOSTAR_VERIFY_TLS', 'false')),
    loginId: getAny(['BIOSTAR_LOGIN_ID', 'BIOSTAR_LOGIN']),
    relayKey: get('RELAY_KEY'),
    password: get('BIOSTAR_PASSWORD'),
    allowedOrigins: get('ALLOWED_ORIGINS', 'https://crm.vision7.sa')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    tlsDisabled: bool(get('TLS_DISABLED', 'false')),
    tlsPfx: get('TLS_PFX', path.join(ROOT, 'certs', 'relay.pfx')),
    tlsPfxPassFile: get('TLS_PFX_PASSPHRASE_FILE', path.join(ROOT, 'certs', 'pfx-password.txt')),
    tlsPfxPass: get('TLS_PFX_PASSPHRASE'),
    tlsCert: get('TLS_CERT'),
    tlsKey: get('TLS_KEY'),
    legacyCertDir: path.join(ROOT, '.cert'), // key.pem + cert.pem written by the first-generation relay
    logFile: get('LOG_FILE', path.join(ROOT, 'logs', 'relay.log')),
    loginBackoffSeconds: Number(get('LOGIN_BACKOFF_SECONDS', '300')),
    requestTimeoutMs: Number(get('REQUEST_TIMEOUT_SECONDS', '30')) * 1000,
    maxBodyBytes: 10 * 1024 * 1024,
  };
  return cfg;
}

function configProblems(cfg) {
  const p = [];
  if (!cfg.biostarHost) p.push('BIOSTAR_HOST is not set');
  if (!cfg.loginId) p.push('BIOSTAR_LOGIN_ID (or BIOSTAR_LOGIN) is not set');
  if (!cfg.password) p.push('BIOSTAR_PASSWORD is not set');
  if (/^(CHANGE|YOUR|<)/i.test(cfg.loginId) || /^(CHANGE|YOUR|<)/i.test(cfg.password)) p.push('config.env still contains the example placeholders');
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) p.push('RELAY_PORT is not a valid port');
  return p;
}

// ── Logging (never logs passwords or bodies) ────────────────────────────────────

function makeLogger(file) {
  const MAX = 5 * 1024 * 1024;
  let ready = false;
  const ensure = () => {
    if (ready || !file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      ready = true;
    } catch {
      /* console only */
    }
  };
  return (level, msg) => {
    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}`;
    (level === 'ERROR' ? console.error : console.log)(line);
    ensure();
    if (!ready) return;
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX) fs.renameSync(file, `${file}.1`);
      fs.appendFileSync(file, line + '\n');
    } catch {
      /* ignore */
    }
  };
}

// ── Relay ───────────────────────────────────────────────────────────────────────

class RelayError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createRelay(cfg, log = () => {}) {
  const state = {
    sessionId: null,
    loginInFlight: null,
    lockUntil: 0,
    lastError: null, // { message, rejected, at }
    healthCache: { at: 0, body: null },
  };
  const agent =
    cfg.biostarProtocol === 'https'
      ? new https.Agent({ rejectUnauthorized: cfg.biostarVerifyTls, keepAlive: true })
      : new http.Agent({ keepAlive: true });
  const lib = cfg.biostarProtocol === 'https' ? https : http;
  const biostarLabel = `${cfg.biostarHost}:${cfg.biostarPort}`;

  /** One raw request to BioStar. Resolves { status, headers, body (Buffer) }. */
  function biostarRequest({ method, pathAndQuery, headers = {}, body }) {
    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          host: cfg.biostarHost,
          port: cfg.biostarPort,
          path: pathAndQuery,
          method,
          agent,
          headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
          timeout: cfg.requestTimeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  const unreachable = (err) =>
    new RelayError(502, `BioStar at ${biostarLabel} is unreachable (${err.code || err.message}). Check the BioStar server is on and the address is right.`, 'UNREACHABLE');

  function biostarMessage(buf) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      return String(j?.Response?.message || j?.message || '');
    } catch {
      return '';
    }
  }

  async function login() {
    let r;
    try {
      r = await biostarRequest({
        method: 'POST',
        pathAndQuery: '/api/login',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ User: { login_id: cfg.loginId, password: cfg.password } }),
      });
    } catch (err) {
      state.lastError = { message: unreachable(err).message, rejected: false, at: Date.now() };
      throw unreachable(err);
    }
    const sid = r.headers['bs-session-id'];
    if (r.status === 200 && sid) {
      state.sessionId = String(sid);
      state.lastError = null;
      state.lockUntil = 0;
      log('INFO', `Logged in to BioStar ${biostarLabel} as "${cfg.loginId}"`);
      return state.sessionId;
    }
    // BioStar answered but refused us. Do NOT keep retrying: repeated bad passwords lock the account.
    const why = biostarMessage(r.body) || `HTTP ${r.status}`;
    state.sessionId = null;
    state.lockUntil = Date.now() + cfg.loginBackoffSeconds * 1000;
    state.lastError = {
      message: `BioStar rejected the relay's login "${cfg.loginId}" (${why}). Fix BIOSTAR_LOGIN_ID / BIOSTAR_PASSWORD in config.env and restart the relay.`,
      rejected: true,
      at: Date.now(),
    };
    log('ERROR', `BioStar login rejected for "${cfg.loginId}" (${why}) — pausing login attempts for ${cfg.loginBackoffSeconds}s to avoid locking the account`);
    throw new RelayError(401, state.lastError.message, 'LOGIN_REJECTED');
  }

  async function ensureSession(force = false) {
    if (state.sessionId && !force) return state.sessionId;
    if (Date.now() < state.lockUntil) {
      throw new RelayError(503, state.lastError?.message || 'BioStar login is paused after a rejected password.', 'LOGIN_PAUSED');
    }
    if (!state.loginInFlight) {
      state.loginInFlight = login().finally(() => {
        state.loginInFlight = null;
      });
    }
    return state.loginInFlight;
  }

  /** Proxy one request, re-logging in once if BioStar says the session is gone. */
  async function proxy({ method, pathAndQuery, contentType, body }) {
    const send = async (sid) =>
      biostarRequest({
        method,
        pathAndQuery,
        headers: { 'bs-session-id': sid, Accept: 'application/json', ...(body && contentType ? { 'Content-Type': contentType } : {}) },
        body,
      });
    let sid = await ensureSession();
    let r;
    try {
      r = await send(sid);
    } catch (err) {
      throw unreachable(err);
    }
    if (r.status === 401) {
      state.sessionId = null;
      sid = await ensureSession(true);
      try {
        r = await send(sid);
      } catch (err) {
        throw unreachable(err);
      }
    }
    return r;
  }

  async function health({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && state.healthCache.body && now - state.healthCache.at < 15_000) return state.healthCache.body;
    let ok = false;
    let error;
    try {
      const r = await proxy({ method: 'GET', pathAndQuery: '/api/users?limit=1&offset=0' });
      ok = r.status >= 200 && r.status < 300;
      if (!ok) error = `BioStar answered HTTP ${r.status}`;
    } catch (err) {
      error = err.message;
    }
    const body = { ok, reachable: ok, biostar: biostarLabel, version: VERSION, checkedAt: new Date().toISOString(), ...(ok ? {} : { error }) };
    state.healthCache = { at: now, body };
    return body;
  }

  // ── HTTP surface ──────────────────────────────────────────────────────────────

  function corsHeaders(req) {
    const origin = req.headers.origin;
    const h = { Vary: 'Origin' };
    if (origin && cfg.allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
      h['Access-Control-Allow-Origin'] = origin;
      h['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
      h['Access-Control-Allow-Headers'] = 'Content-Type, X-Relay-Key';
      h['Access-Control-Max-Age'] = '600';
      // Chrome's Private Network Access: a public HTTPS site calling a LAN/localhost address is preflighted.
      if (req.headers['access-control-request-private-network']) h['Access-Control-Allow-Private-Network'] = 'true';
    }
    return h;
  }

  function sendJson(res, status, obj, extra = {}) {
    const text = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(text);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > cfg.maxBodyBytes) {
          reject(new RelayError(413, 'Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null));
      req.on('error', reject);
    });
  }

  async function handler(req, res) {
    const started = Date.now();
    const cors = corsHeaders(req);
    const url = new URL(req.url || '/', 'http://relay.local');
    const route = `${req.method} ${url.pathname}`;
    let status = 500;
    try {
      if (req.method === 'OPTIONS') {
        status = 204;
        res.writeHead(204, cors);
        return res.end();
      }
      if (url.pathname === '/relay/health' && req.method === 'GET') {
        const body = await health({ fresh: url.searchParams.get('fresh') === '1' });
        status = 200;
        return sendJson(res, 200, body, cors);
      }
      // Only BioStar's REST API is exposed, and never its login/logout (the relay owns the session).
      if (!url.pathname.startsWith('/api/') || /^\/api\/(login|logout)(\/|$)/i.test(url.pathname)) {
        status = 404;
        return sendJson(res, 404, { message: 'Not found' }, cors);
      }
      if (cfg.relayKey && req.headers['x-relay-key'] !== cfg.relayKey) {
        status = 401;
        return sendJson(res, 401, { message: 'Invalid relay key' }, cors);
      }
      const body = ['GET', 'HEAD'].includes(req.method || '') ? null : await readBody(req);
      const r = await proxy({
        method: req.method || 'GET',
        pathAndQuery: url.pathname + url.search,
        contentType: req.headers['content-type'],
        body,
      });
      status = r.status;
      res.writeHead(r.status, {
        'Content-Type': r.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      });
      return res.end(r.body);
    } catch (err) {
      const e = err instanceof RelayError ? err : new RelayError(502, `Relay error: ${err.message}`);
      status = e.status;
      return sendJson(res, e.status, { message: e.message, code: e.code }, cors);
    } finally {
      if (url.pathname !== '/relay/health') log('INFO', `${route} → ${status} (${Date.now() - started}ms)`);
    }
  }

  return { handler, health, state, ensureSession };
}

// ── Server bootstrap ────────────────────────────────────────────────────────────

function tlsOptions(cfg) {
  if (cfg.tlsCert && cfg.tlsKey) return { cert: fs.readFileSync(cfg.tlsCert), key: fs.readFileSync(cfg.tlsKey) };
  // Reuse the first-generation relay's certificate when it's there, so browsers that already trust it keep working.
  const legacyKey = path.join(cfg.legacyCertDir, 'key.pem');
  const legacyCert = path.join(cfg.legacyCertDir, 'cert.pem');
  if (fs.existsSync(legacyKey) && fs.existsSync(legacyCert)) return { key: fs.readFileSync(legacyKey), cert: fs.readFileSync(legacyCert) };
  if (fs.existsSync(cfg.tlsPfx)) {
    let pass = cfg.tlsPfxPass;
    if (!pass && fs.existsSync(cfg.tlsPfxPassFile)) pass = fs.readFileSync(cfg.tlsPfxPassFile, 'utf8').trim();
    return { pfx: fs.readFileSync(cfg.tlsPfx), passphrase: pass || undefined };
  }
  throw new Error(`No TLS certificate found (looked in .cert\\ and ${cfg.tlsPfx}). Run install-autostart.bat, or set TLS_CERT and TLS_KEY.`);
}

function start(cfg, log) {
  const relay = createRelay(cfg, log);
  const server = cfg.tlsDisabled
    ? http.createServer(relay.handler)
    : https.createServer(tlsOptions(cfg), relay.handler);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log('ERROR', `Port ${cfg.port} is already in use — another relay is probably still running. Stop it and start this one again.`);
    } else {
      log('ERROR', `Server error: ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(cfg.port, cfg.bind, () => {
    log('INFO', `Vision7 BioStar Relay ${VERSION} listening on ${cfg.tlsDisabled ? 'http' : 'https'}://${cfg.bind}:${cfg.port} → BioStar ${cfg.biostarProtocol}://${cfg.biostarHost}:${cfg.biostarPort}`);
    log('INFO', `Allowed CRM origins: ${cfg.allowedOrigins.join(', ') || '(none)'}`);
    // Log in straight away so a wrong password shows up in the log at startup, not on the first customer.
    relay.health({ fresh: true }).then((h) => log(h.ok ? 'INFO' : 'ERROR', h.ok ? 'BioStar connection OK' : `BioStar connection FAILED: ${h.error}`));
  });
  return { server, relay };
}

if (require.main === module) {
  const cfg = loadConfig();
  const log = makeLogger(cfg.logFile);
  const problems = configProblems(cfg);
  if (problems.length) {
    log('ERROR', `Cannot start: ${problems.join('; ')}. Edit config.env (copy config.env.example if it doesn't exist).`);
    process.exit(1);
  }
  process.on('uncaughtException', (e) => {
    log('ERROR', `Unexpected error: ${e && e.stack ? e.stack : e}`);
    process.exit(1); // the autostart task restarts us
  });
  process.on('unhandledRejection', (e) => {
    log('ERROR', `Unhandled rejection: ${e && e.stack ? e.stack : e}`);
    process.exit(1);
  });
  start(cfg, log);
}

module.exports = { loadConfig, parseEnvFile, configProblems, createRelay, start, RelayError, VERSION };
