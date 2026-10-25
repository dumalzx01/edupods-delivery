// Delivery Track: Netlify Function + Supabase REST (server-side credentials only).
const crypto = require('node:crypto');

const json = (statusCode, data, headers = {}) => ({
  statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(data),
});
const fail = (code, error) => json(code, { error });
const urlbase = () => {
  const raw = process.env.SUPABASE_URL;
  if (!raw || !/^https:\/\/[a-z0-9.-]+$/i.test(raw.replace(/\/$/, ''))) throw new Error('SUPABASE_URL invalida');
  return raw.replace(/\/$/, '') + '/rest/v1';
};
async function database(table, { method = 'GET', filters = '', body, preference } = {}) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Configure SUPABASE_SECRET_KEY na Netlify');
  const headers = { apikey: key, Accept: 'application/json', 'Content-Type': 'application/json' };
  // Legacy service-role keys are JWTs; modern sb_secret keys use the apikey header.
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  if (preference) headers.Prefer = preference;
  const response = await fetch(urlbase() + '/' + table + (filters ? '?' + filters : ''), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let result;
  try { result = raw ? JSON.parse(raw) : null; } catch { result = raw; }
  if (!response.ok) throw new Error('Banco ' + response.status + ': ' + (result?.message || raw).slice(0, 150));
  return result;
}
const equal = (name, value) => encodeURIComponent(name) + '=eq.' + encodeURIComponent(String(value));
const random = (bytes = 15) => crypto.randomBytes(bytes).toString('base64url');
function hash(password) {
  const salt = random(16);
  return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function checkPassword(password, stored) {
  try {
    const [algo, salt, hex] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const a = Buffer.from(hex, 'hex');
    const b = crypto.scryptSync(password, salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function signSession(user) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET ausente ou muito curta');
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, name: user.name, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function session(event) {
  try {
    const cookie = (event.headers.cookie || event.headers.Cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('dt_session='));
    if (!cookie) return null;
    const token = cookie.slice('dt_session='.length);
    const i = token.lastIndexOf('.');
    if (i < 1) return null;
    const payload = token.slice(0, i);
    const signature = token.slice(i + 1);
    const wanted = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest();
    const got = Buffer.from(signature, 'base64url');
    if (wanted.length !== got.length || !crypto.timingSafeEqual(wanted, got)) return null;
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return user.exp > Date.now() ? user : null;
  } catch { return null; }
}
const cookie = token => 'dt_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
const labels = { preparando: 'Preparando', saiu_entrega: 'Saiu para entrega', chegando: 'Chegando', entregue: 'Entregue', cancelado: 'Cancelado' };
const statuses = Object.keys(labels);
const ALERT_TYPES = {
  congestion: { label: 'Trânsito', icon: '🚗', color: '#ff9500' },
  accident: { label: 'Acidente', icon: '💥', color: '#ff4d4d' },
  police: { label: 'Polícia', icon: '🚔', color: '#4d94ff' },
  hazard: { label: 'Perigo na via', icon: '⚠️', color: '#ffb03a' },
  construction: { label: 'Obra', icon: '🚧', color: '#ffb03a' },
  pothole: { label: 'Buraco', icon: '🕳️', color: '#a06bff' },
  flooded: { label: 'Alagamento', icon: '🌊', color: '#4dd0ff' },
  blocked: { label: 'Via bloqueada', icon: '⛔', color: '#ff4d4d' },
  animals: { label: 'Animais na via', icon: '🐕', color: '#a06bff' },
  fuel: { label: 'Posto / combustível', icon: '⛽', color: '#2ee27a' },
  traffic_light: { label: 'Semáforo com defeito', icon: '🚦', color: '#ffb03a' },
};
const publicOrder = o => {
  if (!o) return null;
  const { shareToken, customerPhone, ...rest } = o;
  return { ...rest, statusLabel: labels[o.status] || o.status };
};
const record = row => row ? row.data : null;
async function orderById(id) {
  const rows = await database('delivery_orders', { filters: equal('id', id) + '&select=data&limit=1' });
  return record(rows[0]);
}
async function orderByToken(token) {
  const rows = await database('delivery_orders', { filters: equal('share_token', token) + '&select=data&limit=1' });
  return record(rows[0]);
}
async function updateOrder(o) {
  o.updatedAt = Date.now();
  await database('delivery_orders', { method: 'PATCH', filters: equal('id', o.id), body: { data: o, updated_at: new Date().toISOString() }, preference: 'return=minimal' });
  return o;
}
async function allAlerts() {
  const rows = await database('delivery_alerts', { filters: 'select=data&order=created_at.desc&limit=300' });
  return rows.map(record);
}
function sendError(e) {
  console.error('[api]', e.message);
  return fail(500, 'Falha no servidor. Confira o banco e as variaveis da Netlify.');
}
const validGeo = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const distanceKm = (a, b) => {
  const rad = n => n * Math.PI / 180, d1 = rad(b.lat - a.lat), d2 = rad(b.lng - a.lng);
  const x = Math.sin(d1 / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(d2 / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
};

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  const query = event.queryStringParameters || {};
  const path = query.path ? '/api/' + query.path.replace(/^\/+/, '') :
    new URL(event.rawUrl || 'https://local.invalid' + event.path).pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
  const method = event.httpMethod;
  const user = session(event);
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body); }
    catch { return fail(400, 'JSON invalido'); }
  }
  if (!path.startsWith('/api/')) return fail(404, 'Nao encontrado');
  try {
    if (path === '/api/auth/login' && method === 'POST') {
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      let found = null;
      if (username && username === (process.env.ADMIN_USER || 'dono').toLowerCase() &&
          process.env.ADMIN_PASSWORD && password.length === process.env.ADMIN_PASSWORD.length &&
          crypto.timingSafeEqual(Buffer.from(password), Buffer.from(process.env.ADMIN_PASSWORD))) {
        found = { id: 'admin', username, name: process.env.ADMIN_NAME || 'Administrador', role: 'lojista' };
      } else if (username) {
        const rows = await database('delivery_users', { filters: equal('username', username) + '&select=*&limit=1' });
        const u = rows[0];
        if (u && checkPassword(password, u.password_hash)) found = { id: u.id, username: u.username, name: u.name, role: u.role };
      }
      if (!found) return fail(401, 'Usuario ou senha invalidos');
      return json(200, found, { 'Set-Cookie': cookie(signSession(found)) });
    }
    if (path === '/api/auth/logout' && method === 'POST') return json(200, { ok: true }, { 'Set-Cookie': 'dt_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
    if (path === '/api/auth/me' && method === 'GET') return user ? json(200, user) : fail(401, 'Nao autenticado');

    const matchShare = path.match(/^\/api\/share\/([^/]+)$/);
    if (matchShare && method === 'GET') {
      const o = await orderByToken(matchShare[1]);
      return o ? json(200, publicOrder(o)) : fail(404, 'Link invalido');
    }
    if (path === '/api/alert-types' && method === 'GET') return json(200, ALERT_TYPES);
    if (path === '/api/alerts' && method === 'GET') {
      let list = await allAlerts();
      if (['s', 'w', 'n', 'e'].every(k => Number.isFinite(Number(query[k])))) {
        list = list.filter(a => a.lat >= +query.s && a.lat <= +query.n && a.lng >= +query.w && a.lng <= +query.e);
      }
      return json(200, list);
    }
    if (path === '/api/alerts' && method === 'POST') {
      const tokenOrder = !user && body.orderToken ? await orderByToken(body.orderToken) : null;
      if (!user && !tokenOrder) return fail(401, 'Login ou link do pedido obrigatorio');
      if (!validGeo(body.lat, body.lng)) return fail(400, 'Coordenadas invalidas');
      const meta = ALERT_TYPES[body.type];
      if (!meta) return fail(400, 'Tipo invalido');
      const a = { id: 'alt_' + random(9), type: body.type, lat: body.lat, lng: body.lng, label: meta.label,
        icon: meta.icon, color: meta.color, comment: String(body.comment || '').slice(0, 200),
        by: user ? user.name : tokenOrder.customerName, byRole: user ? user.role : 'cliente', confirms: 0, createdAt: Date.now() };
      await database('delivery_alerts', { method: 'POST', body: { id: a.id, data: a }, preference: 'return=minimal' });
      return json(201, a);
    }
    const confirm = path.match(/^\/api\/alerts\/([^/]+)\/confirm$/);
    if (confirm && method === 'POST') {
      if (!user) return fail(401, 'Login obrigatorio');
      const rows = await database('delivery_alerts', { filters: equal('id', confirm[1]) + '&select=data' });
      if (!rows.length) return fail(404, 'Alerta inexistente');
      const a = rows[0].data;
      a.confirms = (a.confirms || 0) + 1;
      await database('delivery_alerts', { method: 'PATCH', filters: equal('id', a.id), body: { data: a } });
      return json(200, a);
    }
    const deleteAlert = path.match(/^\/api\/alerts\/([^/]+)$/);
    if (deleteAlert && method === 'DELETE') {
      if (user?.role !== 'lojista') return fail(403, 'Sem permissao');
      await database('delivery_alerts', { method: 'DELETE', filters: equal('id', deleteAlert[1]) });
      return json(200, { ok: true });
    }

    if (!user && !(path === '/api/sync' && query.token)) return fail(401, 'Login obrigatorio');
    if (path === '/api/users' && method === 'GET') {
      if (user.role !== 'lojista') return fail(403, 'Sem permissao');
      const rows = await database('delivery_users', { filters: 'select=id,username,name,role,created_at&order=created_at.desc' });
      return json(200, rows.map(u => ({ ...u, createdAt: new Date(u.created_at).getTime() })));
    }
    if (path === '/api/users' && method === 'POST') {
      if (user.role !== 'lojista') return fail(403, 'Sem permissao');
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[a-z0-9_.-]{3,40}$/.test(username) || password.length < 8) return fail(400, 'Usuario invalido ou senha menor que 8 caracteres');
      if (username === (process.env.ADMIN_USER || 'dono').toLowerCase()) return fail(409, 'Usuario ja existe');
      const data = { id: 'usr_' + random(8), username, name: String(body.name || username).slice(0, 80), role: body.role === 'lojista' ? 'lojista' : 'entregador', password_hash: hash(password) };
      try { await database('delivery_users', { method: 'POST', body: data }); }
      catch (e) { if (/duplicate|23505/.test(e.message)) return fail(409, 'Usuario ja existe'); throw e; }
      const { password_hash, ...safe } = data;
      return json(201, safe);
    }
    if (path === '/api/orders' && method === 'GET') {
      const rows = await database('delivery_orders', { filters: 'select=data&order=created_at.desc&limit=200' });
      return json(200, rows.map(record));
    }
    if (path === '/api/orders' && method === 'POST') {
      if (user.role !== 'lojista') return fail(403, 'Sem permissao');
      const now = Date.now(), o = { id: 'ord_' + random(9), shareToken: random(18),
        customerName: String(body.customerName || 'Cliente').slice(0, 120), customerPhone: String(body.customerPhone || '').slice(0, 40),
        address: String(body.address || '').slice(0, 300), items: Array.isArray(body.items) ? body.items.slice(0, 100) : [],
        value: typeof body.value === 'number' ? body.value : null, status: 'preparando',
        courierName: String(body.courierName || '').slice(0, 100), destLat: body.destLat ?? null, destLng: body.destLng ?? null,
        createdAt: now, updatedAt: now, lastPosition: null, route: [] };
      await database('delivery_orders', { method: 'POST', body: { id: o.id, share_token: o.shareToken, data: o }, preference: 'return=minimal' });
      return json(201, o);
    }
    const matchOrder = path.match(/^\/api\/orders\/([^/]+)$/);
    if (matchOrder && method === 'GET') {
      const o = await orderById(matchOrder[1]);
      return o ? json(200, o) : fail(404, 'Pedido nao encontrado');
    }
    if (matchOrder && method === 'PATCH') {
      if (user.role !== 'lojista') return fail(403, 'Sem permissao');
      const o = await orderById(matchOrder[1]);
      if (!o) return fail(404, 'Pedido nao encontrado');
      if (body.status && statuses.includes(body.status)) o.status = body.status;
      if (body.courierName !== undefined) o.courierName = String(body.courierName).slice(0, 100);
      if (body.destLat !== undefined) o.destLat = body.destLat;
      if (body.destLng !== undefined) o.destLng = body.destLng;
      return json(200, await updateOrder(o));
    }
    const matchRoute = path.match(/^\/api\/orders\/([^/]+)\/route$/);
    if (matchRoute && method === 'GET') {
      const o = await orderById(matchRoute[1]);
      return o ? json(200, o.route || []) : fail(404, 'Pedido nao encontrado');
    }
    const courier = path.match(/^\/api\/courier\/([^/]+)\/(attach|position|status)$/);
    if (courier && method === 'POST') {
      if (!['entregador','lojista'].includes(user.role)) return fail(403, 'Sem permissao');
      const o = await orderById(courier[1]);
      if (!o) return fail(404, 'Pedido nao encontrado');
      if (courier[2] === 'attach') {
        o.courierName = String(body.courierName || o.courierName || user.name).slice(0, 100);
        if (o.status === 'preparando') o.status = 'saiu_entrega';
      }
      if (courier[2] === 'position') {
        if (!validGeo(body.lat, body.lng)) return fail(400, 'Coordenadas invalidas');
        o.lastPosition = { lat: body.lat, lng: body.lng, heading: body.heading ?? null, speed: body.speed ?? null, accuracy: body.accuracy ?? null, t: Date.now() };
        o.route = [...(o.route || []).slice(-149), { lat: body.lat, lng: body.lng, t: Date.now() }];
        if (validGeo(o.destLat, o.destLng) && distanceKm({ lat: body.lat, lng: body.lng }, { lat: o.destLat, lng: o.destLng }) < 0.15 && o.status === 'saiu_entrega') o.status = 'chegando';
      }
      if (courier[2] === 'status') {
        if (!statuses.includes(body.status)) return fail(400, 'Status invalido');
        o.status = body.status;
      }
      return json(200, publicOrder(await updateOrder(o)));
    }
    if (path === '/api/sync' && method === 'GET') {
      if (query.token) {
        const o = await orderByToken(query.token);
        if (!o) return fail(404, 'Link invalido');
        return json(200, { order: publicOrder(o), route: o.route || [] });
      }
      if (!user) return fail(401, 'Login obrigatorio');
      if (query.orderId) {
        const o = await orderById(query.orderId);
        return o ? json(200, { order: publicOrder(o) }) : fail(404, 'Pedido nao encontrado');
      }
      const rows = await database('delivery_orders', { filters: 'select=data&order=updated_at.desc&limit=200' });
      return json(200, { orders: rows.map(record) });
    }
    if (path === '/api/route' && method === 'GET') {
      const nums = ['fromLat','fromLng','toLat','toLng'].map(k => Number(query[k]));
      if (!validGeo(nums[0], nums[1]) || !validGeo(nums[2], nums[3])) return fail(400, 'Coordenadas invalidas');
      const source = `https://router.project-osrm.org/route/v1/driving/${nums[1]},${nums[0]};${nums[3]},${nums[2]}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(source, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) return fail(502, 'Rota indisponivel');
      const payload = await response.json();
      const route = payload.routes?.[0];
      if (!route) return fail(502, 'Rota indisponivel');
      return json(200, { distance: route.distance, duration: route.duration,
        geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        steps: (route.legs?.[0]?.steps || []).map(s => ({
          lat: s.maneuver?.location?.[1], lng: s.maneuver?.location?.[0],
          type: s.maneuver?.type || 'turn', modifier: s.maneuver?.modifier || null,
          bearing: s.maneuver?.bearing_after ?? null, name: s.name || '',
          distance: s.distance || 0, duration: s.duration || 0,
        })) });
    }
    return fail(404, 'Nao encontrado');
  } catch (e) { return sendError(e); }
};
