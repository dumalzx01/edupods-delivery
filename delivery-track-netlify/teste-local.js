// Mock smoke test: no credentials, Internet access or hosted resources needed.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_mock';
process.env.ADMIN_USER = 'dono';
process.env.ADMIN_PASSWORD = 'SenhaTesteSegura123';
process.env.SESSION_SECRET = 'some-long-unique-test-only-key-at-least-32-bytes';
const tables = { delivery_orders: [], delivery_users: [], delivery_alerts: [] };
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const parsed = new URL(url);
  const table = parsed.pathname.split('/').pop();
  assert.ok(tables[table], 'tabela reconhecida ' + table);
  const find = rows => rows.filter(row => {
    for (const [key, v] of parsed.searchParams) {
      if (v.startsWith('eq.') && String(row[key]) !== v.slice(3)) return false;
    }
    return true;
  });
  const method = opts.method;
  const filtered = find(tables[table]);
  let out = filtered;
  if (method === 'POST') {
    const item = JSON.parse(opts.body);
    tables[table].push(item);
    out = [];
  } else if (method === 'PATCH') {
    const value = JSON.parse(opts.body);
    filtered.forEach(row => Object.assign(row, value));
    out = [];
  }
  if (parsed.searchParams.has('select') && out.length) {
    const selection = parsed.searchParams.get('select');
    if (selection !== '*') out = out.map(row => Object.fromEntries(selection.split(',').map(k => [k, row[k]])));
  }
  return { ok: true, status: 200, text: async () => JSON.stringify(out) };
};
const { handler } = require('./netlify/functions/api');
async function call(method, path, body, cookie) {
  const u = new URL('https://delivery.netlify.app' + path);
  const result = await handler({ httpMethod: method, rawUrl: u.toString(), path: u.pathname,
    headers: cookie ? { cookie } : {}, queryStringParameters: Object.fromEntries(u.searchParams),
    body: body === undefined ? null : JSON.stringify(body) });
  return { status: result.statusCode, data: JSON.parse(result.body), cookie: result.headers?.['Set-Cookie'] };
}
(async () => {
  const unauthorized = await call('GET', '/api/orders');
  assert.equal(unauthorized.status, 401);
  const login = await call('POST', '/api/auth/login', { username: 'dono', password: 'SenhaTesteSegura123' });
  assert.equal(login.status, 200);
  const cookie = login.cookie.split(';')[0];
  const create = await call('POST', '/api/orders', { customerName: 'Teste', address: 'Rua Teste' }, cookie);
  assert.equal(create.status, 201);
  const o = create.data;
  assert.ok(o.shareToken);
  const publicRead = await call('GET', '/api/share/' + o.shareToken);
  assert.equal(publicRead.status, 200);
  assert.equal(publicRead.data.shareToken, undefined);
  const pos = await call('POST', '/api/courier/' + o.id + '/position', { lat: -15.6, lng: -56.1 }, cookie);
  assert.equal(pos.status, 200);
  const publicSync = await call('GET', '/api/sync?token=' + o.shareToken);
  assert.equal(publicSync.data.order.lastPosition.lat, -15.6);
  const noLogin = await call('POST', '/api/courier/' + o.id + '/status', { status: 'entregue' });
  assert.equal(noLogin.status, 401);
  console.log('OK: login, pedido, token privado, GPS, sincronizacao e autorizacao');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = realFetch; });
