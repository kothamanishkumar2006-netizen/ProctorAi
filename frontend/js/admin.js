// ============================================================
// admin.js — Admin Dashboard & Violations List Page
// Pages: dashboard-admin.html | dashboard-admin-violations.html
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ── Admin Dashboard ──────────────────────────────────────
    if (document.getElementById('stats-active-exams')) {
        initAdminDashboard();
    }

    // ── Violations List (admin) ──────────────────────────────
    if (document.getElementById('admin-violations-body')) {
        initAdminViolations();
    }
});

// ============================================================
// A. ADMIN DASHBOARD
// ============================================================

async function initAdminDashboard() {
    showDashboardSkeleton();
    try {
        const dash = await API.getFullDashboard();
        renderKPIs(dash);
        renderViolationsChart(dash.violationsPerDay, dash.maxCount);
        renderAIConfidence(dash.aiConfidence);
        renderRecentAlerts(dash.recentAlerts);
    } catch (err) {
        console.error('Dashboard load error:', err);
        API.toast('Failed to load dashboard data. Showing cached placeholders.', 'warning');
    }
}

// ── KPI Cards
function renderKPIs(dash) {
    safeText('stats-active-exams',       dash.totalExams       ?? '--');
    safeText('stats-pending-violations', dash.totalViolations  ?? '--');
    safeText('stats-total-students',     dash.highRiskStudents ?? '--');
}

function showDashboardSkeleton() {
    ['stats-active-exams','stats-pending-violations','stats-total-students'].forEach(id => {
        safeText(id, '…');
    });
}

// ── Violations-per-Day Bar Chart (replaces static bars)
function renderViolationsChart(data, maxCount) {
    const container = document.querySelector('.h-64.flex.items-end.justify-between');
    if (!container || !data || data.length === 0) return;

    const MAX_HEIGHT = 220; // px

    container.innerHTML = data.map(({ day, count }) => {
        const pct     = maxCount > 0 ? count / maxCount : 0;
        const height  = Math.max(Math.round(pct * MAX_HEIGHT), 4);
        const isMax   = count === maxCount && count > 0;
        const barCls  = isMax
            ? 'bg-primary group-hover:bg-primary/80'
            : 'bg-primary/25 group-hover:bg-primary/50';

        return `
        <div class="flex-1 group relative flex flex-col items-center justify-end">
            <span class="text-[9px] text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">${count}</span>
            <div class="${barCls} transition-all rounded-t-lg w-full" style="height:${height}px"></div>
            <p class="text-[10px] text-center mt-2 text-slate-500">${day}</p>
        </div>`;
    }).join('');
}

// ── AI Confidence Distribution (progress bars)
function renderAIConfidence(conf) {
    // High Confidence Flags
    setBar('ai-bar-high', conf.high ?? 78, 'bg-emerald-500');
    safeText('ai-pct-high', (conf.high ?? 78) + '%');

    // Uncertain
    setBar('ai-bar-medium', conf.medium ?? 15, 'bg-amber-500');
    safeText('ai-pct-medium', (conf.medium ?? 15) + '%');

    // Manual Review
    setBar('ai-bar-low', conf.low ?? 7, 'bg-red-500');
    safeText('ai-pct-low', (conf.low ?? 7) + '%');
}

function setBar(id, pct, colorClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = `${pct}%`;
    el.className   = `h-full ${colorClass} rounded-full transition-all duration-700`;
}

// ── Recent Critical Alerts Table
function renderRecentAlerts(violations) {
    const tbody = document.getElementById('recent-alerts-body');
    if (!tbody) return;

    if (!violations || violations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500">No recent alerts found.</td></tr>';
        return;
    }

    tbody.innerHTML = violations.slice(0, 6).map(v => {
        const name     = v.users?.name   || 'Unknown';
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const course   = v.exams?.course_code || v.exam_id || '—';
        const examName = v.exams?.title        || v.exams?.name || '';
        const conf     = v.confidence != null  ? v.confidence  : '—';
        const badge    = riskBadgeClass(conf);
        const label    = riskLabel(conf);

        return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
            onclick="viewEvidence('${v.id}')">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">${initials}</div>
                    <div>
                        <p class="text-sm font-semibold">${escHtml(name)}</p>
                        <p class="text-xs text-slate-500">${escHtml(examName)}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 font-mono text-xs text-slate-500">${escHtml(course)}</td>
            <td class="px-6 py-4"><span class="text-sm">${escHtml(v.type || '—')}</span></td>
            <td class="px-6 py-4 text-sm font-medium">${conf !== '—' ? conf + '%' : '—'}</td>
            <td class="px-6 py-4 text-right">
                <span class="px-3 py-1 text-xs font-bold rounded-full ${badge}">${label}</span>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// B. ADMIN VIOLATIONS LIST PAGE
// ============================================================

let _adminViolations   = [];
let _adminPage         = 1;
const ADMIN_PAGE_SIZE  = 15;
let _adminSearchQuery  = '';

async function initAdminViolations() {
    renderViolationsLoading();
    await loadAdminViolations();
    wireAdminSearch();
}

async function loadAdminViolations(page = 1) {
    _adminPage = page;
    const tbody = document.getElementById('admin-violations-body');
    if (!tbody) return;

    try {
        const res = await API.getViolations({ page, pageSize: ADMIN_PAGE_SIZE });
        _adminViolations = res.data || [];
        renderAdminViolationsTable(_adminViolations);
        renderAdminPagination(res.totalPages, res.page, res.total);
    } catch (err) {
        console.error('Error loading violations:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500">
            <span class="material-icons block text-3xl mb-2">error_outline</span>
            Error loading violations: ${escHtml(err.message)}
        </td></tr>`;
    }
}

function renderViolationsLoading() {
    const tbody = document.getElementById('admin-violations-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">
        <span class="material-icons-round animate-spin block text-3xl mb-2">sync</span>Loading violations...</td></tr>`;
}

function renderAdminViolationsTable(violations) {
    const tbody = document.getElementById('admin-violations-body');
    if (!tbody) return;

    if (violations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">No violations found.</td></tr>';
        return;
    }

    tbody.innerHTML = violations.map(v => {
        const name     = v.users?.name || 'Unknown';
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const course   = v.exams?.course_code || v.exam_id || '—';
        const conf     = v.confidence ?? 0;
        const ts       = v.timestamp ? new Date(v.timestamp) : null;

        return `
        <tr class="hover:bg-primary/5 transition-colors group">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">${initials}</div>
                    <span class="font-medium text-sm">${escHtml(name)}</span>
                </div>
            </td>
            <td class="px-6 py-4 font-mono text-sm text-slate-400">${escHtml(course)}</td>
            <td class="px-6 py-4">
                <span class="bg-rose-500/10 text-rose-500 text-xs font-medium px-2.5 py-1 rounded-full border border-rose-500/20">
                    ${escHtml(v.type || '—')}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="bg-rose-500 h-full" style="width:${Math.min(conf, 100)}%"></div>
                    </div>
                    <span class="text-sm font-bold text-rose-500">${conf}%</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm">
                ${ts ? `<p>${ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</p>
                        <p class="text-xs text-slate-500">${ts.toLocaleDateString()}</p>` : '—'}
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="viewEvidence('${v.id}')"
                    class="text-primary hover:underline text-sm font-medium flex items-center gap-1 justify-end ml-auto">
                    View Evidence <span class="material-icons text-sm">open_in_new</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Pagination
function renderAdminPagination(totalPages, currentPage, total) {
    let pager = document.getElementById('admin-pagination');

    // Create pager if missing
    if (!pager) {
        const tableWrap = document.querySelector('#admin-violations-body')?.closest?.('.rounded-xl');
        if (!tableWrap) return;
        pager = document.createElement('div');
        pager.id = 'admin-pagination';
        pager.className = 'flex items-center justify-between px-6 py-4 border-t border-primary/10 text-sm text-slate-500';
        tableWrap.parentNode.insertBefore(pager, tableWrap.nextSibling);
    }

    if (totalPages <= 1) { pager.innerHTML = `<span>${total} violation${total !== 1 ? 's' : ''}</span>`; return; }

    const prev = currentPage > 1;
    const next = currentPage < totalPages;

    pager.innerHTML = `
        <span>${total} violations — Page ${currentPage} of ${totalPages}</span>
        <div class="flex gap-2">
            <button onclick="loadAdminViolations(${currentPage - 1})"
                class="px-3 py-1 rounded-lg border border-primary/20 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                ${prev ? '' : 'disabled'}>← Prev</button>
            <button onclick="loadAdminViolations(${currentPage + 1})"
                class="px-3 py-1 rounded-lg border border-primary/20 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                ${next ? '' : 'disabled'}>Next →</button>
        </div>`;
}

// ── Search
function wireAdminSearch() {
    const input = document.querySelector('input[placeholder*="Search"]');
    if (!input) return;
    input.addEventListener('input', e => {
        _adminSearchQuery = e.target.value.toLowerCase().trim();
        if (_adminSearchQuery) {
            const filtered = _adminViolations.filter(v =>
                (v.users?.name       || '').toLowerCase().includes(_adminSearchQuery) ||
                (v.exams?.course_code || '').toLowerCase().includes(_adminSearchQuery) ||
                (v.type              || '').toLowerCase().includes(_adminSearchQuery) ||
                (v.exam_id           || '').toLowerCase().includes(_adminSearchQuery)
            );
            renderAdminViolationsTable(filtered);
        } else {
            renderAdminViolationsTable(_adminViolations);
        }
    });
}

// Backwards compat alias called by old HTML buttons
function searchData() {
    const input = document.querySelector('input[placeholder*="Search"]');
    input?.dispatchEvent(new Event('input'));
}

// ============================================================
// C. EVIDENCE MODAL (shared — both admin pages)
// ============================================================

async function viewEvidence(id) {
    try {
        const res  = await API.getViolationDetails(id);
        const data = res.data;
        if (!data) throw new Error('No data returned');

        // Debug: always log so you can inspect in DevTools console
        console.log('[Admin Modal] Violation data:', data);
        console.log('[Admin Modal] evidence_url:', data.evidence_url);

        // Populate modal fields
        safeText('modal-id',           data.id ? data.id.substring(0, 8) : '—');
        safeText('modal-student-name', data.users?.name || '—');
        safeText('modal-student-id',   `ID: ${data.users?.student_id || '—'}`);
        safeText('modal-type',         data.type || '—');

        const confEl = document.getElementById('modal-confidence');
        if (confEl) confEl.textContent = data.confidence != null ? data.confidence + '%' : '—';

        // Timestamps
        if (data.timestamp) {
            const ts  = new Date(data.timestamp);
            const fmt = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            safeText('modal-timestamp-time', fmt(ts));
            safeText('modal-timestamp-date', ts.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }));
            const s = offset => { const d2 = new Date(ts); d2.setSeconds(d2.getSeconds() + offset); return fmt(d2); };
            safeText('modal-ts-start', s(-5));
            safeText('modal-ts-mid',   fmt(ts));
            safeText('modal-ts-end',   s(+5));
        }

        // Context info
        safeText('modal-exam-title',  data.exams?.title || data.exams?.name || '—');
        safeText('modal-course-code', data.exams?.course_code || '—');

        // ── Evidence Image (fixed)
        const img = document.getElementById('modal-image');
        if (img) {
            // Remove any stale no-evidence placeholder from previous open
            const prev = document.getElementById('modal-no-evidence');
            if (prev) prev.remove();

            const evidenceUrl = data.evidence_url;

            if (evidenceUrl && evidenceUrl.trim() !== '') {
                img.style.display = 'block';
                img.src = evidenceUrl;

                img.onload = () => {
                    console.log('[Admin Modal] Image loaded OK:', evidenceUrl);
                    img.style.display = 'block';
                };
                img.onerror = () => {
                    console.warn('[Admin Modal] Image failed to load:', evidenceUrl);
                    img.style.display = 'none';
                    adminShowNoEvidence(img.parentElement);
                };
            } else {
                img.style.display = 'none';
                adminShowNoEvidence(img.parentElement);
            }
        }

        const modal = document.getElementById('evidence-modal');
        if (modal) modal.classList.remove('hidden');

        window.currentViolationId = id;
    } catch (err) {
        API.toast('Error loading evidence: ' + err.message, 'error');
        console.error('[Admin Modal] Error:', err);
    }
}

/** Renders "No Evidence Available" inside the modal image container */
function adminShowNoEvidence(container) {
    if (!container) return;
    const existing = container.querySelector('#modal-no-evidence');
    if (existing) existing.remove();

    const ph = document.createElement('div');
    ph.id = 'modal-no-evidence';
    ph.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);gap:12px;';
    ph.innerHTML = `
        <span class="material-icons" style="font-size:3rem;opacity:0.3;color:#94a3b8">hide_image</span>
        <div style="text-align:center">
            <p style="color:#cbd5e1;font-size:0.875rem;font-weight:600">No Evidence Available</p>
            <p style="color:#64748b;font-size:0.75rem;margin-top:4px">Screenshot was not captured for this event</p>
        </div>`;

    const cs = getComputedStyle(container).position;
    if (cs === 'static') container.style.position = 'relative';
    container.appendChild(ph);
}


function closeModal() {
    const modal = document.getElementById('evidence-modal');
    if (modal) modal.classList.add('hidden');
    window.currentViolationId = null;
}

async function confirmViolationAction() {
    if (!window.currentViolationId) return;
    try {
        await API.updateViolationStatus(window.currentViolationId, 'confirm');
        API.toast('Violation confirmed successfully', 'success');
        closeModal();
        if (document.getElementById('admin-violations-body'))  loadAdminViolations(_adminPage);
        if (document.getElementById('recent-alerts-body'))     initAdminDashboard();
    } catch (err) {
        API.toast('Error confirming: ' + err.message, 'error');
    }
}

async function dismissViolationAction() {
    if (!window.currentViolationId) return;
    try {
        await API.updateViolationStatus(window.currentViolationId, 'dismiss');
        API.toast('Violation dismissed as false positive', 'info');
        closeModal();
        if (document.getElementById('admin-violations-body')) loadAdminViolations(_adminPage);
        if (document.getElementById('recent-alerts-body'))    initAdminDashboard();
    } catch (err) {
        API.toast('Error dismissing: ' + err.message, 'error');
    }
}

// ── CSV Export
function exportCSV() {
    const rows = [['Student','Exam ID','Violation Type','AI Confidence','Risk Level']];
    document.querySelectorAll('#recent-alerts-body tr, #admin-violations-body tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim().replace(/\n/g, ' '));
        if (cells.length >= 3) rows.push(cells);
    });
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `violations_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
}

function showNotifications() {
    API.toast('System: 3 new flag requests | DB backup OK | High-risk alert in Batch 2024-A', 'info');
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

function riskBadgeClass(confidence) {
    const pct = parseFloat(confidence);
    if (pct >= 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (pct >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
}

function riskLabel(confidence) {
    const pct = parseFloat(confidence);
    if (pct >= 80) return 'CRITICAL';
    if (pct >= 50) return 'SUSPICIOUS';
    return 'LOW RISK';
}

// ── Auto-refresh dashboard every 60s
if (document.getElementById('stats-active-exams')) {
    setInterval(initAdminDashboard, 60_000);
}
