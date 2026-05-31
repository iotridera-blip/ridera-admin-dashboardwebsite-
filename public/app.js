// ── Firebase Client SDK — Real-time Alerts Listener ─────────────────────────
const _fbConfig = {
  apiKey: "AIzaSyDCPjdmPjhjeCWXJnsX_b8HEBlwRrEGZM8",
  authDomain: "ridera-dg7.firebaseapp.com",
  databaseURL: "https://ridera-dg7-default-rtdb.firebaseio.com",
  projectId: "ridera-dg7",
  storageBucket: "ridera-dg7.firebasestorage.app",
  messagingSenderId: "139828355676",
  appId: "1:139828355676:web:fb8de1c261db813130bc99",
  measurementId: "G-RX9N66J29B",
};
if (!firebase.apps.length) firebase.initializeApp(_fbConfig);
const _rtdb = firebase.database();

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
const LAST_PAGE_KEY = 'ridera_last_page';

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
    // Persistent page state — save top-level pages only (not user-detail which needs params)
    if (
      ['dashboard',
        'devices',
        'users',
        'responders'
      ].includes(page)
    ) {
      localStorage.setItem(
        LAST_PAGE_KEY,
        page
      );
    }
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
// ── Audio unlock: browsers require a user gesture before audio can play.
// The first click anywhere on the page silently plays + pauses the element,
// which registers it as "user-activated" so later auto-plays work.
let _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  const el = document.getElementById('alertSound');
  if (!el) return;
  el.volume = 0;
  el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = 1.0; _audioUnlocked = true; }).catch(() => { });
  document.removeEventListener('click', _unlockAudio);
  document.removeEventListener('touchstart', _unlockAudio);
}
document.addEventListener('click', _unlockAudio);
document.addEventListener('touchstart', _unlockAudio);

function playCrashAlertSound() {
  const el = document.getElementById('alertSound');
  if (!el) return;
  el.currentTime = 0;
  el.volume = 1.0;
  el.play().catch(err => console.log('Audio blocked:', err));
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
  // Refresh live telemetry every 50 – 60 seconds
  const delay = Math.floor(Math.random() * 10000) + 50000; // 50 000 – 60 000 ms
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

// ── Real-time crash watcher — fires instantly when any crash_history changes ──
let _crashListenerActive = false;
function listenForCrashes() {
  if (_crashListenerActive) return;
  _crashListenerActive = true;

  // Watch the entire users node; any crash_history write triggers this
  _rtdb.ref('Ridera/users').on('value', () => {
    // Re-fetch the full dashboard data via the server API so
    // all enrichment (responder_status, etc.) is consistent
    if (router.current?.page === 'dashboard') pageDashboard();
  });
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
      // Persistent page state — restore last visited page, default to dashboard
      const lastPage = localStorage.getItem(LAST_PAGE_KEY) || 'dashboard';
      router.go(lastPage);
      startRefreshInterval();
      listenForAlerts();  // real-time alerts listener — once
      listenForCrashes(); // real-time crash entries listener — once
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
      const rider = newest.rider_name ? `Rider: ${newest.rider_name}` : '';
      const loc = newest.latitude ? `📍 ${newest.latitude}, ${newest.longitude}` : '';
      const parts = [`${newCount} new crash event${newCount > 1 ? 's' : ''} detected!`, rider, loc].filter(Boolean);
      const topSev = (newest.severity || 'low').toLowerCase();
      showCrashSnackbar(parts.join(' · '), topSev);


      // PLAY ALERT SOUND
      playCrashAlertSound();

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

      if (d.responder_status === "alert_sent") {
        _rtdb.ref(c.path).update({
          responder_status: "alert_received",
          alert_received_at: Date.now()
        });
      }

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

      // Riding type detection
      const rawType = (d.type || '').toLowerCase();
      const ridingType = d.riding_type || (rawType.includes('upright') ? 'upright' : rawType.includes('crash') ? 'crashed' : null);
      const isCrashed = ridingType ? ridingType.toLowerCase().includes('crash') : true;
      const ridingLabel = isCrashed ? '🔴 Riding Crashed' : '🟢 Riding Upright';
      const ridingClass = isCrashed ? 'riding-crashed' : 'riding-upright';

      // Responder status
      const rs = (d.responder_status || '').toLowerCase();
      const rsLabel = rs === 'on_the_way' ? '🚗 On The Way' : rs === 'arrived' ? '📍 Arrived' : rs === 'resolved' ? '✅ Resolved' : '⏳ Pending';
      const rsClass = rs === 'resolved' ? 'rs-tag-resolved' : rs === 'arrived' ? 'rs-tag-arrived' : rs === 'on_the_way' ? 'rs-tag-onway' : 'rs-tag-pending';

      // Photo avatar
      const photoHtml = (d.photo && d.photo.startsWith('http'))
        ? `<img src="${d.photo}" class="crash-rider-photo">` : '';

      return `<div class="crash-item" id="crash-item-${i}">
        <!-- ── Clickable header ── -->
        <div class="crash-top crash-toggle" onclick="toggleCrashExpand(${i})">
          <span>🚨</span>
          <span class="badge ${bc}">${sev}</span>
          <span class="riding-type-badge ${ridingClass}">${ridingLabel}</span>
          <span class="responder-tag ${rsClass}" id="rs-top-badge-${i}">${rsLabel}</span>
          <span class="crash-path">${c.path}</span>
          <span class="crash-chevron" id="crash-chevron-${i}">▼</span>
        </div>

        <!-- ── Expandable detail body ── -->
        <div class="crash-detail-body" id="crash-detail-${i}">
          <div class="crash-detail-inner">

            <!-- Rider photo + identity -->
            <div class="crash-rider-row">
              ${photoHtml}
              <div class="crash-all-fields">
                ${d.name ? `<div class="caf-row"><span class="caf-key">👤 Name</span><span class="caf-val">${d.name}</span></div>` : ''}
                ${d.phone ? `<div class="caf-row"><span class="caf-key">📞 Phone</span><span class="caf-val">${d.phone}</span></div>` : ''}
                ${d.sex ? `<div class="caf-row"><span class="caf-key">⚧ Sex</span><span class="caf-val">${d.sex}</span></div>` : ''}
                ${d.date ? `<div class="caf-row"><span class="caf-key">📅 Date</span><span class="caf-val">${d.date}</span></div>` : ''}
                ${d.time ? `<div class="caf-row"><span class="caf-key">🕐 Time</span><span class="caf-val">${d.time}</span></div>` : ''}
                ${d.speed !== undefined ? `<div class="caf-row"><span class="caf-key">⚡ Speed</span><span class="caf-val">${d.speed} km/h</span></div>` : ''}
                ${d.latitude !== undefined ? `<div class="caf-row"><span class="caf-key">📍 GPS</span><span class="caf-val caf-mono">${d.latitude}, ${d.longitude}</span></div>` : ''}
                ${d.vehicle_model ? `<div class="caf-row"><span class="caf-key">🏍️ Model</span><span class="caf-val">${d.vehicle_model}</span></div>` : ''}
                ${d.vehicle_plate ? `<div class="caf-row"><span class="caf-key">🏷️ Plate</span><span class="caf-val">${d.vehicle_plate}</span></div>` : ''}
                ${d.vehicle_color ? `<div class="caf-row"><span class="caf-key">🎨 Color</span><span class="caf-val">${d.vehicle_color}</span></div>` : ''}
                ${d.vehicle_type ? `<div class="caf-row"><span class="caf-key">🛵 Type</span><span class="caf-val">${d.vehicle_type}</span></div>` : ''}
                ${d.type ? `<div class="caf-row"><span class="caf-key">💥 Crash Type</span><span class="caf-val">${d.type.replace(/_/g, ' ').toUpperCase()}</span></div>` : ''}
                ${d.severity ? `<div class="caf-row"><span class="caf-key">⚠️ Severity</span><span class="caf-val">${d.severity}</span></div>` : ''}
                ${d.crashId ? `<div class="caf-row"><span class="caf-key">🆔 Crash ID</span><span class="caf-val caf-mono">${d.crashId}</span></div>` : ''}
                ${d.createdAt ? `<div class="caf-row"><span class="caf-key">🕓 Created At</span><span class="caf-val caf-mono">${new Date(d.createdAt).toLocaleString('en-PH')}</span></div>` : ''}
                ${d.alert_received_at ? `<div class="caf-row"><span class="caf-key">🔔 Alert Received</span><span class="caf-val caf-mono">${new Date(d.alert_received_at).toLocaleString('en-PH')}</span></div>` : ''}
                <div class="caf-row"><span class="caf-key">📂 DB Path</span><span class="caf-val caf-mono" style="font-size:.68rem;word-break:break-all">${c.path}</span></div>
              </div>
            </div>

            <!-- Riding status bar -->
            <div class="riding-status-bar" style="margin:14px 0">
              <div class="riding-status-item ${isCrashed ? 'rs-active-crash' : 'rs-inactive'}">
                <span class="rs-dot"></span> Riding Crashed
                ${isCrashed ? '<span class="rs-check">✓</span>' : ''}
              </div>
              <div class="riding-status-item ${!isCrashed ? 'rs-active-upright' : 'rs-inactive'}">
                <span class="rs-dot"></span> Riding Upright
                ${!isCrashed ? '<span class="rs-check">✓</span>' : ''}
              </div>
            </div>

            <!-- Responder status control -->
            <div class="responder-ctrl">
              <div class="responder-ctrl-header">
                <span class="responder-ctrl-title">🛡️ Responder Status</span>
                <span class="responder-tag ${rsClass}" id="rs-badge-${i}">${rsLabel}</span>
              </div>
              <div class="responder-btns">
                <button class="responder-btn rb-onway  ${rs === 'on_the_way' ? 'rb-active' : ''}" id="rb-onway-${i}"  onclick="updateResponderStatus('${c.path}','on_the_way',${i})">🚗 ON THE WAY</button>
                <button class="responder-btn rb-arrive ${rs === 'arrived' ? 'rb-active' : ''}" id="rb-arrive-${i}" onclick="updateResponderStatus('${c.path}','arrived',${i})">📍 ARRIVE</button>
                <button class="responder-btn rb-resolve ${rs === 'resolved' ? 'rb-active' : ''}" id="rb-resolve-${i}" onclick="updateResponderStatus('${c.path}','resolved',${i})">✅ RESOLVE</button>
              </div>
            </div>

          </div>
          ${d.latitude ? `<button class="fly-btn" style="margin:0 14px 14px" onclick="flyTo('crash-map',${d.latitude},${d.longitude})">🗺️ View on Map</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('crash-list').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CRASH CARD HELPERS
// ─────────────────────────────────────────────────────────────────────────
function toggleCrashExpand(i) {
  const body = document.getElementById(`crash-detail-${i}`);
  const chevron = document.getElementById(`crash-chevron-${i}`);
  if (!body) return;
  const isOpen = body.classList.contains('crash-detail-open');
  body.classList.toggle('crash-detail-open', !isOpen);
  if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

async function updateResponderStatus(fbPath, status, idx) {
  try {
    const r = await apiFetch('/api/responder-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fbPath, status })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('❌ Failed to update: ' + (err.error || `HTTP ${r.status}`));
      return;
    }
    const rsLabel = status === 'on_the_way' ? '🚗 On The Way' : status === 'arrived' ? '📍 Arrived' : '✅ Resolved';
    const rsClass = status === 'resolved' ? 'rs-tag-resolved' : status === 'arrived' ? 'rs-tag-arrived' : 'rs-tag-onway';
    // Update both badges
    [document.getElementById(`rs-badge-${idx}`), document.getElementById(`rs-top-badge-${idx}`)].forEach(el => {
      if (!el) return;
      el.textContent = rsLabel;
      el.className = el.className.replace(/rs-tag-\w+/, rsClass);
    });
    // Toggle active button
    const keyMap = { on_the_way: 'onway', arrived: 'arrive', resolved: 'resolve' };
    ['onway', 'arrive', 'resolve'].forEach(k => document.getElementById(`rb-${k}-${idx}`)?.classList.remove('rb-active'));
    document.getElementById(`rb-${keyMap[status]}-${idx}`)?.classList.add('rb-active');
    // Toast
    const toast = document.createElement('div');
    toast.textContent = `✅ Responder status → "${rsLabel}"`;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 20px #0006;font-size:.9rem;pointer-events:none';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (ex) {
    alert('❌ Network error: ' + ex.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ALERTS — Firebase real-time listener
// Flow: alert_triggered → (hidden) → alert_sent → (shown on website)
//       → AUTO: alert_received → admin: on_the_way → arrived → resolved
// ─────────────────────────────────────────────────────────────────────────

const _receivedAlerts = new Set(); // guards markAsReceived — never repeat
let _alertListenerActive = false;   // IMPORTANT: register listener only once

/** 6. Convert Timestamp to Time */
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

/** 2. AUTO SET TO alert_received — called once per new alert_sent entry. */
function markAsReceived(alertId) {
  _rtdb.ref('alerts/' + alertId).update({
    responder_status: 'alert_received',
    alert_received_at: Date.now(),
  });
}

/** 3/4/5. On The Way / Arrived / Resolved buttons handler. */
function updateAlertStatus(alertId, status) {
  const updates = { responder_status: status };
  const tsMap = { on_the_way: 'on_the_way_at', arrived: 'arrived_at', resolved: 'resolved_at' };
  if (tsMap[status]) updates[tsMap[status]] = Date.now();
  _rtdb.ref('alerts/' + alertId).update(updates);
}

/** Build one alert card. */
function buildAlertCard(alert, key) {
  const rs = alert.responder_status || '';
  const rsLabel = rs === 'alert_received' ? '🔔 Received'
    : rs === 'on_the_way' ? '🚗 On The Way'
      : rs === 'arrived' ? '📍 Arrived'
        : rs === 'resolved' ? '✅ Resolved'
          : rs === 'alert_sent' ? '📤 Sent' : rs;
  const rsClass = rs === 'resolved' ? 'rs-tag-resolved'
    : rs === 'arrived' ? 'rs-tag-arrived'
      : rs === 'on_the_way' ? 'rs-tag-onway'
        : 'rs-tag-pending';

  const sentAt = alert.alert_sent_at ? formatTime(alert.alert_sent_at) : '—';
  const receivedAt = alert.alert_received_at ? formatTime(alert.alert_received_at) : '—';
  const onWayAt = alert.on_the_way_at ? formatTime(alert.on_the_way_at) : null;
  const arrivedAt = alert.arrived_at ? formatTime(alert.arrived_at) : null;
  const resolvedAt = alert.resolved_at ? formatTime(alert.resolved_at) : null;

  return `<div class="crash-item" id="alert-card-${key}">
    <div class="crash-top">
      <span>🚨</span>
      <span class="responder-tag ${rsClass}">${rsLabel}</span>
      <span style="font-size:.78rem;color:var(--muted);margin-left:auto">ID: ${key}</span>
    </div>
    <div class="crash-detail-inner" style="padding:12px 0">
      <div class="crash-all-fields">
        ${alert.rider_name ? `<div class="caf-row"><span class="caf-key">👤 Rider</span><span class="caf-val">${alert.rider_name}</span></div>` : ''}
        ${alert.phone ? `<div class="caf-row"><span class="caf-key">📞 Phone</span><span class="caf-val">${alert.phone}</span></div>` : ''}
        ${alert.latitude ? `<div class="caf-row"><span class="caf-key">📍 GPS</span><span class="caf-val caf-mono">${alert.latitude}, ${alert.longitude}</span></div>` : ''}
        <div class="caf-row"><span class="caf-key">📤 Sent At</span><span class="caf-val caf-mono">${sentAt}</span></div>
        <div class="caf-row"><span class="caf-key">🔔 Received At</span><span class="caf-val caf-mono">${receivedAt}</span></div>
        ${onWayAt ? `<div class="caf-row"><span class="caf-key">🚗 On The Way At</span><span class="caf-val caf-mono">${onWayAt}</span></div>` : ''}
        ${arrivedAt ? `<div class="caf-row"><span class="caf-key">📍 Arrived At</span><span class="caf-val caf-mono">${arrivedAt}</span></div>` : ''}
        ${resolvedAt ? `<div class="caf-row"><span class="caf-key">✅ Resolved At</span><span class="caf-val caf-mono">${resolvedAt}</span></div>` : ''}
      </div>
      <div class="responder-btns" style="margin-top:10px">
        <button class="responder-btn rb-onway  ${rs === 'on_the_way' ? 'rb-active' : ''}" onclick="updateAlertStatus('${key}','on_the_way')">🚗 ON THE WAY</button>
        <button class="responder-btn rb-arrive ${rs === 'arrived' ? 'rb-active' : ''}" onclick="updateAlertStatus('${key}','arrived')">📍 ARRIVED</button>
        <button class="responder-btn rb-resolve ${rs === 'resolved' ? 'rb-active' : ''}" onclick="updateAlertStatus('${key}','resolved')">✅ RESOLVED</button>
      </div>
      ${alert.latitude ? `<button class="fly-btn" style="margin-top:10px" onclick="flyTo('crash-map',${alert.latitude},${alert.longitude})">🗺️ View on Map</button>` : ''}
    </div>
  </div>`;
}

/**
 * 1. Listen for alerts — IMPORTANT: registered only once (_alertListenerActive guard).
 * Automatically shows cards for alert_sent+ and auto-sets alert_received.
 */
function listenForAlerts() {
  if (_alertListenerActive) return; // never register a second listener
  _alertListenerActive = true;

  const alertsRef = _rtdb.ref('alerts');
  alertsRef.on('value', (snapshot) => {
    const alerts = snapshot.val();
    const el = document.getElementById('alert-list');
    if (!el) return;
    if (!alerts) {
      el.innerHTML = '<div class="empty">No active alerts.</div>';
      return;
    }

    const cards = [];
    Object.keys(alerts).forEach((key) => {
      const alert = alerts[key];

      // SHOW ONLY IF alert_sent or later (alert_triggered stays hidden)
      if (
        alert.responder_status === 'alert_sent' ||
        alert.responder_status === 'alert_received' ||
        alert.responder_status === 'on_the_way' ||
        alert.responder_status === 'arrived'
      ) {
        // AUTO SET TO alert_received — ONCE per alert, never repeat
        if (alert.responder_status === 'alert_sent' && !_receivedAlerts.has(key)) {
          _receivedAlerts.add(key);
          markAsReceived(key);
          // Play alert sound for each new incoming alert
          playCrashAlertSound();
          showCrashSnackbar(`🚨 New crash alert received! ID: ${key}`, 'high', 8000);
        }
        cards.push(buildAlertCard(alert, key));
      }
    });

    el.innerHTML = cards.length
      ? cards.join('')
      : '<div class="empty">No active alerts.</div>';
  });
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
    const withDevice = entries.filter(([, u]) => u.vehicle_model || u.vehicle_plate || u.bound_device).length;
    document.getElementById('stat-with-crash').textContent = withCrash;
    document.getElementById('stat-with-device').textContent = withDevice;

    const rows = entries.map(([id, u]) => {
      const col = avatarColor(u.name || id);
      const init = initials(u.name || id);
      const hasCrash = userCrashEntries(u).length > 0;
      const hasMoto = !!(u.vehicle_model || u.vehicle_plate);
      const avatarHtml = (u.photo && u.photo.startsWith('http'))
        ? `<img src="${u.photo}" class="user-avatar" style="object-fit:cover;padding:0">`
        : `<div class="user-avatar" style="background:${col}22;color:${col}">${init}</div>`;
      const safeName = (u.name || 'this user').replace(/'/g, "\\'");
      return `<tr class="user-row" onclick="router.go('user-detail',{id:'${id}'})">
        <td><div class="user-name-cell">
          ${avatarHtml}
          <div>
            <div style="font-weight:600">${u.name || '—'}</div>
            <div style="font-size:.72rem;color:var(--muted)">${u.email || '—'}</div>
          </div>
        </div></td>
        <td>${u.phone || '—'}</td>
        <td>${u.address || '—'}</td>
        <td>${fmtDate(u.joinedAt || u.createdAt)}</td>
        <td>
          ${hasCrash ? '<span class="tag tag-crash">🚨 Crash</span> ' : ''}
          ${hasMoto ? `<span class="tag tag-device">🏍️ ${u.vehicle_model || ''}</span>` : ''}
          ${(() => { const bd = (u.bound_device || '').toUpperCase(); return bd && bd !== 'NONE' ? `<span class="tag tag-active" style="font-size:.68rem">🔌 ${u.bound_device}</span>` : `<span class="tag tag-inactive" style="font-size:.68rem">🔌 None</span>`; })()}
        </td>
        <td><span class="tag ${u.active !== false ? 'tag-active' : 'tag-inactive'}">${u.active !== false ? 'Active' : '—'}</span></td>
        <td onclick="event.stopPropagation()">
          <button class="delete-user-btn" onclick="deleteUser('${id}','${safeName}')" title="Delete user">
            🗑️ Delete
          </button>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('users-table-wrap').innerHTML = `
      <table class="user-table">
        <thead><tr>
          <th>Name</th><th>Phone</th><th>Address</th><th>Joined</th><th>Tags</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    document.getElementById('users-table-wrap').innerHTML = `<div class="error-box">❌ ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE USER
// ─────────────────────────────────────────────────────────────────────────
async function deleteUser(id, name) {
  const confirmed = window.confirm(`⚠️ Delete user "${name}"?\n\nThis will permanently remove the user from the Firebase database. This action cannot be undone.`);
  if (!confirmed) return;

  try {
    const r = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('❌ Failed to delete user: ' + (err.error || `HTTP ${r.status}`));
      return;
    }
    // Show success feedback then reload the users list
    const toast = document.createElement('div');
    toast.textContent = `✅ User "${name}" deleted successfully.`;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 20px #0006;font-size:.9rem';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
    pageUsers(); // Refresh the user list
  } catch (ex) {
    alert('❌ Network error: ' + ex.message);
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

    // ── Avatar: photo URL if available, otherwise colored initials ─────
    const heroAvatarHtml = (u.photo && u.photo.startsWith('http'))
      ? `<img src="${u.photo}" class="hero-avatar" style="object-fit:cover;padding:0;border:3px solid ${col}">`
      : `<div class="hero-avatar" style="background:${col}22;color:${col}">${init}</div>`;

    // ── Emergency contacts ───────────────────────────────────────────────
    const contacts = Object.values(u.alert_contacts || {});
    const contactsSection = contacts.length ? `
      <div class="card">
        <div class="card-header"><span class="card-icon">📞</span><span class="card-title">Emergency Contacts (${contacts.length})</span></div>
        <div class="card-body">
          ${contacts.map(c => {
      const cCol = avatarColor(c.contact_name || '?');
      const cInit = initials(c.contact_name || '?');
      const cAvatar = (c.contact_photo && c.contact_photo.startsWith('http'))
        ? `<img src="${c.contact_photo}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:38px;height:38px;border-radius:50%;background:${cCol}22;color:${cCol};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0">${cInit}</div>`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
              ${cAvatar}
              <div>
                <div style="font-weight:600">${c.contact_name || '—'}</div>
                <div style="font-size:.75rem;color:var(--muted)">${c.contact_relationship || ''} · 📞 ${c.contact_phone || '—'}</div>
              </div>
            </div>`;
    }).join('')}
        </div>
      </div>` : '';

    document.getElementById('user-detail-body').innerHTML = `
      <div class="user-hero">
        ${heroAvatarHtml}
        <div>
          <div class="hero-name">${u.name || 'Unknown'}</div>
          <div class="hero-email">${u.email || '—'}</div>
          <div class="hero-tags">
            ${u.vehicle_model ? `<span class="tag tag-device">🏍️ ${u.vehicle_model}</span>` : ''}
            ${u.vehicle_plate ? `<span class="tag tag-device">🏷️ ${u.vehicle_plate}</span>` : ''}
            ${(() => { const bd = (u.bound_device || '').toUpperCase(); return bd && bd !== 'NONE' ? `<span class="tag tag-active">🔌 ${u.bound_device}</span>` : `<span class="tag tag-inactive">🔌 Not Connected</span>`; })()}
            ${u.phone ? `<span class="tag tag-active">📞 ${u.phone}</span>` : ''}
            ${crashes.length ? `<span class="tag tag-crash">🚨 ${crashes.length} crash(es)</span>` : ''}
            <span class="tag tag-inactive">📅 Joined: ${fmtDate(u.joinedAt || u.createdAt)}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">👤</span><span class="card-title">Personal Info</span></div>
        <div class="card-body">
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Full Name</div><div class="info-val">${u.name || '—'}</div></div>
            <div class="info-item"><div class="info-label">Email</div><div class="info-val">${u.email || '—'}</div></div>
            <div class="info-item"><div class="info-label">Phone</div><div class="info-val">${u.phone || '—'}</div></div>
            <div class="info-item"><div class="info-label">Sex</div><div class="info-val">${u.sex || '—'}</div></div>
            <div class="info-item"><div class="info-label">Address</div><div class="info-val">${u.address || '—'}</div></div>
            <div class="info-item"><div class="info-label">Joined</div><div class="info-val">${fmtDate(u.joinedAt || u.createdAt)}</div></div>
            <div class="info-item" style="grid-column:1/-1"><div class="info-label">UID</div><div class="info-val cf-mono" style="font-size:.75rem;word-break:break-all">${u.uid || id}</div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🏍️</span><span class="card-title">Vehicle Info</span></div>
        <div class="card-body">
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Model</div><div class="info-val">${u.vehicle_model || '—'}</div></div>
            <div class="info-item"><div class="info-label">Plate No.</div><div class="info-val">${u.vehicle_plate || '—'}</div></div>
            <div class="info-item"><div class="info-label">Color</div><div class="info-val">${u.vehicle_color || '—'}</div></div>
            <div class="info-item"><div class="info-label">Type</div><div class="info-val">${u.vehicle_type || '—'}</div></div>
            <div class="info-item"><div class="info-label">Bound Device</div><div class="info-val">${(() => { const bd = (u.bound_device || '').toUpperCase(); return bd && bd !== 'NONE' ? u.bound_device : 'Not Connected'; })()}</div></div>
            <div class="info-item"><div class="info-label">Total Crashes</div><div class="info-val c-red">${crashes.length}</div></div>
          </div>
        </div>
      </div>

      ${contactsSection}
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

    // Real schema: status.state = "Online" | "Offline"
    const DEVICE_TIMEOUT = 30000;

    const onlineCount = entries.filter(([, d]) => {
      const lastSeenTs = d.status?.last_seen || 0;

      return (lastSeenTs > 0 && (Date.now() - lastSeenTs) < DEVICE_TIMEOUT);
    }).length;
    document.getElementById('stat-dev-online').textContent = onlineCount;

    const html = entries.map(([id, d]) => {
      // ── Real schema mappings ──────────────────────────────────────────
      const loc = d.telematics?.location || {};          // telematics.location
      const cfg = d.config || {};                // config (wifi/IP)
      const binding = d.binding || {};                // binding.uid / state
      const lastSeenTs = d.status?.last_seen || 0;
      const isOn = lastSeenTs > 0 && (Date.now() - lastSeenTs) < DEVICE_TIMEOUT;
      const stateLabel = isOn ? 'Online' : 'Offline';
      const lastSeen = d.status?.last_seen
        ? new Date(d.status.last_seen).toLocaleString('en-PH')
        : '—';
      const boundUid = binding.uid || '—';
      const boundState = binding.state || '—';

      return `<div class="card" style="margin-bottom:0">
        <div class="device-hero">
          <div class="device-id-label">Device ID</div>
          <div class="device-id">🔌 ${d.device_id || id}</div>
          <div><span class="device-status ${isOn ? 'status-connected' : 'status-offline'}">
            <span style="width:7px;height:7px;background:${isOn ? 'var(--green)' : 'var(--muted)'};border-radius:50%;display:inline-block"></span>
            ${stateLabel}
          </span></div>
          <div style="margin-top:8px;font-size:.78rem;color:var(--muted)">
            Last Seen: <span style="color:var(--text);font-weight:600">${lastSeen}</span>
          </div>
          <div style="margin-top:4px;font-size:.78rem;color:var(--muted)">
            Binding: <span style="color:var(--text);font-weight:600">${boundState}</span>
            ${boundUid !== '—' ? `<span style="font-size:.68rem;color:var(--muted);margin-left:6px">(UID: ${boundUid})</span>` : ''}
          </div>
        </div>

        <div class="card-body">
          <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;font-weight:600">📡 Live Telemetry</div>
          <div class="tel-grid" style="margin-bottom:16px">
            <div class="tel-item"><div class="tel-icon">📍</div><div class="tel-val">${loc.city || '—'}</div><div class="tel-label">City</div></div>
            <div class="tel-item"><div class="tel-icon">⚡</div><div class="tel-val">${loc.speed_kmph ?? '—'} <span style="font-size:.7rem;font-weight:400">km/h</span></div><div class="tel-label">Speed</div></div>
            <div class="tel-item"><div class="tel-icon">🛰️</div><div class="tel-val">${loc.satellite || '—'}</div><div class="tel-label">GPS Sats</div></div>
            <div class="tel-item"><div class="tel-icon">📶</div><div class="tel-val">${loc.wifi_rssi ?? '—'} <span style="font-size:.7rem;font-weight:400">dBm</span></div><div class="tel-label">WiFi RSSI</div></div>
          </div>

          ${loc.latitude ? `
          <div class="info-grid" style="margin-bottom:16px">
            <div class="info-item"><div class="info-label">Latitude</div><div class="info-val cf-mono">${loc.latitude}</div></div>
            <div class="info-item"><div class="info-label">Longitude</div><div class="info-val cf-mono">${loc.longitude}</div></div>
            <div class="info-item"><div class="info-label">Province</div><div class="info-val">${loc.province || '—'}</div></div>
            <div class="info-item"><div class="info-label">Country</div><div class="info-val">${loc.country || '—'}</div></div>
            <div class="info-item"><div class="info-label">WiFi Status</div><div class="info-val">${loc.wifi_status || '—'}</div></div>
            <div class="info-item"><div class="info-label">Last GPS Update</div><div class="info-val">${loc.date || ''} ${loc.time || ''}</div></div>
          </div>
          <div class="card-body np" style="margin:-18px -18px 16px -18px;padding:0">
            <div id="device-map-${id}" style="height:300px;border-radius:10px;overflow:hidden"></div>
          </div>` : ''}

          <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 10px;font-weight:600">📶 WiFi / Network</div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">SSID</div><div class="info-val">${cfg.wifi_ssid || '—'}</div></div>
            <div class="info-item"><div class="info-label">IP Address</div><div class="info-val cf-mono">${cfg.ip || '—'}</div></div>
          </div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('devices-body').innerHTML = html || '<div class="empty">No devices found.</div>';

    // Init device maps — using real schema: telematics.location
    setTimeout(() => {
      entries.forEach(([id, d]) => {
        const loc = d.telematics?.location;
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
  responders: pageResponders,
  dashboard: pageDashboard,
  users: pageUsers,
  'user-detail': pageUserDetail,
  devices: pageDevices,
};
// ─────────────────────────────────────────────────────────────────────────
// Emergency Responders
// ─────────────────────────────────────────────────────────────────────────

async function pageResponders() {

  const wrap = document.getElementById(
    "responders-table-wrap"
  );

  loading('responders-table-wrap');

  try {

    const snap = await _rtdb
      .ref("Ridera/authorized_emergency_responder")
      .once("value");

    const data = snap.val() || {};

    const entries = Object.entries(data);

    document.getElementById(
      "stat-responders"
    ).textContent = entries.length;

    document.getElementById(
      "coverage-area"
    ).textContent =
      entries.length
        ? entries[0][1].address || "—"
        : "—";

    wrap.innerHTML = `

      <table class="responder-table">

        <thead>

          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Address</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>

        </thead>

        <tbody>

        ${entries.map(([id, r]) => `

          <tr class="responder-row">

            <td>

              <div class="responder-name">

                <div class="responder-avatar">
                  🚑
                </div>

                <div>

                  <div style="font-weight:700">
                    ${r.name || "-"}
                  </div>

                  <div style="
                    font-size:.75rem;
                    color:var(--muted);
                  ">
                    ${r.phone || "-"}
                  </div>

                </div>

              </div>

            </td>

            <td>
              +${r.phone || "-"}
            </td>

            <td>
              ${r.address || "-"}
            </td>

           <td>

  <span class="responder-status">
    🟢 Active
  </span>

</td>

<td>

  <button
    class="responder-action btn-edit"
    onclick="editResponder('${id}')">

    ✏ Edit

  </button>

  <button
    class="responder-action btn-delete"
    onclick="deleteResponder('${id}')">

    🗑 Delete

  </button>

</td>

</tr>

        `).join("")}

        </tbody>

      </table>
    `;

  } catch (err) {

    wrap.innerHTML = `
      <div class="error-box">
        ${err}
      </div>
    `;
  }
}
async function deleteResponder(id) {

  const ok = confirm(
    "Delete this responder?"
  );

  if (!ok) return;

  await _rtdb
    .ref("Ridera/authorized_emergency_responder")
    .child(id)
    .remove();

  pageResponders();
}

async function editResponder(id) {

  const snap = await _rtdb
    .ref("Ridera/authorized_emergency_responder")
    .child(id)
    .once("value");

  const r = snap.val();

  if (!r) return;

  document.getElementById(
    "responder-name"
  ).value = r.name || "";

  document.getElementById(
    "responder-phone"
  ).value = r.phone || "";

  document.getElementById(
    "responder-address"
  ).value = r.address || "";

  document.getElementById(
    "responder-lat"
  ).value = r.latitude || "";

  document.getElementById(
    "responder-lng"
  ).value = r.longitude || "";

  window.currentResponderId = id;

  openResponderModal();
}
function openResponderModal() {

  const modal =
    document.getElementById("responder-modal");

  if (modal) {
    modal.classList.remove("hidden");
  }
}

function closeResponderModal() {

  const modal =
    document.getElementById("responder-modal");

  if (modal) {
    modal.classList.add("hidden");
  }

  window.currentResponderId = null;
}

async function saveResponder() {
  const name = document.getElementById('responder-name')?.value.trim() || '';
  const phone = document.getElementById('responder-phone')?.value.trim() || '';
  const address = document.getElementById('responder-address')?.value.trim() || '';
  const lat = document.getElementById('responder-lat')?.value.trim() || '';
  const lng = document.getElementById('responder-lng')?.value.trim() || '';

  if (!name || !phone) {
    alert('⚠️ Name and Phone are required.');
    return;
  }

  const snap = await _rtdb
    .ref("Ridera/authorized_emergency_responder")
    .once("value");

  const count = snap.numChildren();

  const payload = {
    responder_id: `AER-${String(count + 1).padStart(3, "0")}`,
    name,
    phone,
    address
  };
  if (lat) payload.latitude = parseFloat(lat);
  if (lng) payload.longitude = parseFloat(lng);

  try {
    const id = window.currentResponderId || null;
    if (id) {
      // Edit existing
      await _rtdb.ref('Ridera/authorized_emergency_responder').child(id).update(payload);
    } else {
      // Add new
      await _rtdb.ref('Ridera/authorized_emergency_responder').push(payload);
    }

    // Clear form fields & editing state
    ['responder-name', 'responder-phone', 'responder-address', 'responder-lat', 'responder-lng']
      .forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; });
    window.currentResponderId = null;

    closeResponderModal();
    pageResponders(); // Refresh table
  } catch (err) {
    alert('❌ Failed to save responder: ' + err.message);
  }
}

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
      listenForAlerts();  // start real-time alert listener — once
      listenForCrashes(); // start real-time crash listener — once
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
