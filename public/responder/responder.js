// Firebase RTDB
const _rtdb = firebase.database();

// --------------------------------------------------
// MAPS (Google Maps)
// --------------------------------------------------
const maps = {};
const mapMarkers = {};

function getOrCreateMap(id, lat = 14.0727, lng = 120.6235, zoom = 13) {
    if (maps[id]) return maps[id];
    const el = document.getElementById(id);
    if (!el) return null;
    const m = new google.maps.Map(el, {
        center: { lat: +lat, lng: +lng },
        zoom,
        mapTypeId: 'roadmap',
        styles: [],
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

// --------------------------------------------------
// CRASH SNACKBAR
// --------------------------------------------------
let _snackbarTimer = null;

function showCrashSnackbar(msg, severity = 'low', duration = 8000) {
    const bar = document.getElementById('crash-snackbar');
    const msgEl = document.getElementById('snackbar-msg');
    const prog = document.getElementById('snackbar-progress');
    const timeEl = document.getElementById('snackbar-time');
    if (!bar || !msgEl || !prog) return;

    if (_snackbarTimer) { clearTimeout(_snackbarTimer); _snackbarTimer = null; }

    msgEl.textContent = msg;
    bar.classList.remove('snackbar-high');
    if (severity === 'high') bar.classList.add('snackbar-high');

    if (timeEl) {
        timeEl.textContent = '⏱ ' + new Date().toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    document.getElementById('nav-crash-badge')?.classList.add('badge-visible');

    prog.classList.remove('snackbar-draining');
    prog.style.transitionDuration = '';
    prog.style.transform = 'scaleX(1)';

    bar.classList.add('snackbar-show');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            prog.style.transitionDuration = duration + 'ms';
            prog.classList.add('snackbar-draining');
        });
    });

    _snackbarTimer = setTimeout(() => dismissSnackbar(), duration);
}

function dismissSnackbar() {
    const bar = document.getElementById('crash-snackbar');
    if (!bar) return;
    bar.classList.remove('snackbar-show');
    if (_snackbarTimer) { clearTimeout(_snackbarTimer); _snackbarTimer = null; }
    document.getElementById('nav-crash-badge')?.classList.remove('badge-visible');
}

// Audio unlock — browsers require user gesture before audio plays
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

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", responderLogin);
    }

    // Password toggle
    const pwToggle = document.getElementById("login-pw-toggle");
    if (pwToggle) {
        pwToggle.addEventListener("click", () => {
            const pw = document.getElementById("login-password");
            if (pw.type === "password") {
                pw.type = "text";
                pwToggle.textContent = "🙈";
            } else {
                pw.type = "password";
                pwToggle.textContent = "👁️";
            }
        });
    }

    // Snackbar dismiss
    document.getElementById('snackbar-close')?.addEventListener('click', dismissSnackbar);

    // Existing session — skip login
    const responder = JSON.parse(
        localStorage.getItem("ridera_responder")
    );

    if (responder) {
        showDashboard();

    }
});

let responderMap;

function initMap() {

    console.log("INIT MAP CALLED");

    const mapEl =
        document.getElementById(
            "crash-map"
        );

    console.log("MAP ELEMENT:", mapEl);

    if (!mapEl) return;

    console.log("GOOGLE:", google);

    responderMap =
        new google.maps.Map(
            mapEl,
            {
                center: {
                    lat: 14.2990,
                    lng: 120.9580
                },
                zoom: 12
            }
        );

    console.log("MAP CREATED");

}
async function responderLogin(e) {

    e.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const errorEl = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");

    // Show loading state
    if (submitBtn) submitBtn.classList.add("login-loading");
    errorEl.classList.add("hidden");

    try {

        const snap = await _rtdb
            .ref("Ridera/authorized_emergency_responder")
            .once("value");

        let matchedResponder = null;

        snap.forEach(child => {
            const responder = child.val();
            if (
                responder.username === username &&
                responder.password === password
            ) {
                matchedResponder = {
                    firebase_key: child.key,
                    ...responder
                };
            }
        });

        if (!matchedResponder) {
            errorEl.textContent = "❌ Invalid username or password";
            errorEl.classList.remove("hidden");
            if (submitBtn) submitBtn.classList.remove("login-loading");
            return;
        }

        localStorage.setItem(
            "ridera_responder",
            JSON.stringify(matchedResponder)
        );

        showDashboard();

    } catch (err) {
        console.error(err);
        errorEl.textContent = "⚠️ " + err.message;
        errorEl.classList.remove("hidden");
        if (submitBtn) submitBtn.classList.remove("login-loading");
    }
}

// --------------------------------------------------
// SHOW DASHBOARD
// --------------------------------------------------

function showDashboard() {

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    document.getElementById("app-shell").setAttribute("aria-hidden", "false");

    // Update nav timestamp
    const tsEl = document.getElementById('nav-ts');
    if (tsEl) {
        tsEl.textContent = new Date().toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit'
        });
    }

    // Start real-time listeners
    initMap();
    listenForAlerts();
    loadCrashEntries();
}

// --------------------------------------------------
// ALERTS — Firebase real-time listener
// Flow: alert_sent → alert_received → on_the_way → arrived → resolved
// --------------------------------------------------

const _receivedAlerts = new Set();
let _alertListenerActive = false;

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

/** AUTO SET alert_received when alert_sent is seen */
function markAsReceived(alertId) {
    _rtdb.ref('alerts/' + alertId).update({
        responder_status: 'alert_received',
        alert_received_at: Date.now(),
    });
}

/** Update responder status: on_the_way / arrived / resolved */
function updateAlertStatus(alertId, status) {
    const updates = { responder_status: status };
    const tsMap = {
        on_the_way: 'on_the_way_at',
        arrived: 'arrived_at',
        resolved: 'resolved_at'
    };
    if (tsMap[status]) updates[tsMap[status]] = Date.now();

    _rtdb.ref('alerts/' + alertId).update(updates).then(() => {
        // Show success toast
        const label = status === 'on_the_way' ? '🚗 On The Way'
            : status === 'arrived' ? '📍 Arrived'
                : '✅ Resolved';
        showToast(`${label} — status updated`);
    }).catch(err => {
        showToast('❌ Error: ' + err.message);
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 20px #0006;font-size:.9rem;pointer-events:none';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/** Build one alert card with status buttons */
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
 * Listen for alerts — registered only once (_alertListenerActive guard).
 * Shows cards for alert_sent+ and auto-sets alert_received.
 */
function listenForAlerts() {
    if (_alertListenerActive) return;
    _alertListenerActive = true;

    const alertsRef = _rtdb.ref('alerts');
    alertsRef.on('value', (snapshot) => {
        const alerts = snapshot.val();
        const el = document.getElementById('alert-list');
        if (!el) return;

        if (!alerts) {
            el.innerHTML = '<div class="empty">No active alerts.</div>';
            updateAlertStats(0, 0, 0);
            return;
        }

        const cards = [];
        let activeCount = 0;
        let pendingCount = 0;
        let resolvedCount = 0;
        const mapPts = [];

        Object.keys(alerts).forEach((key) => {
            const alert = alerts[key];

            // Count stats
            if (alert.responder_status === 'resolved') {
                resolvedCount++;
            } else if (
                alert.responder_status === 'alert_sent' ||
                alert.responder_status === 'alert_received'
            ) {
                pendingCount++;
            }

            // SHOW if alert_sent or later (alert_triggered stays hidden)
            if (
                alert.responder_status === 'alert_sent' ||
                alert.responder_status === 'alert_received' ||
                alert.responder_status === 'on_the_way' ||
                alert.responder_status === 'arrived'
            ) {
                activeCount++;

                // AUTO SET alert_received — once per alert
                if (alert.responder_status === 'alert_sent' && !_receivedAlerts.has(key)) {
                    _receivedAlerts.add(key);
                    markAsReceived(key);
                    playCrashAlertSound();
                    showCrashSnackbar(
                        `🚨 New crash alert received! ${alert.rider_name || 'Unknown rider'}`,
                        'high', 8000
                    );
                }

                // Collect map points
                if (alert.latitude && alert.longitude) {
                    mapPts.push({
                        lat: alert.latitude,
                        lng: alert.longitude,
                        name: alert.rider_name || key,
                        severity: 'high'
                    });
                }

                cards.push(buildAlertCard(alert, key));
            }
        });

        el.innerHTML = cards.length
            ? cards.join('')
            : '<div class="empty">No active alerts.</div>';

        updateAlertStats(activeCount, pendingCount, resolvedCount);

        // Update crash map
        setTimeout(() => {
            if (mapPts.length > 0) {
                const m = getOrCreateMap('crash-map');
                clearMap('crash-map');
                const pts = [];
                mapPts.forEach(p => {
                    addMarker('crash-map', p.lat, p.lng,
                        `🚨 ${p.name}<br>📍 ${p.lat}, ${p.lng}`, p.severity);
                    pts.push([p.lat, p.lng]);
                });
                fitMapBounds('crash-map', pts);
                if (m) google.maps.event.trigger(m, 'resize');
            }
        }, 300);
    });
}

function updateAlertStats(active, pending, resolved) {
    const statCrashes = document.getElementById('stat-crashes');
    const statUsers = document.getElementById('stat-users');
    const statDevices = document.getElementById('stat-devices');

    if (statCrashes) statCrashes.textContent = active;
    if (statUsers) statUsers.textContent = pending;
    if (statDevices) statDevices.textContent = resolved;

    // Update nav timestamp
    const tsEl = document.getElementById('nav-ts');
    if (tsEl) {
        tsEl.textContent = new Date().toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit'
        });
    }
}

// --------------------------------------------------
// CRASH ENTRIES — from Ridera/users crash_history
// --------------------------------------------------

function isAllowedCrashType(type) {
    if (!type) return false;
    const t = type.toLowerCase().replace(/[\s()_-]/g, '');
    return t.includes('ridingcrash');
}

async function loadCrashEntries() {
    const crashList = document.getElementById("crash-list");
    if (!crashList) return;

    crashList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading crash entries…</div>';

    try {
        const snap = await _rtdb.ref('/Ridera/users').once('value');
        const users = snap.val() || {};
        const crashes = [];

        for (const [uid, user] of Object.entries(users)) {
            if (!user || typeof user !== 'object') continue;
            const history = user.crash_history || {};

            for (const [cid, crash] of Object.entries(history)) {
                if (!crash || typeof crash !== 'object') continue;
                if (isAllowedCrashType(crash.type)) {
                    crashes.push({
                        path: `/Ridera/users/${uid}/crash_history/${cid}`,
                        key: cid,
                        uid,
                        userName: user.name || 'Unknown',
                        data: crash
                    });
                }
            }
        }

        // Sort newest first
        // Sort newest first
        crashes.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));

        const activeCrashes = [];
        const historyCrashes = [];

        crashes.forEach(cr => {

            const status =
                cr.data.responder_status || "pending";

            if (status === "resolved") {

                historyCrashes.push(cr);

            } else {

                activeCrashes.push(cr);

            }

        });

        // CLEAR OLD MARKERS
        if (window.crashMarkers) {
            window.crashMarkers.forEach(m => m.setMap(null));
        }

        window.crashMarkers = [];

        const bounds = new google.maps.LatLngBounds();

        activeCrashes.forEach(c => {

            const d = c.data;

            if (!d.latitude || !d.longitude) return;

            const marker = new google.maps.Marker({
                position: {
                    lat: Number(d.latitude),
                    lng: Number(d.longitude)
                },
                map: responderMap,
                title: c.userName
            });

            const info = new google.maps.InfoWindow({
                content: `
            <div style="color:#111">
                <b>${c.userName}</b><br>
                ${d.type || "Crash"}<br>
                ${d.latitude}, ${d.longitude}
            </div>
        `
            });

            marker.addListener("click", () => {
                info.open({
                    map: responderMap,
                    anchor: marker
                });
            });

            window.crashMarkers.push(marker);

            bounds.extend({
                lat: Number(d.latitude),
                lng: Number(d.longitude)
            });

        });

        if (window.crashMarkers.length) {
            responderMap.fitBounds(bounds);
        }
        if (crashes.length === 0) {
            if (window.crashMarkers) {
                window.crashMarkers.forEach(
                    m => m.setMap(null)
                );
            }

            crashList.innerHTML =
                '<div class="empty">No crash entries found.</div>';

            return;
        }

        crashList.innerHTML = activeCrashes.map((c, idx) => {
            const d = c.data;
            const sev = (d.severity || 'low').toLowerCase();
            const bc = sev === 'high' ? 'badge-high' : sev === 'medium' ? 'badge-med' : 'badge-low';
            const rs = d.responder_status || 'pending';
            const rsLabel = rs === 'on_the_way' ? '🚗 On The Way'
                : rs === 'arrived' ? '📍 Arrived'
                    : rs === 'resolved' ? '✅ Resolved'
                        : rs === 'alert_received' ? '🔔 Received'
                            : rs === 'alert_sent' ? '📤 Sent'
                                : '⏳ Pending';
            const rsClass = rs === 'resolved' ? 'rs-tag-resolved'
                : rs === 'arrived' ? 'rs-tag-arrived'
                    : rs === 'on_the_way' ? 'rs-tag-onway'
                        : 'rs-tag-pending';

            return `<div class="crash-item">
                <div class="crash-top" onclick="toggleCrashDetail(${idx})" class="crash-toggle" style="cursor:pointer">
                    <span class="badge ${bc}">${sev}</span>
                    <span class="responder-tag ${rsClass}">${rsLabel}</span>
                    <span style="font-size:.78rem;font-weight:600">${c.userName}</span>
                    <span class="crash-path">${c.key}</span>
                    <span class="crash-chevron" id="chev-${idx}">▼</span>
                </div>
                <div class="crash-detail-body" id="detail-${idx}">
                    <div class="crash-detail-inner">
                        <div class="crash-all-fields">
                            <div class="caf-row"><span class="caf-key">👤 Rider</span><span class="caf-val">${c.userName}</span></div>
                            ${d.date ? `<div class="caf-row"><span class="caf-key">📅 Date</span><span class="caf-val">${d.date}</span></div>` : ''}
                            ${d.time ? `<div class="caf-row"><span class="caf-key">🕐 Time</span><span class="caf-val">${d.time}</span></div>` : ''}
                            ${d.speed !== undefined ? `<div class="caf-row"><span class="caf-key">⚡ Speed</span><span class="caf-val">${d.speed} km/h</span></div>` : ''}
                            ${d.latitude ? `<div class="caf-row"><span class="caf-key">📍 GPS</span><span class="caf-val caf-mono">${d.latitude}, ${d.longitude}</span></div>` : ''}
                            ${d.type ? `<div class="caf-row" style="grid-column:1/-1"><span class="caf-key">💥 Type</span><span class="caf-val" style="color:var(--accent)">${d.type.replace(/_/g, ' ').toUpperCase()}</span></div>` : ''}
                        </div>
                        <div class="responder-ctrl" style="margin-top:14px">
                            <div class="responder-ctrl-header">
                                <span>🚑</span>
                                <span class="responder-ctrl-title">Responder Action</span>
                                <span class="responder-tag ${rsClass}" style="margin-left:auto">${rsLabel}</span>
                            </div>
                            <div class="responder-btns">
                                <button class="responder-btn rb-onway ${rs === 'on_the_way' ? 'rb-active' : ''}"
                                    onclick="updateCrashStatus('${c.path}','on_the_way', this)">🚗 ON THE WAY</button>
                                <button class="responder-btn rb-arrive ${rs === 'arrived' ? 'rb-active' : ''}"
                                    onclick="updateCrashStatus('${c.path}','arrived', this)">📍 ARRIVED</button>
                                <button class="responder-btn rb-resolve ${rs === 'resolved' ? 'rb-active' : ''}"
                                    onclick="updateCrashStatus('${c.path}','resolved', this)">✅ RESOLVED</button>
                            </div>
                        </div>
                        ${d.latitude ? `<button class="fly-btn" style="margin-top:10px" onclick="flyTo('crash-map',${d.latitude},${d.longitude})">🗺️ View on Map</button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
        const historyList =
            document.getElementById(
                "history-list"
            );

        if (historyList) {

            historyList.innerHTML =
                historyCrashes.map(c => `
            <div class="crash-item">
                <div class="crash-top">
                    <span class="badge badge-low">
                        RESOLVED
                    </span>

                    <span style="font-weight:600">
                        ${c.userName}
                    </span>

                    <span class="crash-path">
                        ${c.key}
                    </span>
                </div>
            </div>
        `).join('');

        }

        const statCrashes = document.getElementById("stat-crashes");
        if (statCrashes) statCrashes.textContent = activeCrashes.length;

    } catch (err) {
        console.error('loadCrashEntries error:', err);
        crashList.innerHTML = `<div class="error-box">❌ ${err.message}</div>`;
    }
}

/** Toggle expandable crash detail */
function toggleCrashDetail(idx) {
    const body = document.getElementById('detail-' + idx);
    const chev = document.getElementById('chev-' + idx);
    if (!body) return;
    body.classList.toggle('crash-detail-open');
    if (chev) chev.textContent = body.classList.contains('crash-detail-open') ? '▲' : '▼';
}

/** Update responder_status on a crash_history entry (via server API) */
async function updateCrashStatus(fbPath, status, btnEl) {
    try {
        const token = localStorage.getItem('ridera_admin_token') || 'ridera-admin-token';

        const r = await fetch('/api/responder-status', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ path: fbPath, status })
        });

        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            showToast('❌ Failed: ' + (err.error || `HTTP ${r.status}`));
            return;
        }

        const label = status === 'on_the_way' ? '🚗 On The Way'
            : status === 'arrived' ? '📍 Arrived'
                : '✅ Resolved';
        showToast(`${label} — status updated`);

        // Highlight active button
        if (btnEl) {
            const parent = btnEl.closest('.responder-btns');
            if (parent) {
                parent.querySelectorAll('.responder-btn').forEach(b => b.classList.remove('rb-active'));
            }
            btnEl.classList.add('rb-active');
        }

        // Reload entries to refresh badges
        setTimeout(() => loadCrashEntries(), 500);

    } catch (ex) {
        showToast('❌ Network error: ' + ex.message);
    }
}

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

function signOut() {
    localStorage.removeItem("ridera_responder");
    location.reload();
}