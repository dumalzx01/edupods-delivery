/*
 * Small compatibility layer for the former Socket.IO UI.
 * Netlify Functions do not keep WebSocket connections alive.
 * Deliveries are written to Supabase and polled every 4 seconds.
 */
(() => {
  const intervalMs = 4000;
  const request = async (url, opts) => {
    const r = await fetch(url, { cache: 'no-store', ...opts });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  const post = (url, data) => request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  window.io = () => {
    const events = new Map();
    const fire = (key, data) => (events.get(key) || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(e); }
    });
    let mode = '', token = '', orderId = '', last = null, orderVersion = '', pending = false;
    let active = true;
    const reportError = error => { console.warn('[Delivery Track]', error); fire('disconnect'); };

    async function poll() {
      if (!active || pending || document.hidden) return;
      pending = true;
      try {
        if (mode === 'customer' && token) {
          const data = await request('/api/sync?token=' + encodeURIComponent(token));
          const o = data.order;
          if (!last) {
            fire('order:snapshot', data);
            if (o.status !== 'preparando') fire('courier:online', { courierName: o.courierName });
          } else {
            if (last.status !== o.status) fire('order:status', { status: o.status, updatedAt: o.updatedAt });
            if (o.lastPosition && (!last.lastPosition || o.lastPosition.t !== last.lastPosition.t)) {
              const dist = typeof o.destLat === 'number' && typeof o.destLng === 'number'
                ? haversine(o.lastPosition.lat, o.lastPosition.lng, o.destLat, o.destLng) : null;
              fire('courier:position', { orderId: o.id, position: o.lastPosition, courierName: o.courierName,
                distanceKm: dist, etaMin: dist === null ? null : Math.max(1, Math.round(dist / 22 * 60)) });
            }
          }
          last = o;
        } else if (mode === 'courier' && orderId) {
          const data = await request('/api/sync?orderId=' + encodeURIComponent(orderId));
          if (!last || data.order.updatedAt !== last.updatedAt) fire('order:snapshot', data);
          last = data.order;
        } else if (mode === 'admin') {
          const data = await request('/api/sync');
          const version = data.orders.map(o => o.id + ':' + o.updatedAt).sort().join('|');
          if (orderVersion && version !== orderVersion) fire('orders:changed');
          orderVersion = version;
          data.orders.forEach(o => {
            if (o.lastPosition && (!last || last[o.id] !== o.lastPosition.t)) {
              fire('courier:position', { orderId: o.id, position: o.lastPosition, courierName: o.courierName });
            }
          });
          last = Object.fromEntries(data.orders.filter(o => o.lastPosition).map(o => [o.id, o.lastPosition.t]));
        }
      } catch (error) {
        if (mode === 'customer' && !last) fire('error:msg', error.message);
        else reportError(error.message);
      } finally { pending = false; }
    }
    function haversine(a, b, c, d) {
      const r = n => n * Math.PI / 180;
      const x = Math.sin(r(c-a)/2)**2 + Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;
      return 6371*2*Math.asin(Math.sqrt(x));
    }
    const api = {
      on(name, handler) {
        if (!events.has(name)) events.set(name, []);
        events.get(name).push(handler);
        return api;
      },
      emit(name, data = {}) {
        if (name === 'customer:join') {
          mode = 'customer'; token = data.token; poll();
        } else if (name === 'admin:join') {
          mode = 'admin';
          request('/api/alerts').then(items => fire('alerts:snapshot', items)).catch(() => {});
          poll();
        } else if (name === 'courier:attach') {
          mode = 'courier'; orderId = data.orderId;
          post('/api/courier/' + encodeURIComponent(orderId) + '/attach', data)
            .then(() => poll()).catch(reportError);
        } else if (name === 'courier:position' && orderId === data.orderId) {
          post('/api/courier/' + encodeURIComponent(orderId) + '/position', data).catch(reportError);
        } else if (name === 'courier:status' && orderId === data.orderId) {
          post('/api/courier/' + encodeURIComponent(orderId) + '/status', data).then(() => poll()).catch(reportError);
        }
        return api;
      },
      disconnect() { active = false; clearInterval(timer); fire('disconnect'); },
    };
    const timer = setInterval(poll, intervalMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    setTimeout(() => fire('connect'), 0);
    return api;
  };
})();
