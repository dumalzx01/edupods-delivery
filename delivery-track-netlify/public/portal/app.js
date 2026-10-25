/* Toast helper compartilhado */
function toast(msg, type = '') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function initials(n) {
  return String(n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function brl(v) {
  if (v == null) return '—';
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's atrás';
  if (s < 3600) return Math.floor(s / 60) + 'min atrás';
  return Math.floor(s / 3600) + 'h atrás';
}

// Redireciona para login se a sessao expirar
async function requireSession() {
  const r = await fetch('/api/auth/me');
  if (!r.ok) { location.href = '/login'; return null; }
  return r.json();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
}

// Icones de marcador no mapa
function pinIcon(kind, emoji) {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${kind}">${emoji}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
}

/* ---- Mapa tema escuro (estilo Waze) ---- */
function tileLayer() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO',
  });
}
function tileLayerSafe(map) {
  const layer = tileLayer();
  let errored = false;
  layer.on('tileerror', () => {
    if (errored) return;
    errored = true;
    setTimeout(() => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      }
    }, 800);
  });
  return layer;
}

/* Chevron de rumo estilo Waze: seta que gira conforme o heading.
   Usa transicao CSS quando ja existe elemento (evita "pular" de angulo). */
function chevronIcon(heading) {
  const rot = (heading == null || Number.isNaN(heading)) ? 0 : heading;
  return L.divIcon({
    className: '',
    html: `<div class="gps-chevron" style="position:relative">
      <div class="gps-ring"></div>
      <div class="body" style="transform:rotate(${rot}deg)"><div class="arrow"></div></div>
    </div>`,
    iconSize: [44, 44], iconAnchor: [22, 22],
  });
}

/* Atualiza a rotacao do chevron sem recriar o icone (mais fluido) */
function rotateChevron(marker, heading) {
  if (!marker || heading == null || Number.isNaN(heading)) return;
  const el = marker.getElement();
  if (!el) { marker.setIcon(chevronIcon(heading)); return; }
  const body = el.querySelector('.body');
  if (body) body.style.transform = `rotate(${heading}deg)`;
  else marker.setIcon(chevronIcon(heading));
}
function destFlagIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="pin dest-flag"><span>🏁</span></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });
}

/* Manobra a partir do tipo/modifier do OSRM */
function maneuverIcon(type, modifier) {
  const m = modifier || '';
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🧭';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (type === 'merge') return '↩';
  if (type === 'fork') return m.includes('left') ? '↖' : m.includes('right') ? '↗' : '⬆';
  if (m.includes('uturn')) return '↩';
  if (m.includes('sharp left')) return '⬅';
  if (m.includes('sharp right')) return '➡';
  if (m.includes('slight left')) return '↖';
  if (m.includes('slight right')) return '↗';
  if (m.includes('left')) return '↰';
  if (m.includes('right')) return '↱';
  return '⬆';
}
function maneuverText(type, modifier, name) {
  const street = name ? ' na ' + name : '';
  if (type === 'arrive') return 'Chegue ao destino';
  if (type === 'depart') return 'Siga' + (name ? ' pela ' + name : '');
  if (type === 'roundabout' || type === 'rotary') return 'Na rotatória, siga';
  const m = modifier || '';
  if (m.includes('uturn')) return 'Faça o retorno' + street;
  if (m.includes('sharp left')) return 'Vire acentuadamente à esquerda' + street;
  if (m.includes('sharp right')) return 'Vire acentuadamente à direita' + street;
  if (m.includes('slight left')) return 'Mantenha à esquerda' + street;
  if (m.includes('slight right')) return 'Mantenha à direita' + street;
  if (m.includes('left')) return 'Vire à esquerda' + street;
  if (m.includes('right')) return 'Vire à direita' + street;
  if (type === 'merge') return 'Entre' + street;
  return 'Siga em frente' + street;
}

function fmtDist(meters) {
  if (meters == null) return '—';
  if (meters < 1000) return Math.round(meters / 10) * 10 + ' m';
  return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + ' km';
}
function fmtDuration(sec) {
  if (sec == null) return '—';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
}

/* Rota real via OSRM (proxy no backend) */
async function fetchRoute(from, to) {
  const q = `fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`;
  const r = await fetch('/api/route?' + q);
  if (!r.ok) throw new Error('rota indisponivel');
  return r.json();
}

/* ==========================================================================
   Rumo (heading) com fallback por vetor
   ========================================================================== */
// Bearing entre dois pontos em graus (0 = norte, 90 = leste)
function bearingBetween(a, b) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
            Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
// Distancia em metros
function distMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Suaviza transicoes de rumo (evita a seta girar bruscamente)
function smoothAngle(prev, next) {
  if (prev == null) return next;
  let diff = ((next - prev + 540) % 360) - 180;
  return (prev + diff * 0.6 + 360) % 360;
}

/* ==========================================================================
   Voz de navegacao (Web Speech API)
   ========================================================================== */
const Voice = {
  enabled: true,
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  lastPhrase: '',
  lastAt: 0,
  lang: 'pt-BR',
  voice: null,

  init() {
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.voice = voices.find(v => v.lang === 'pt-BR') || voices.find(v => v.lang.startsWith('pt')) || null;
    };
    pick();
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = pick;
    // carrega preferencia salva
    try {
      const saved = localStorage.getItem('dt_voice');
      if (saved !== null) this.enabled = saved === '1';
    } catch (e) {}
  },

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('dt_voice', this.enabled ? '1' : '0'); } catch (e) {}
    if (!this.enabled) this.cancel();
    return this.enabled;
  },

  cancel() {
    if (this.supported) speechSynthesis.cancel();
  },

  // fala uma frase, evitando repetir a mesma em curto intervalo
  say(text, opts = {}) {
    if (!this.enabled || !this.supported || !text) return;
    const now = Date.now();
    if (text === this.lastPhrase && now - this.lastAt < (opts.cooldown || 8000)) return;
    this.lastPhrase = text;
    this.lastAt = now;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      u.rate = opts.rate || 1.05;
      u.pitch = 1;
      u.volume = 1;
      if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u);
    } catch (e) {}
  },

  // anuncio de manobra conforme proximidade (padrao Waze)
  announceManeuver(step, distanceM, route) {
    if (!this.enabled || !step) return;
    if (step.type === 'arrive') {
      if (distanceM <= 120) this.say('Você chegou ao destino.', { cooldown: 20000 });
      else if (distanceM <= 400) this.say('O destino está à frente, ' + fmtVoiceDist(distanceM) + '.', { cooldown: 20000 });
      return;
    }
    const instruction = voiceInstruction(step);
    if (distanceM <= 100) {
      this.say(voiceGo(step), { cooldown: 12000 });
    } else if (distanceM <= 900) {
      this.say('Em ' + fmtVoiceDist(distanceM) + ', ' + instruction + '.', { cooldown: 14000 });
    }
  },

  announceStart(route) {
    if (!this.enabled) return;
    this.say('Rota calculada. ' + fmtDuration(route.duration) + ' até o destino.', { cooldown: 30000 });
  },
};

function fmtVoiceDist(m) {
  if (m < 1000) return Math.round(m / 50) * 50 + ' metros';
  return (m / 1000).toFixed(1).replace('.', ',') + ' quilômetros';
}
// instrucao imperativa ("vire à esquerda na Rua X")
function voiceInstruction(step) {
  const m = step.modifier || '', name = step.name ? ' na ' + step.name : '';
  if (step.type === 'roundabout' || step.type === 'rotary') return 'na rotatória, siga';
  if (m.includes('uturn')) return 'faça o retorno' + name;
  if (m.includes('sharp left')) return 'vire acentuadamente à esquerda' + name;
  if (m.includes('sharp right')) return 'vire acentuadamente à direita' + name;
  if (m.includes('slight left')) return 'mantenha à esquerda' + name;
  if (m.includes('slight right')) return 'mantenha à direita' + name;
  if (m.includes('left')) return 'vire à esquerda' + name;
  if (m.includes('right')) return 'vire à direita' + name;
  if (step.type === 'merge') return 'entre' + name;
  return 'siga em frente' + name;
}
function voiceGo(step) {
  const m = step.modifier || '', name = step.name ? ', na ' + step.name : '';
  if (m.includes('uturn')) return 'Faça o retorno agora' + name;
  if (m.includes('left')) return 'Vire à esquerda agora' + name;
  if (m.includes('right')) return 'Vire à direita agora' + name;
  return 'Siga em frente agora' + name;
}

/* ==========================================================================
   Alertas de trânsito (estilo Waze)
   ========================================================================== */
function alertIcon(a) {
  return L.divIcon({
    className: '',
    html: `<div class="alert-pin" style="--ac:${a.color || '#ffb03a'}">
      <span>${a.icon || '⚠️'}</span>
    </div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

/* Gerenciador de alertas: carrega, desenha no mapa e escuta o socket */
function createAlertLayer(map, socket) {
  const markers = new Map();
  let layerOn = true;

  function draw(a) {
    if (markers.has(a.id)) {
      const m = markers.get(a.id);
      m.setLatLng([a.lat, a.lng]);
      m.setIcon(alertIcon(a));
      m.setTooltipContent(alertTooltip(a));
      return;
    }
    const m = L.marker([a.lat, a.lng], { icon: alertIcon(a), zIndexOffset: 400 })
      .addTo(map)
      .bindTooltip(alertTooltip(a));
    m.on('click', () => {
      window.dispatchEvent(new CustomEvent('alert:click', { detail: a }));
    });
    markers.set(a.id, m);
  }
  function remove(id) {
    const m = markers.get(id);
    if (m) { map.removeLayer(m); markers.delete(id); }
  }
  function clear() {
    markers.forEach(m => map.removeLayer(m));
    markers.clear();
  }
  function setVisible(v) {
    layerOn = v;
    markers.forEach(m => v ? m.addTo(map) : map.removeLayer(m));
  }
  function tooltip(a) {
    return alertTooltip(a);
  }

  // carrega alertas da area atual
  async function load() {
    try {
      const b = map.getBounds();
      const q = `?s=${b.getSouth()}&w=${b.getWest()}&n=${b.getNorth()}&e=${b.getEast()}`;
      const r = await fetch('/api/alerts' + q);
      if (!r.ok) return;
      const list = await r.json();
      // remove os que nao vieram mais
      const ids = new Set(list.map(a => a.id));
      markers.forEach((_, id) => { if (!ids.has(id)) remove(id); });
      list.forEach(draw);
    } catch (e) { /* silencioso */ }
  }

  // socket
  socket.on('alert:new', (a) => { if (layerOn) draw(a); });
  socket.on('alert:update', (a) => { if (markers.has(a.id)) draw(a); });
  socket.on('alert:remove', ({ id }) => remove(id));
  socket.on('alerts:snapshot', (list) => { list.forEach(draw); });

  return {
    markers, draw, remove, clear, setVisible, load, isOn: () => layerOn,
  };
}

function alertTooltip(a) {
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = relTime(a.createdAt);
  return `<b>${safe(a.icon)} ${safe(a.label)}</b><br>${a.by ? 'por ' + safe(a.by) + ' · ' : ''}${ago}` +
         (a.confirms ? `<br>👍 ${a.confirms} confirmação${a.confirms > 1 ? 'ões' : ''}` : '') +
         (a.comment ? `<br><i>${safe(a.comment)}</i>` : '');
}

/* Cria o alerta no backend */
async function postAlert({ type, lat, lng, orderToken, comment }) {
  const r = await fetch('/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, lat, lng, orderToken, comment }),
  });
  if (!r.ok) throw new Error('falha ao criar alerta');
  return r.json();
}
async function confirmAlert(id) {
  const r = await fetch('/api/alerts/' + id + '/confirm', { method: 'POST' });
  if (!r.ok) throw new Error('falha ao confirmar');
  return r.json();
}

/* Gerenciador de mapa estilo Waze */
function createWazeMap(elId, opts = {}) {
  const map = L.map(elId, { zoomControl: false, attributionControl: true, ...opts });
  const el = document.getElementById(elId);
  if (el) el.classList.add('map-dark');
  tileLayerSafe(map).addTo(map);

  const state = {
    map, route: null, routeOutline: null, routeLine: null,
    traveled: null, chevron: null, dest: null, heading: null, steps: [],
  };

  function clearRoute() {
    [state.routeOutline, state.routeLine].forEach(l => l && map.removeLayer(l));
    state.routeOutline = state.routeLine = null;
  }
  function clearTraveled() {
    if (state.traveled) { map.removeLayer(state.traveled); state.traveled = null; }
  }
  function drawRoute(route) {
    clearRoute();
    state.route = route;
    state.steps = route.steps || [];
    const latlngs = route.geometry.map(p => [p.lat, p.lng]);
    state.routeOutline = L.polyline(latlngs, { color: '#0b2b4d', weight: 11, opacity: .9, lineJoin: 'round' }).addTo(map);
    state.routeLine = L.polyline(latlngs, { color: '#4dabff', weight: 6, opacity: 1, lineJoin: 'round', className: 'route-glow' }).addTo(map);
    return state.routeLine;
  }
  function updateProgress(lat, lng) {
    if (!state.route) return;
    const pts = state.route.geometry;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].lat - lat) ** 2 + (pts[i].lng - lng) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 1) return;
    const done = pts.slice(0, best + 1).map(p => [p.lat, p.lng]);
    if (state.traveled) state.traveled.setLatLngs(done);
    else state.traveled = L.polyline(done, { color: '#4a5568', weight: 6, opacity: .85, lineJoin: 'round' }).addTo(map);
    return best;
  }
  function currentStep(lat, lng) {
    if (!state.steps || state.steps.length === 0) return null;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < state.steps.length; i++) {
      const s = state.steps[i];
      if (s.lat == null) continue;
      const d = Math.hypot(s.lat - lat, s.lng - lng);
      if (d < bestD) { bestD = d; best = i; }
    }
    for (let i = best; i < state.steps.length; i++) {
      const s = state.steps[i];
      if (s.lat == null) continue;
      if (Math.hypot(s.lat - lat, s.lng - lng) >= 0.00035) { best = i; break; }
      if (i === state.steps.length - 1) best = i;
    }
    return state.steps[best];
  }

  return {
    map, state, setRoute: drawRoute, clearRoute, clearTraveled,
    updateProgress, currentStep,
    setCourier(lat, lng, heading) {
      const ll = [lat, lng];
      if (heading != null && !Number.isNaN(heading)) state.heading = heading;
      if (state.chevron) { state.chevron.setLatLng(ll); rotateChevron(state.chevron, state.heading); }
      else state.chevron = L.marker(ll, { icon: chevronIcon(state.heading), zIndexOffset: 1000 }).addTo(map);
      return state.chevron;
    },
    setDest(lat, lng, label) {
      const ll = [lat, lng];
      if (state.dest) state.dest.setLatLng(ll);
      else state.dest = L.marker(ll, { icon: destFlagIcon(), zIndexOffset: 900 }).addTo(map);
      if (label) state.dest.bindTooltip(label);
    },
    follow(lat, lng, zoom) {
      state.map.panTo([lat, lng], { animate: true, duration: .6 });
      if (zoom != null) state.map.setZoom(zoom);
    },
    fit() {
      const pts = [];
      if (state.chevron) pts.push(state.chevron.getLatLng());
      if (state.dest) pts.push(state.dest.getLatLng());
      if (pts.length === 2) state.map.fitBounds(L.latLngBounds(pts).pad(0.3));
      else if (pts.length === 1) state.map.setView(pts[0], 16);
    },
  };
}
