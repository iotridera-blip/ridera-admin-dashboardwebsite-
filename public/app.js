// ── Maps (Google Maps JS API v3) ──────────────────────────────────────────
const maps = {};
const mapMarkers = {}; // tracks markers per map for clearing

// Maps use the default Google Maps light/white style (no custom styles)

function getOrCreateMap(id, lat = 14.0727, lng = 120.6235, zoom = 13) {
  if (maps[id]) return maps[id];
  const el = document.getElementById(id);
  if (!el) return null;
  const m = new google.maps.Map(el, {
    center: { lat: +lat, lng: +lng },
    zoom,
    mapTypeId: 'roadmap',
    styles: [],          // default light/white Google Maps style
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
  });
  maps[id] = m;
  mapMarkers[id] = [];
  return m;
}

function crashIcon(severity) {
  const c = severity === 'high' ? '#ff4444' : severity === 'medium' ? '#eab308' : '#FFEB0A';
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: c,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
  };
}

function addMarker(mapId, lat, lng, popup, severity = 'low') {
  const m = maps[mapId];
  if (!m) return;
  const marker = new google.maps.Marker({
    position: { lat: +lat, lng: +lng },
    map: m,
    icon: crashIcon(severity),
    title: popup.replace(/<[^>]+>/g, ' ').trim(),
  });
  const iw = new google.maps.InfoWindow({
    content: `<div style="color:#111;font-size:.82rem;line-height:1.6;max-width:200px">${popup}</div>`,
  });
  marker.addListener('click', () => iw.open({ map: m, anchor: marker }));
  if (!mapMarkers[mapId]) mapMarkers[mapId] = [];
  mapMarkers[mapId].push(marker);
  return marker;
}

function clearMap(mapId) {
  if (!mapMarkers[mapId]) return;
  mapMarkers[mapId].forEach(mk => mk.setMap(null));
  mapMarkers[mapId] = [];
}

function fitMapBounds(mapId, pts) {
  const m = maps[mapId];
  if (!m || !pts.length) return;
  if (pts.length === 1) {
    m.setCenter({ lat: pts[0][0], lng: pts[0][1] });
    m.setZoom(15);
  } else {
    const bounds = new google.maps.LatLngBounds();
    pts.forEach(([la, ln]) => bounds.extend({ lat: la, lng: ln }));
    m.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  }
}

function flyTo(mapId, lat, lng) {
  const m = maps[mapId];
  if (m) { m.panTo({ lat: +lat, lng: +lng }); m.setZoom(17); }
  document.getElementById(mapId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
}

// ── Router ────────────────────────────────────────────────────────────────
const router = {
  current: null,
  go(page, params = {}) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    const nl = document.querySelector(`[data-page="${page}"]`);
    if (nl) nl.classList.add('active');
    this.current = { page, params };
    pages[page]?.(params);
    // Fix map size after display
    setTimeout(() => { Object.values(maps).forEach(m => google.maps.event.trigger(m, 'resize')); }, 100);
  }
};

// ── Color avatar ──────────────────────────────────────────────────────────
const COLORS = ['#FFEB0A', '#3b82f6', '#22c55e', '#a855f7', '#a89400', '#06b6d4', '#eab308'];
function avatarColor(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % COLORS.length; return COLORS[h]; }
function initials(name) { return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(); }
function fmtDate(v) {
  if (!v) return '—';
  if (typeof v === 'number') return new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  return v;
}

// ── Loading helper ────────────────────────────────────────────────────────
function loading(el) { document.getElementById(el).innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`; }

// ── Crash Snackbar ────────────────────────────────────────────────────────
let _snackbarTimer = null;
let _lastKnownCrashCount = -1;  // -1 = first load (never show on boot)

function showCrashSnackbar(msg = 'A new riding crash event has been recorded.', severity = 'low', duration = 8000) {
  const bar = document.getElementById('crash-snackbar');
  const msgEl = document.getElementById('snackbar-msg');
  const prog = document.getElementById('snackbar-progress');
  const timeEl = document.getElementById('snackbar-time');
  if (!bar || !msgEl || !prog) return;

  // Clear any existing timer
  if (_snackbarTimer) { clearTimeout(_snackbarTimer); _snackbarTimer = null; }

  // Set content & severity variant
  msgEl.textContent = msg;
  bar.classList.remove('snackbar-high');
  if (severity === 'high') bar.classList.add('snackbar-high');

  // Timestamp
  if (timeEl) {
    timeEl.textContent = '⏱ ' + new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Show red badge on Crash Alert nav button
  document.getElementById('nav-crash-badge')?.classList.add('badge-visible');

  // Reset & restart progress bar
  prog.classList.remove('snackbar-draining');
  prog.style.transitionDuration = '';
  prog.style.transform = 'scaleX(1)';

  // Show
  bar.classList.add('snackbar-show');

  // Drain the progress bar after a tick so the transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      prog.style.transitionDuration = duration + 'ms';
      prog.classList.add('snackbar-draining');
    });
  });

  // Auto-dismiss
  _snackbarTimer = setTimeout(() => dismissSnackbar(), duration);
}

function dismissSnackbar() {
  const bar = document.getElementById('crash-snackbar');
  if (!bar) return;
  bar.classList.remove('snackbar-show');
  if (_snackbarTimer) { clearTimeout(_snackbarTimer); _snackbarTimer = null; }
  // Hide nav badge when notification is dismissed
  document.getElementById('nav-crash-badge')?.classList.remove('badge-visible');
}

/** Firebase RTDB uses `crash_history`; older data may use `crashes`. */
function userCrashEntries(u) {
  const h = u?.crash_history || u?.crashes;
  if (!h || typeof h !== 'object') return [];
  return Object.entries(h);
}

const AUTH_STORAGE_KEY = 'ridera_admin_token';

function showLoginScreen() {
  document.getElementById('login-screen')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');
  document.getElementById('app-shell')?.setAttribute('aria-hidden', 'true');
}

function showAppShell() {
  document.getElementById('login-screen')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');
  document.getElementById('app-shell')?.setAttribute('aria-hidden', 'false');
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem(AUTH_STORAGE_KEY);
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { ...options, headers });
  if (r.status === 401 && !String(url).includes('/login')) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    showLoginScreen();
  }
  return r;
}

function signOut() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  showLoginScreen();
  const err = document.getElementById('login-error');
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }
}

let refreshIntervalStarted = false;
function scheduleNextRefresh() {
  // Random interval between 5 000 ms and 15 000 ms
  const delay = Math.floor(Math.random() * 10000) + 5000;
  setTimeout(() => {
    if (router.current?.page === 'dashboard') pageDashboard();
    if (router.current?.page === 'devices') pageDevices();
    scheduleNextRefresh(); // re-schedule after each run
  }, delay);
}

function startRefreshInterval() {
  if (refreshIntervalStarted) return;
  refreshIntervalStarted = true;
  scheduleNextRefresh();
}

async function tryResumeSession() {
  const token = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) {
    showLoginScreen();
    return;
  }
  try {
    const r = await fetch('/api/overview', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      showAppShell();
      router.go('dashboard');
      startRefreshInterval();
      return;
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (_) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  showLoginScreen();
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────
async function pageDashboard() {
  loading('crash-list');
  try {
    const r = await apiFetch('/api/overview');
    if (r.status === 401) return;
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t.slice(0, 200) || `HTTP ${r.status}`);
    }
    const { crashes, totalUsers, totalDevices, timestamp } = await r.json();
    const crashList = Array.isArray(crashes) ? crashes : [];

    // ── Snackbar: fire only when new crashes arrive after first load ──────
    if (_lastKnownCrashCount === -1) {
      // First load — baseline only, no alert
      _lastKnownCrashCount = crashList.length;
    } else if (crashList.length > _lastKnownCrashCount) {
      const newCount = crashList.length - _lastKnownCrashCount;
      // Grab the newest entry for context
      const newest = crashList[0]?.data || {};
      const rider  = newest.rider_name ? `Rider: ${newest.rider_name}` : '';
      const loc    = newest.latitude   ? `📍 ${newest.latitude}, ${newest.longitude}` : '';
      const parts  = [`${newCount} new crash event${newCount > 1 ? 's' : ''} detected!`, rider, loc].filter(Boolean);
      const topSev = (newest.severity || 'low').toLowerCase();
      showCrashSnackbar(parts.join(' · '), topSev);
      _lastKnownCrashCount = crashList.length;
    }

    document.getElementById('stat-crashes').textContent = crashList.length;
    document.getElementById('stat-users').textContent = totalUsers;
    document.getElementById('stat-devices').textContent = totalDevices;
    const sev = crashList.map(c => c.data?.severity || 'low');
    document.getElementById('stat-severity').textContent = sev.includes('high') ? 'HIGH' : sev.includes('medium') ? 'MED' : 'LOW';
    document.getElementById('nav-ts').textContent = new Date(timestamp).toLocaleTimeString();

    // Map
    const map = getOrCreateMap('crash-map');
    clearMap('crash-map');
    const pts = [];
    crashList.forEach((c, i) => {
      const d = c.data;
      const lat = d?.latitude;
      const lng = d?.longitude;
      if (lat == null || lng == null || Number.isNaN(+lat) || Number.isNaN(+lng)) return;
      addMarker('crash-map', lat, lng,
        `<b>Crash #${i + 1}</b><br>${d.date} ${d.time}<br>📍${lat},${lng}`, d.severity);
      pts.push([+lat, +lng]);
    });
    fitMapBounds('crash-map', pts);

    // Crash list
    const el = document.getElementById('crash-list');
    if (!crashList.length) { el.innerHTML = '<div class="empty">No crash data found.</div>'; return; }
    el.innerHTML = crashList.map((c, i) => {
      const d = c.data;
      const sev = (d.severity || 'low').toLowerCase();
      const bc = sev === 'high' ? 'badge-high' : sev === 'medium' ? 'badge-med' : 'badge-low';

      // Riding type detection — support both explicit field and type string
      const rawType = (d.type || '').toLowerCase();
      const ridingType = d.riding_type || (rawType.includes('upright') ? 'upright' : rawType.includes('crash') ? 'crashed' : null);
      const isCrashed = ridingType ? ridingType.toLowerCase().includes('crash') : true;
      const ridingLabel = isCrashed ? '🔴 Riding Crashed' : '🟢 Riding Upright';
      const ridingClass = isCrashed ? 'riding-crashed' : 'riding-upright';

      return `<div class="crash-item">
        <div class="crash-top">
          <span>🚨</span>
          <span class="badge ${bc}">${sev}</span>
          <span class="riding-type-badge ${ridingClass}">${ridingLabel}</span>
          <span class="crash-path">${c.path}</span>
        </div>
        <div class="crash-fields">
          ${d.date ? `<div><div class="cf-label">Date</div><div class="cf-val">📅 ${d.date}</div></div>` : ''}
          ${d.time ? `<div><div class="cf-label">Time</div><div class="cf-val">🕐 ${d.time}</div></div>` : ''}
          ${d.speed !== undefined ? `<div><div class="cf-label">Speed</div><div class="cf-val">⚡ ${d.speed} km/h</div></div>` : ''}
          ${d.rider_name ? `<div><div class="cf-label">Rider Name</div><div class="cf-val">👤 ${d.rider_name}</div></div>` : ''}
          ${d.rider_phone ? `<div><div class="cf-label">Phone</div><div class="cf-val">📞 ${d.rider_phone}</div></div>` : ''}
          ${d.rider_plate ? `<div><div class="cf-label">Plate No.</div><div class="cf-val">🏍️ ${d.rider_plate}</div></div>` : ''}
          ${d.rider_model ? `<div><div class="cf-label">Motorcycle</div><div class="cf-val">🏍️ ${d.rider_model}</div></div>` : ''}
          ${d.latitude ? `<div style="grid-column:1/-1"><div class="cf-label">GPS</div><div class="cf-val cf-mono">📍 ${d.latitude}, ${d.longitude}</div></div>` : ''}
          ${d.type ? `<div class="crash-type-tag">💥 ${d.type.replace(/_/g, ' ').toUpperCase()}</div>` : ''}
          <div style="grid-column:1/-1">
            <div class="cf-label">Riding Status</div>
            <div class="riding-status-bar">
              <div class="riding-status-item ${isCrashed ? 'rs-active-crash' : 'rs-inactive'}">
                <span class="rs-dot"></span> Riding Crashed
                ${isCrashed ? '<span class="rs-check">✓</span>' : ''}
              </div>
              <div class="riding-status-item ${!isCrashed ? 'rs-active-upright' : 'rs-inactive'}">
                <span class="rs-dot"></span> Riding Upright
                ${!isCrashed ? '<span class="rs-check">✓</span>' : ''}
              </div>
            </div>
          </div>
        </div>
        ${d.latitude ? `<button class="fly-btn" onclick="flyTo('crash-map',${d.latitude},${d.longitude})">🗺️ View on Map</button>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('crash-list').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE: USERS
// ─────────────────────────────────────────────────────────────────────────
async function pageUsers() {
  loading('users-table-wrap');
  try {
    const r = await apiFetch('/api/users');
    if (r.status === 401) return;
    if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `HTTP ${r.status}`);
    const { users } = await r.json();
    const entries = Object.entries(users);
    document.getElementById('stat-users-count').textContent = entries.length;

    const withCrash = entries.filter(([, u]) => userCrashEntries(u).length > 0).length;
    const withDevice = entries.filter(([, u]) => u.motorcycle_model || u.plate_number).length;
    document.getElementById('stat-with-crash').textContent = withCrash;
    document.getElementById('stat-with-device').textContent = withDevice;

    const rows = entries.map(([id, u]) => {
      const col = avatarColor(u.name || id);
      const init = initials(u.name || id);
      const hasCrash = userCrashEntries(u).length > 0;
      const hasMoto = !!(u.motorcycle_model || u.plate_number);
      return `<tr class="user-row" onclick="router.go('user-detail',{id:'${id}'})">
        <td><div class="user-name-cell">
          <div class="user-avatar" style="background:${col}22;color:${col}">${init}</div>
          <div>
            <div style="font-weight:600">${u.name || '—'}</div>
            <div style="font-size:.72rem;color:var(--muted)">${u.email || '—'}</div>
          </div>
        </div></td>
        <td>${u.phone || '—'}</td>
        <td>${fmtDate(u.joinedAt || u.createdAt)}</td>
        <td>
          ${hasCrash ? '<span class="tag tag-crash">🚨 Crash</span> ' : ''} 
          ${hasMoto ? `<span class="tag tag-device">🏍️ ${u.motorcycle_model || ''}</span>` : ''}
        </td>
        <td><span class="tag ${u.active !== false ? 'tag-active' : 'tag-inactive'}">${u.active !== false ? 'Active' : '—'}</span></td>
      </tr>`;
    }).join('');

    document.getElementById('users-table-wrap').innerHTML = `
      <table class="user-table">
        <thead><tr>
          <th>Name</th><th>Phone</th><th>Joined</th><th>Tags</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    document.getElementById('users-table-wrap').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE: USER DETAIL
// ─────────────────────────────────────────────────────────────────────────
async function pageUserDetail({ id }) {
  loading('user-detail-body');
  try {
    const r = await apiFetch(`/api/users/${id}`);
    if (r.status === 401) return;
    if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `HTTP ${r.status}`);
    const { user: u } = await r.json();
    if (!u) { document.getElementById('user-detail-body').innerHTML = '<div class="error-box">User not found.</div>'; return; }

    const col = avatarColor(u.name || id);
    const init = initials(u.name || id);
    const crashes = userCrashEntries(u);

    let crashSection = '';
    if (crashes.length) {
      crashSection = `<div class="card">
        <div class="card-header"><span class="card-icon">🚨</span><span class="card-title">Crash History (${crashes.length})</span></div>
        <div class="card-body">
          ${crashes.map(([cid, c]) => {
        const sev = (c.severity || 'low').toLowerCase();
        const bc = sev === 'high' ? 'badge-high' : sev === 'medium' ? 'badge-med' : 'badge-low';
        return `<div class="crash-item">
              <div class="crash-top"><span class="badge ${bc}">${sev}</span><span class="crash-path">${cid}</span></div>
              <div class="crash-fields">
                ${c.date ? `<div><div class="cf-label">Date</div><div class="cf-val">📅 ${c.date}</div></div>` : ''}
                ${c.time ? `<div><div class="cf-label">Time</div><div class="cf-val">🕐 ${c.time}</div></div>` : ''}
                ${c.speed !== undefined ? `<div><div class="cf-label">Speed</div><div class="cf-val">⚡ ${c.speed} km/h</div></div>` : ''}
                ${c.latitude ? `<div style="grid-column:1/-1"><div class="cf-label">GPS</div><div class="cf-val cf-mono">📍 ${c.latitude}, ${c.longitude}</div></div>` : ''}
                ${c.type ? `<div class="crash-type-tag">💥 ${c.type.replace(/_/g, ' ').toUpperCase()}</div>` : ''}
              </div>
              ${c.latitude ? `<button class="fly-btn" onclick="flyTo('user-map',${c.latitude},${c.longitude})">🗺️ View on Map</button>` : ''}
            </div>`;
      }).join('')}
        </div>
      </div>
      <div class="card"><div class="card-header"><span class="card-icon">🗺️</span><span class="card-title">Crash Map</span></div>
        <div class="card-body np"><div id="user-map" style="height:300px;border-radius:0 0 14px 14px"></div></div>
      </div>`;
    }

    document.getElementById('user-detail-body').innerHTML = `
      <div class="user-hero">
        <div class="hero-avatar" style="background:${col}22;color:${col}">${init}</div>
        <div>
          <div class="hero-name">${u.name || 'Unknown'}</div>
          <div class="hero-email">${u.email || '—'}</div>
          <div class="hero-tags">
            ${u.motorcycle_model ? `<span class="tag tag-device">🏍️ ${u.motorcycle_model}</span>` : ''}
            ${u.plate_number ? `<span class="tag tag-device">🏷️ ${u.plate_number}</span>` : ''}
            ${u.phone ? `<span class="tag tag-active">📞 ${u.phone}</span>` : ''}
            ${crashes.length ? `<span class="tag tag-crash">🚨 ${crashes.length} crash(es)</span>` : ''}
            <span class="tag tag-inactive">📅 Joined: ${fmtDate(u.joinedAt || u.createdAt)}</span>
          </div>
        </div>
      </div>
      <div class="info-grid" style="margin-bottom:18px">
        <div class="info-item"><div class="info-label">User ID</div><div class="info-val" style="font-family:monospace;font-size:.78rem">${id}</div></div>
        <div class="info-item"><div class="info-label">Email</div><div class="info-val">${u.email || '—'}</div></div>
        <div class="info-item"><div class="info-label">Phone</div><div class="info-val">${u.phone || '—'}</div></div>
        <div class="info-item"><div class="info-label">Motorcycle</div><div class="info-val">${u.motorcycle_model || '—'}</div></div>
        <div class="info-item"><div class="info-label">Plate</div><div class="info-val">${u.plate_number || '—'}</div></div>
        <div class="info-item"><div class="info-label">Crashes</div><div class="info-val c-red">${crashes.length}</div></div>
      </div>
      ${crashSection || '<div class="empty">No crash history for this user.</div>'}`;

    // Init crash map
    if (crashes.length) {
      setTimeout(() => {
        const m = getOrCreateMap('user-map');
        clearMap('user-map');
        const pts = [];
        crashes.forEach(([, c]) => {
          if (c.latitude) {
            addMarker('user-map', c.latitude, c.longitude, `${c.date} ${c.time}`, c.severity);
            pts.push([c.latitude, c.longitude]);
          }
        });
        fitMapBounds('user-map', pts);
        google.maps.event.trigger(m, 'resize');
      }, 200);
    }
  } catch (e) {
    document.getElementById('user-detail-body').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE: DEVICES
// ─────────────────────────────────────────────────────────────────────────
async function pageDevices() {
  loading('devices-body');
  try {
    const r = await apiFetch('/api/devices');
    if (r.status === 401) return;
    if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `HTTP ${r.status}`);
    const { devices } = await r.json();
    const entries = Object.entries(devices);
    document.getElementById('stat-dev-count').textContent = entries.length;

    const connected = entries.filter(([, d]) => d.telemetry?.state?.status === 'Connected').length;
    document.getElementById('stat-dev-online').textContent = connected;

    const html = entries.map(([id, d]) => {
      const tel = d.telemetry?.data || {};
      const loc = tel.location || {};
      const crash = tel.crash || {};
      const crashSev = (crash.severity || 'low').toLowerCase();
      const crashBadgeClass = crashSev === 'high' ? 'badge-high' : crashSev === 'medium' ? 'badge-med' : 'badge-low';
      const wifi = tel.wifi || {};
      const state = d.telemetry?.state?.status || 'Unknown';
      const connectedUser = d.connected || '—';
      const isOn = state === 'Connected';

      return `<div class="card" style="margin-bottom:0">
        <div class="device-hero">
          <div class="device-id-label">Device ID</div>
          <div class="device-id">🔌 ${d.device_id || id}</div>
          <div><span class="device-status ${isOn ? 'status-connected' : 'status-offline'}">
            <span style="width:7px;height:7px;background:${isOn ? 'var(--green)' : 'var(--muted)'};border-radius:50%;display:inline-block"></span>
            ${state}
          </span></div>
          <div style="margin-top:12px;font-size:.8rem;color:var(--muted)">Connected Rider: <span style="color:var(--text);font-weight:600">${connectedUser}</span></div>
        </div>

        <div class="card-body">
          <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;font-weight:600">📡 Live Telemetry</div>
          <div class="tel-grid" style="margin-bottom:16px">
            <div class="tel-item"><div class="tel-icon">📍</div><div class="tel-val">${loc.city || '—'}</div><div class="tel-label">City</div></div>
            <div class="tel-item"><div class="tel-icon">⚡</div><div class="tel-val">${loc.speed_kmph ?? '—'} <span style="font-size:.7rem;font-weight:400">km/h</span></div><div class="tel-label">Speed</div></div>
            <div class="tel-item"><div class="tel-icon">🛰️</div><div class="tel-val">${loc.satellite || '—'}</div><div class="tel-label">GPS</div></div>
            <div class="tel-item"><div class="tel-icon">📶</div><div class="tel-val">${wifi.ping ?? '—'} <span style="font-size:.7rem;font-weight:400">ms</span></div><div class="tel-label">Ping</div></div>
          </div>

          ${loc.latitude ? `
          <div class="info-grid" style="margin-bottom:16px">
            <div class="info-item"><div class="info-label">Latitude</div><div class="info-val cf-mono">${loc.latitude}</div></div>
            <div class="info-item"><div class="info-label">Longitude</div><div class="info-val cf-mono">${loc.longitude}</div></div>
            <div class="info-item"><div class="info-label">Province</div><div class="info-val">${loc.province || '—'}</div></div>
            <div class="info-item"><div class="info-label">Last Update</div><div class="info-val">${loc.date || ''} ${loc.time || ''}</div></div>
          </div>
          <div class="card-body np" style="margin:-18px -18px 16px -18px;padding:0">
            <div id="device-map-${id}" style="height:300px;border-radius:10px;overflow:hidden"></div>
          </div>`: ''}

          ${crash.date ? `
          <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;font-weight:600">🚨 Last Crash</div>
          <div class="crash-item">
            <div class="crash-top"><span class="badge ${crashBadgeClass}">${crashSev}</span></div>
            <div class="crash-fields">
              <div><div class="cf-label">Date/Time</div><div class="cf-val">${crash.date} ${crash.time}</div></div>
              <div><div class="cf-label">Speed</div><div class="cf-val">⚡ ${crash.speed} km/h</div></div>
              ${crash.latitude ? `<div style="grid-column:1/-1"><div class="cf-label">GPS</div><div class="cf-val cf-mono">📍 ${crash.latitude}, ${crash.longitude}</div></div>` : ''}
              ${crash.type ? `<div class="crash-type-tag">💥 ${crash.type.replace(/_/g, ' ').toUpperCase()}</div>` : ''}
            </div>
          </div>`: ''}

          <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 10px;font-weight:600">📶 WiFi</div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">SSID</div><div class="info-val">${wifi.ssid || '—'}</div></div>
            <div class="info-item"><div class="info-label">IP</div><div class="info-val cf-mono">${wifi.ip || '—'}</div></div>
            <div class="info-item"><div class="info-label">Ping</div><div class="info-val">${wifi.ping ?? '—'} ms</div></div>
          </div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('devices-body').innerHTML = html || '<div class="empty">No devices found.</div>';

    // Init device maps
    setTimeout(() => {
      entries.forEach(([id, d]) => {
        const loc = d.telemetry?.data?.location;
        if (loc?.latitude) {
          const m = getOrCreateMap(`device-map-${id}`, loc.latitude, loc.longitude, 16);
          addMarker(`device-map-${id}`, loc.latitude, loc.longitude,
            `📍 ${loc.city}, ${loc.province}<br>${loc.date} ${loc.time}`, 'medium');
          google.maps.event.trigger(m, 'resize');
        }
      });
    }, 200);
  } catch (e) {
    document.getElementById('devices-body').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Page registry
// ─────────────────────────────────────────────────────────────────────────
const pages = {
  dashboard: pageDashboard,
  users: pageUsers,
  'user-detail': pageUserDetail,
  devices: pageDevices,
};

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Wire up snackbar dismiss button
  document.getElementById('snackbar-close')?.addEventListener('click', dismissSnackbar);

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value || '';
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');
    errEl?.classList.add('hidden');
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (errEl) {
          errEl.textContent = data.error || 'Sign in failed';
          errEl.classList.remove('hidden');
        }
        return;
      }
      if (data.token) localStorage.setItem(AUTH_STORAGE_KEY, data.token);
      showAppShell();
      startRefreshInterval();
      router.go('dashboard');
    } catch (ex) {
      if (errEl) {
        errEl.textContent = ex.message || 'Network error';
        errEl.classList.remove('hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  tryResumeSession();
});