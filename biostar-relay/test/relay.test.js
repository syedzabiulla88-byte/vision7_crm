'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { loadConfig, parseEnvFile, configProblems, start } = require('../index.js');

/** A fake BioStar 2: /api/login + a couple of session-protected endpoints. */
function fakeBiostar({ loginId = 'relay', password = 'pw' } = {}) {
  const s = { logins: 0, badLogins: 0, sessions: new Set(), seen: [], bodies: [] };
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(obj));
      };
      if (req.url === '/api/login' && req.method === 'POST') {
        const u = JSON.parse(body).User || {};
        if (u.login_id === loginId && u.password === password) {
          s.logins++;
          const sid = `S${++n}`;
          s.sessions.add(sid);
          return send(200, { Response: { code: '0', message: 'Success' } }, { 'bs-session-id': sid });
        }
        s.badLogins++;
        return send(401, { Response: { code: '4', message: 'Invalid ID or password' } });
      }
      const sid = req.headers['bs-session-id'];
      s.seen.push({ method: req.method, url: req.url, sid });
      if (!sid || !s.sessions.has(sid)) return send(401, { Response: { code: '1', message: 'Session invalid' } });
      if (req.method !== 'GET') s.bodies.push(body);
      if (req.url.startsWith('/api/users/')) return send(200, { User: { user_id: req.url.split('/').pop(), echo: body ? JSON.parse(body) : null } });
      return send(200, { UserCollection: { total: '0', rows: [] } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state: s, port: server.address().port })));
}

async function boot(over = {}, fakeOpts) {
  const fake = await fakeBiostar(fakeOpts);
  const cfg = {
    ...loadConfig({}, '/nonexistent'),
    port: 0,
    bind: '127.0.0.1',
    tlsDisabled: true,
    biostarHost: '127.0.0.1',
    biostarPort: fake.port,
    biostarProtocol: 'http',
    loginId: 'relay',
    password: 'pw',
    allowedOrigins: ['https://crm.example.sa'],
    logFile: '',
    ...over,
  };
  const { server, relay } = start(cfg, () => {});
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((r) => { server.close(r); fake.server.close(); server.closeAllConnections?.(); fake.server.closeAllConnections?.(); });
  return { base, fake, relay, close };
}

test('health is ok when BioStar accepts the relay login, and reports the BioStar target', async () => {
  const t = await boot();
  const r = await fetch(`${t.base}/relay/health?fresh=1`);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.reachable, true);
  assert.match(j.biostar, /^127\.0\.0\.1:\d+$/);
  assert.equal(JSON.stringify(j).includes('pw'), false, 'password never appears in health');
  await t.close();
});

test('proxies /api/* with the session injected and returns raw BioStar JSON; bodies pass through', async () => {
  const t = await boot();
  const list = await (await fetch(`${t.base}/api/users?limit=5`)).json();
  assert.deepEqual(list, { UserCollection: { total: '0', rows: [] } });
  const put = await fetch(`${t.base}/api/users/42`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ User: { name: 'A' } }) });
  const pj = await put.json();
  assert.equal(put.status, 200);
  assert.deepEqual(pj.User.echo, { User: { name: 'A' } });
  assert.ok(t.fake.state.seen.every((x) => x.sid && x.sid.startsWith('S')), 'every proxied call carried a session id');
  await t.close();
});

test('an expired BioStar session is re-established transparently, with one extra login', async () => {
  const t = await boot();
  await fetch(`${t.base}/api/users`);
  assert.equal(t.fake.state.logins, 1);
  t.fake.state.sessions.clear(); // BioStar forgets us
  const r = await fetch(`${t.base}/api/users`);
  assert.equal(r.status, 200);
  assert.equal(t.fake.state.logins, 2);
  await t.close();
});

test('a rejected password is NOT retried (protects the BioStar account from lockout) and says why', async () => {
  const t = await boot({ password: 'wrong' });
  const h1 = await (await fetch(`${t.base}/relay/health?fresh=1`)).json();
  assert.equal(h1.ok, false);
  assert.match(h1.error, /rejected the relay's login/);
  assert.match(h1.error, /config\.env/);
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${t.base}/api/users`);
    assert.ok([401, 503].includes(r.status));
  }
  await fetch(`${t.base}/relay/health?fresh=1`);
  assert.equal(t.fake.state.badLogins, 1, 'exactly one bad login reached BioStar');
  await t.close();
});

test('BioStar being down is a 502 with a clear message, and recovers when it is back', async () => {
  const t = await boot();
  // Drop the relay's keep-alive connections too, otherwise close() waits on them forever.
  t.fake.server.closeAllConnections();
  await new Promise((r) => t.fake.server.close(r));
  const r = await fetch(`${t.base}/api/users`);
  assert.equal(r.status, 502);
  assert.match((await r.json()).message, /unreachable/);
  const h = await (await fetch(`${t.base}/relay/health?fresh=1`)).json();
  assert.equal(h.ok, false);
  await t.close();
});

test('CORS: allowed CRM origin is echoed, others are not; Private Network preflight is answered', async () => {
  const t = await boot();
  const ok = await fetch(`${t.base}/relay/health`, { headers: { Origin: 'https://crm.example.sa' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://crm.example.sa');
  const bad = await fetch(`${t.base}/relay/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(`${t.base}/api/users/1`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://crm.example.sa', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Private-Network': 'true' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
  assert.match(pre.headers.get('access-control-allow-methods'), /PUT/);
  await t.close();
});

test('only /api/* is exposed, and never login/logout', async () => {
  const t = await boot();
  await fetch(`${t.base}/relay/health?fresh=1`); // let the relay's own startup login happen first
  const before = t.fake.state.logins;
  const seenBefore = t.fake.state.seen.length;
  for (const p of ['/api/login', '/api/logout', '/api/Login', '/etc/passwd', '/', '/relay/other']) {
    const r = await fetch(`${t.base}${p}`, { method: p.startsWith('/api/log') ? 'POST' : 'GET' });
    assert.equal(r.status, 404, p);
  }
  assert.equal(t.fake.state.logins, before, 'a browser cannot make the relay log in via /api/login');
  assert.equal(t.fake.state.seen.length, seenBefore, 'none of those requests reached BioStar');
  await t.close();
});

test('config: env file parsing and the checks that stop a half-filled config from starting', () => {
  const parsed = parseEnvFile('# c\nBIOSTAR_HOST=10.1.100.46\nBIOSTAR_LOGIN_ID = "vision7-relay"\n\nBIOSTAR_PASSWORD=\'p w\'\n');
  assert.deepEqual(parsed, { BIOSTAR_HOST: '10.1.100.46', BIOSTAR_LOGIN_ID: 'vision7-relay', BIOSTAR_PASSWORD: 'p w' });
  const cfg = loadConfig({ BIOSTAR_HOST: '10.1.100.46' }, '/nonexistent');
  assert.deepEqual(configProblems(cfg).sort(), ['BIOSTAR_LOGIN_ID (or BIOSTAR_LOGIN) is not set', 'BIOSTAR_PASSWORD is not set']);
  const placeholder = loadConfig({ BIOSTAR_HOST: 'h', BIOSTAR_LOGIN_ID: 'CHANGE_ME', BIOSTAR_PASSWORD: 'CHANGE_ME' }, '/nonexistent');
  assert.ok(configProblems(placeholder).some((p) => /placeholders/.test(p)));
  assert.equal(configProblems(loadConfig({ BIOSTAR_HOST: 'h', BIOSTAR_LOGIN_ID: 'a', BIOSTAR_PASSWORD: 'b' }, '/nonexistent')).length, 0);
});

test('compatibility: the first-generation setting names (BIOSTAR_LOGIN, PORT) still work', () => {
  const cfg = loadConfig({ BIOSTAR_HOST: 'h', BIOSTAR_LOGIN: 'vision7-relay', BIOSTAR_PASSWORD: 'x', PORT: '9443' }, '/nonexistent');
  assert.equal(cfg.loginId, 'vision7-relay');
  assert.equal(cfg.port, 9443);
  assert.equal(configProblems(cfg).length, 0);
});

test('optional shared key: required on /api/* only when configured, and /relay/health stays open', async () => {
  const t = await boot({ relayKey: 's3cret' });
  assert.equal((await fetch(`${t.base}/api/users`)).status, 401);
  assert.equal((await fetch(`${t.base}/api/users`, { headers: { 'X-Relay-Key': 's3cret' } })).status, 200);
  assert.equal((await fetch(`${t.base}/relay/health`)).status, 200);
  await t.close();
});
