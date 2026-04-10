// ============================================================
// monitoring.js — Live Monitoring Page
// Page: dashboard-proctor.html
// APIs:
//   GET  /api/monitoring/active-sessions   (via API.getLiveSessions)
//   GET  /api/violations?status=pending    (via API.getSessionAlerts)
//   POST /api/monitoring/flag-student      (via API.flagStudent)
//   POST /api/monitoring/send-alert        (via API.sendAlert)
// Auto-refresh: every 5 seconds via setInterval
// ============================================================

let _autoRefreshInterval = null;
let _alertsInterval      = null;
let _detectionInterval   = null;   // ← AI detection simulation loop
let _allSessions         = [];
let _currentFilter       = 'all';
let _sortByRisk          = false;

// ── AI Violation Detection Config ────────────────────────────
// All types that can be triggered, with weight + display label.
// Face types are higher weight so they appear more often.
const DETECTION_CONFIG = [
    { type: 'face_not_detected',   label: 'Face Not Detected',          weight: 20, riskPts: 30, alertLevel: 'high'    },
    { type: 'multiple_faces',      label: 'Multiple Faces Detected',     weight: 20, riskPts: 30, alertLevel: 'high'    },
    { type: 'face_out_of_frame',   label: 'Face Out of Frame',           weight: 15, riskPts: 25, alertLevel: 'high'    },
    { type: 'eye_gaze_deviation',  label: 'Eye Gaze Deviation',          weight: 10, riskPts: 15, alertLevel: 'warning' },
    { type: 'unusual_sound',       label: 'Unusual Sound Detected',      weight: 15, riskPts: 20, alertLevel: 'warning' },
    { type: 'unauthorized_device', label: 'Unauthorized Device Detected',weight: 10, riskPts: 25, alertLevel: 'high'    },
    { type: 'tab_switching',       label: 'Tab Switching Detected',      weight: 5,  riskPts: 20, alertLevel: 'warning' },
    { type: 'copy_paste_detected', label: 'Copy-Paste Activity',         weight: 5,  riskPts: 15, alertLevel: 'warning' },
];

// Build a weighted pool for random selection
const _detectionPool = DETECTION_CONFIG.flatMap(cfg =>
    Array(cfg.weight).fill(cfg)
);

// Track per-session risk (overlays real data when backend is offline)
const _sessionRiskOverlay = {};


// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadLiveSessions();
    loadSessionAlerts();
    startAutoRefresh();
    wireSearchAndFilters();
    // Start AI detection simulation after a short delay so sessions load first
    setTimeout(startDetectionSimulation, 3000);
});

// ============================================================
// DATA LOADING
// ============================================================

async function loadLiveSessions(filter = _currentFilter) {
    _currentFilter = filter;
    try {
        const response = await API.getLiveSessions();
        const raw      = response.data || [];

        // Flatten student_status array (backend joins as array)
        _allSessions = raw.map(session => {
            const status = Array.isArray(session.student_status) && session.student_status.length > 0
                ? session.student_status[0] : {};
            return { ...session, ...status };
        });

        updateStatsBar(_allSessions);
        applyFilterAndRender();
    } catch (err) {
        console.warn('[Monitoring] Backend unavailable, showing demo data:', err.message);
        renderDemoCards();
    }
}

/**
 * loadSessionAlerts()
 * Polls GET /api/violations (pending) and pushes new ones into the alert sidebar.
 * Runs every 5s alongside the session refresh.
 */
async function loadSessionAlerts() {
    try {
        const response = await API.getSessionAlerts();
        const alerts   = response.data || [];

        // Only add genuinely new alerts (compare by id)
        alerts.forEach(v => {
            if (!_knownAlertIds.has(v.id)) {
                _knownAlertIds.add(v.id);
                const name  = v.users?.name || 'Unknown';
                const stype = v.type        || 'Violation';
                const conf  = v.confidence  != null ? ` (${v.confidence}% confidence)` : '';
                const level = (v.confidence || 0) >= 80 ? 'high' : (v.confidence || 0) >= 50 ? 'warning' : 'info';
                addAlertEntry(
                    level === 'high' ? 'HIGH RISK ALERT' : level === 'warning' ? 'SUSPICIOUS BEHAVIOR' : 'ALERT',
                    `${name}: ${stype}${conf}`,
                    level
                );
            }
        });
    } catch (_) {
        // Non-critical — sidebar just won't update from backend
    }
}

// Track which alert IDs have already been shown in the sidebar
const _knownAlertIds = new Set();

// ============================================================
// STATS BAR
// ============================================================

function updateStatsBar(sessions) {
    const active  = sessions.filter(s => s.status === 'active').length;
    const flagged = sessions.filter(s => s.status === 'flagged' || (s.risk_score || 0) >= 70).length;
    const offline = sessions.filter(s => s.status === 'offline').length;

    safeText('stat-active',  active);
    safeText('stat-flagged', flagged);
    safeText('stat-offline', offline);

    // Session health bar
    const total     = sessions.length || 1;
    const healthPct = Math.round((active / total) * 100);
    const bar       = document.getElementById('session-health-bar');
    const label     = document.getElementById('session-health-label');

    if (bar) bar.style.width = healthPct + '%';
    if (label) {
        if (healthPct >= 80)      { label.textContent = 'Stable';   label.className = 'text-xs text-emerald-500 font-bold'; if(bar) bar.className = 'h-full bg-emerald-500'; }
        else if (healthPct >= 50) { label.textContent = 'Warning';  label.className = 'text-xs text-amber-400 font-bold';  if(bar) bar.className = 'h-full bg-amber-400'; }
        else                      { label.textContent = 'Critical'; label.className = 'text-xs text-red-500 font-bold';    if(bar) bar.className = 'h-full bg-red-500'; }
    }
}

// ============================================================
// FILTER / SORT / SEARCH
// ============================================================

function applyFilterAndRender() {
    let display = [..._allSessions];

    // Filter
    if (_currentFilter === 'flagged') {
        display = display.filter(s => s.status === 'flagged' || (s.risk_score || 0) >= 70);
    } else if (_currentFilter === 'lowConnectivity') {
        display = display.filter(s => s.status === 'offline' || (s.latency_ms || 0) > 200);
    }

    // Search
    const searchEl  = document.querySelector('input[placeholder="Search student ID..."]');
    const searchVal = searchEl?.value?.toLowerCase().trim() || '';
    if (searchVal) {
        display = display.filter(s =>
            (s.users?.name       || '').toLowerCase().includes(searchVal) ||
            (s.users?.student_id || '').toLowerCase().includes(searchVal)
        );
    }

    // Sort by risk score descending
    if (_sortByRisk) {
        display.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    }

    renderGrid(display);
}

function filterStudents(type) {
    _currentFilter = type;
    document.querySelectorAll('[data-filter-btn]').forEach(btn => {
        btn.className = 'px-3 py-1.5 rounded hover:bg-primary/10 text-slate-400 text-xs font-semibold';
    });
    const active = document.querySelector(`[data-filter-btn="${type}"]`);
    if (active) active.className = 'px-3 py-1.5 rounded bg-primary/20 text-primary text-xs font-semibold border border-primary/30';
    applyFilterAndRender();
}

function toggleSortByRisk() {
    _sortByRisk = !_sortByRisk;
    applyFilterAndRender();
    const btn = document.getElementById('sort-risk-btn');
    if (btn) btn.classList.toggle('text-primary', _sortByRisk);
}

function wireSearchAndFilters() {
    const searchInput = document.querySelector('input[placeholder="Search student ID..."]');
    if (searchInput) searchInput.addEventListener('input', applyFilterAndRender);
}

// ============================================================
// CARD RENDERING
// ============================================================

function renderGrid(sessions) {
    const grid = document.getElementById('student-grid');
    if (!grid) return;

    if (sessions.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-16">
            <span class="material-icons-round text-4xl block mb-2 opacity-40">person_search</span>
            No sessions match the current filter.</div>`;
        return;
    }

    grid.innerHTML = '';
    sessions.forEach(session => renderCard(grid, session));
}

function getRiskLevel(session) {
    const score = session.risk_score || 0;
    if (session.status === 'offline')                            return 'offline';
    if (session.status === 'flagged' || score >= 70)             return 'high';
    if (score >= 40)                                             return 'medium';
    return 'normal';
}

function renderCard(grid, session) {
    const risk      = getRiskLevel(session);
    const name      = session.users?.name       || 'Unknown Student';
    const studentId = session.users?.student_id || 'N/A';
    const initials  = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const fps       = session.fps        || 0;
    const latency   = session.latency_ms || 0;
    const riskScore = session.risk_score || 0;
    const sid       = session.id         || session.student_id || 'unknown';

    // ── Card visual variants
    let cardBorder, badgeClass, badgeText, dotClass;
    switch (risk) {
        case 'high':
            cardBorder = 'border-2 border-red-500/50 shadow-lg shadow-red-900/20';
            badgeClass = 'bg-red-600 text-white';
            badgeText  = 'HIGH RISK';
            dotClass   = 'bg-white animate-pulse';
            break;
        case 'medium':
            cardBorder = 'border-2 border-amber-500/40 shadow-md shadow-amber-900/10';
            badgeClass = 'bg-amber-600 text-white';
            badgeText  = 'MED RISK';
            dotClass   = 'bg-white animate-pulse';
            break;
        case 'offline':
            cardBorder = 'border border-slate-800 opacity-60';
            badgeClass = 'bg-slate-700 text-white';
            badgeText  = 'DISCONNECTED';
            dotClass   = 'bg-slate-400';
            break;
        default:
            cardBorder = 'border border-primary/10 hover:border-primary/40 transition-all';
            badgeClass = 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30';
            badgeText  = 'ACTIVE';
            dotClass   = 'bg-emerald-400';
    }

    const meterColor = risk === 'high' ? 'bg-red-500'
        : risk === 'medium'  ? 'bg-amber-500'
        : risk === 'offline' ? 'bg-slate-600' : 'bg-emerald-500';

    // ── Alert message
    let alertHtml = '';
    if (risk === 'high') {
        const msg = escHtml(session.alert_message || 'Suspicious Activity Detected');
        alertHtml = `<div class="bg-red-500/10 border border-red-500/20 p-2 rounded text-[11px] text-red-400 flex items-start gap-2">
            <span class="material-icons-round text-sm">warning</span>${msg}</div>`;
    } else if (risk === 'medium') {
        const msg = escHtml(session.alert_message || 'Potential issue detected');
        alertHtml = `<div class="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-[11px] text-amber-400 flex items-start gap-2">
            <span class="material-icons-round text-sm">visibility_off</span>${msg}</div>`;
    } else if (risk === 'offline') {
        alertHtml = `<div class="bg-slate-800/50 border border-slate-700 p-2 rounded text-[11px] text-slate-500 flex items-center gap-2">
            <span class="material-icons-round text-sm">wifi_off</span>Last seen ${session.last_seen || 'recently'}</div>`;
    } else {
        alertHtml = `<div class="bg-primary/5 border border-primary/10 p-2 rounded text-[11px] text-slate-400 flex items-start gap-2 italic">
            <span class="material-icons-round text-sm">check_circle</span>No suspicious activity</div>`;
    }

    // ── Action buttons
    //   Flag  →  POST /api/monitoring/flag-student
    //   Dismiss → POST /api/monitoring/send-alert (type: dismiss)
    let buttonsHtml = '';
    const safeName = encodeURIComponent(name);

    if (risk === 'high') {
        buttonsHtml = `
            <button onclick="handleDismiss('${sid}')"
                class="flex-1 bg-primary py-2 rounded-lg text-xs font-bold text-white hover:bg-primary/80 transition-all">DISMISS</button>
            <button onclick="handleFlag('${sid}','${safeName}')"
                class="flex-1 bg-red-600 py-2 rounded-lg text-xs font-bold text-white hover:bg-red-700 transition-all">FLAG SESSION</button>`;
    } else if (risk === 'medium') {
        buttonsHtml = `
            <button onclick="handleDismiss('${sid}')"
                class="flex-1 bg-primary py-2 rounded-lg text-xs font-bold text-white transition-all">DISMISS</button>
            <button onclick="handleFlag('${sid}','${safeName}')"
                class="flex-1 bg-red-600/20 py-2 rounded-lg text-xs font-bold text-red-500 hover:bg-red-600/30 transition-all">FLAG</button>`;
    } else if (risk === 'offline') {
        buttonsHtml = `<button onclick="handleReconnect('${sid}')"
            class="w-full bg-slate-800 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-700 transition-all">RECONNECT</button>`;
    } else {
        buttonsHtml = `
            <button onclick="viewLive('${sid}','${safeName}')"
                class="flex-1 bg-slate-800 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 transition-all">VIEW LIVE</button>
            <button onclick="sendChat('${sid}','${safeName}')"
                class="flex-1 bg-primary/20 py-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/30 transition-all">SEND CHAT</button>`;
    }

    // ── Webcam placeholder
    const videoHtml = risk === 'offline'
        ? `<div class="relative aspect-video bg-slate-900 flex items-center justify-center">
               <span class="material-icons-round text-4xl text-slate-700">videocam_off</span>
           </div>`
        : `<div class="relative aspect-video bg-black overflow-hidden">
               <div class="w-full h-full bg-slate-800 flex items-center justify-center">
                   <span class="text-slate-400 text-3xl font-bold">${initials}</span>
               </div>
               ${fps > 0 ? `<div class="absolute bottom-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] text-white border border-white/10">${fps} FPS · ${latency}ms</div>` : ''}
           </div>`;

    const card = document.createElement('div');
    card.className   = `relative bg-background-dark rounded-xl ${cardBorder} overflow-hidden flex flex-col group`;
    card.dataset.sessionId = sid;
    card.dataset.risk      = riskScore;

    card.innerHTML = `
        <div class="absolute top-2 left-2 z-10">
            <span class="flex items-center gap-1 ${badgeClass} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                <span class="w-1.5 h-1.5 ${dotClass} rounded-full"></span>${badgeText}
            </span>
        </div>
        ${videoHtml}
        <div class="p-4 space-y-3">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-white font-semibold text-sm leading-tight">${escHtml(name)}</h3>
                    <p class="text-slate-500 text-xs">ID: ${escHtml(studentId)}</p>
                </div>
                <div class="text-right">
                    <div class="text-[10px] text-slate-500 uppercase font-bold">Risk</div>
                    <div class="w-16 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                        <div class="h-full ${meterColor} transition-all duration-500" style="width:${Math.min(riskScore, 100)}%"></div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${riskScore}%</div>
                </div>
            </div>
            ${alertHtml}
            <div class="flex gap-2">${buttonsHtml}</div>
        </div>`;

    grid.appendChild(card);
}

// ============================================================
// ACTION HANDLERS — call the backend
// ============================================================

/**
 * handleFlag(sessionId, encodedName)
 * Calls POST /api/monitoring/flag-student
 */
async function handleFlag(sessionId, encodedName) {
    const name   = decodeURIComponent(encodedName);
    const reason = prompt(`Flag reason for ${name}:`, 'Suspicious Activity - Manual Flag');
    if (!reason) return;

    try {
        await API.performViolationAction(sessionId, 'flag', reason);
        addAlertEntry('SESSION FLAGGED', `${name} has been manually flagged: ${reason}`, 'high');
        API.toast(`${name} flagged successfully`, 'warning');
        await loadLiveSessions();
    } catch (err) {
        API.toast('Flag failed: ' + err.message, 'error');
        // Optimistic UI — still show alert entry in demo mode
        addAlertEntry('SESSION FLAGGED', `${name}: ${reason}`, 'high');
    }
}

/**
 * handleDismiss(sessionId)
 * Calls POST /api/monitoring/send-alert with type: 'dismiss'
 */
async function handleDismiss(sessionId) {
    try {
        await API.performViolationAction(sessionId, 'dismiss');
        addAlertEntry('DISMISSED', `Alert dismissed for session ${sessionId.slice(0,8)}`, 'info');
        API.toast('Alert dismissed', 'success');
        await loadLiveSessions();
    } catch (err) {
        // Non-critical in demo mode
        addAlertEntry('DISMISSED', `Alert dismissed for session ${sessionId.slice(0,8)}`, 'info');
    }
}

/**
 * handleReconnect(sessionId)
 * Calls POST /api/monitoring/send-alert with type: 'reconnect'
 */
async function handleReconnect(sessionId) {
    try {
        await API.sendAlert(sessionId, 'Reconnect requested by proctor', 'reconnect');
    } catch (_) { /* Demo fallback */ }
    addAlertEntry('RECONNECT ATTEMPT', 'Reconnect signal sent to offline student.', 'info');
    API.toast('Reconnect signal sent', 'info');
}

// Legacy aliases (used by older HTML onclick attributes)
function flagSession(sid, name)        { handleFlag(sid, name); }
function dismissAlert(sid)             { handleDismiss(sid); }
function dismissStudentAlert(sid)      { handleDismiss(sid); }
function reconnectStudent(sid)         { handleReconnect(sid); }

function viewLive(sessionId, encodedName) {
    const name = decodeURIComponent(encodedName);
    const toast = document.createElement('div');
    toast.className = 'fixed top-6 right-6 bg-primary text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-[100] flex items-center gap-2';
    toast.innerHTML = `<span class="material-icons-round text-sm">live_tv</span>Opening live feed for <strong>${escHtml(name)}</strong>…`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function sendChat(sessionId, encodedName) {
    const name = decodeURIComponent(encodedName);
    const msg  = prompt(`Send message to ${name}:`);
    if (!msg) return;
    try {
        await API.sendAlert(sessionId, msg, 'chat');
    } catch (_) { /* demo */ }
    const toast = document.createElement('div');
    toast.className = 'fixed top-6 right-6 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-[100] flex items-center gap-2';
    toast.innerHTML = `<span class="material-icons-round text-sm">chat</span>Message sent to <strong>${escHtml(name)}</strong>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function broadcastAlert() {
    const msg = prompt('Enter broadcast message to all students:');
    if (!msg) return;
    try {
        await Promise.all(_allSessions.map(s => API.sendAlert(s.id || s.student_id, msg, 'broadcast').catch(() => {})));
    } catch (_) { /* demo */ }
    addAlertEntry('BROADCAST', msg, 'info');
    const toast = document.createElement('div');
    toast.className = 'fixed top-6 right-6 bg-primary text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-[100] flex items-center gap-2';
    toast.innerHTML = `<span class="material-icons-round text-sm">emergency</span>Broadcast sent to <strong>${_allSessions.length}</strong> students`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// DEMO CARDS (backend offline fallback)
// ============================================================

function renderDemoCards() {
    const demos = [
        { id: 'd1', users: { name: 'Elena Gilbert',  student_id: '2024-8839' }, status: 'flagged', risk_score: 85, fps: 72, latency_ms: 48, alert_message: 'Multiple faces detected (3s ago)' },
        { id: 'd2', users: { name: 'Marcus Thorne',  student_id: '2024-7721' }, status: 'active',  risk_score: 12, fps: 60, latency_ms: 52 },
        { id: 'd3', users: { name: 'Sarah Jenkins',  student_id: '2024-1102' }, status: 'active',  risk_score: 45, fps: 0,  latency_ms: 0,  alert_message: 'Eyes off-screen 15s duration' },
        { id: 'd4', users: { name: 'Jason Voorhees', student_id: '2024-1313' }, status: 'offline', risk_score: 0,  last_seen: '2m ago' },
        { id: 'd5', users: { name: 'David Miller',   student_id: '2024-5542' }, status: 'active',  risk_score: 5 },
        { id: 'd6', users: { name: 'Clara Oswald',   student_id: '2024-9910' }, status: 'active',  risk_score: 8 },
        { id: 'd7', users: { name: 'Ben Cooper',     student_id: '2024-2231' }, status: 'active',  risk_score: 15 },
        { id: 'd8', users: { name: 'Mila Singh',     student_id: '2024-4412' }, status: 'active',  risk_score: 60, alert_message: 'Ambient voice detected' },
    ];
    _allSessions = demos;
    updateStatsBar(demos);
    renderGrid(demos);
    addAlertEntry('HIGH RISK ALERT',      'Elena Gilbert: Multiple faces detected by AI engine.', 'high');
    addAlertEntry('STATUS UPDATE',        'Jason Voorhees connection lost. Auto-reconnect initiated.', 'info');
    addAlertEntry('SUSPICIOUS BEHAVIOR',  'Sarah Jenkins: Eyes off-screen for 15+ seconds.', 'warning');
}

// ============================================================
// ALERT SIDEBAR PANEL
// ============================================================

function addAlertEntry(title, message, type = 'info') {
    const log = document.getElementById('alert-log');
    if (!log) return;

    const now  = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const colorMap = {
        high:    { border: 'border-red-500/10',     bg: 'bg-red-500/5',     text: 'text-red-400' },
        warning: { border: 'border-amber-500/10',   bg: 'bg-amber-500/5',   text: 'text-amber-400' },
        info:    { border: 'border-primary/10',     bg: 'bg-primary/5',     text: 'text-primary' },
        success: { border: 'border-emerald-500/10', bg: 'bg-emerald-500/5', text: 'text-emerald-400' },
    };
    const c = colorMap[type] || colorMap.info;

    const entry = document.createElement('div');
    entry.className = `p-3 ${c.bg} border ${c.border} rounded-lg space-y-2`;
    entry.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="text-[10px] ${c.text} font-bold uppercase tracking-wider">${escHtml(title)}</span>
            <span class="text-[10px] text-slate-500">${time}</span>
        </div>
        <p class="text-xs text-slate-300">${escHtml(message)}</p>`;

    log.insertBefore(entry, log.firstChild);

    // Keep panel to 12 entries max
    while (log.children.length > 12) log.removeChild(log.lastChild);
}

// ============================================================
// AUTO-REFRESH (every 5 seconds)
// ============================================================

function startAutoRefresh() {
    // Sessions
    _autoRefreshInterval = setInterval(async () => {
        await loadLiveSessions();
    }, 5000);

    // Alerts panel
    _alertsInterval = setInterval(async () => {
        await loadSessionAlerts();
    }, 5000);
}

function stopAutoRefresh() {
    if (_autoRefreshInterval) clearInterval(_autoRefreshInterval);
    if (_alertsInterval)      clearInterval(_alertsInterval);
    if (_detectionInterval)   clearInterval(_detectionInterval);
}

// ============================================================
// AI DETECTION SIMULATION ENGINE
// Runs every 8 seconds. Picks a random active session and
// fires a weighted-random violation (face, audio, or gadget).
// Logs to POST /api/log-violation and updates the UI live.
// ============================================================

function startDetectionSimulation() {
    // Fire once immediately, then every 8 seconds
    simulateDetectionCycle();
    _detectionInterval = setInterval(simulateDetectionCycle, 8000);
}

async function simulateDetectionCycle() {
    // Need at least one session to trigger detection on
    const activeSessions = _allSessions.filter(s => s.status !== 'offline');
    if (activeSessions.length === 0) return;

    // Pick a random active session
    const session = activeSessions[Math.floor(Math.random() * activeSessions.length)];
    const sessionId = session.id || session.student_id;
    if (!sessionId) return;

    // Pick a weighted-random violation type
    const cfg  = _detectionPool[Math.floor(Math.random() * _detectionPool.length)];

    // Generate a realistic confidence score in 0.70–0.98 range
    const confidence = parseFloat((0.70 + Math.random() * 0.28).toFixed(2));
    const confPct    = Math.round(confidence * 100);

    const studentName = session.users?.name || 'Student';

    console.log(`[Detection] ${cfg.label} | ${studentName} | ${confPct}% confidence`);

    // ── 1. Log to backend (non-blocking — UI updates regardless)
    try {
        await API.logViolation(sessionId, cfg.type, confidence);
    } catch (err) {
        // Backend may be offline — still update UI in demo mode
        console.warn('[Detection] Backend log failed:', err.message);
    }

    // ── 2. Update local session risk overlay so card re-renders correctly
    if (!_sessionRiskOverlay[sessionId]) _sessionRiskOverlay[sessionId] = 0;
    _sessionRiskOverlay[sessionId] = Math.min(100, _sessionRiskOverlay[sessionId] + cfg.riskPts);

    // Patch in-memory session risk so applyFilterAndRender shows updated badge
    const sessionIndex = _allSessions.findIndex(s => (s.id || s.student_id) === sessionId);
    if (sessionIndex !== -1) {
        _allSessions[sessionIndex].risk_score    = _sessionRiskOverlay[sessionId];
        _allSessions[sessionIndex].alert_message = cfg.label;
        // Escalate status based on accumulated risk
        if (_sessionRiskOverlay[sessionId] >= 70) {
            _allSessions[sessionIndex].status = 'flagged';
        }
    }

    // ── 3. Add real-time alert to sidebar
    const faceTypes = ['face_not_detected', 'multiple_faces', 'face_out_of_frame'];
    const alertType = faceTypes.includes(cfg.type) ? 'high' : cfg.alertLevel;
    const alertTitle = faceTypes.includes(cfg.type)
        ? 'FACE DETECTION ALERT'
        : cfg.alertLevel === 'high' ? 'HIGH RISK ALERT' : 'SUSPICIOUS BEHAVIOR';

    addAlertEntry(
        alertTitle,
        `${studentName}: ${cfg.label} (${confPct}% confidence)`,
        alertType
    );

    // ── 4. Re-render cards immediately so badge + risk meter updates
    applyFilterAndRender();
    updateStatsBar(_allSessions);
}


// ============================================================
// UTILS
// ============================================================

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}
