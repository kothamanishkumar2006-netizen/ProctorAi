// ============================================================
// violations.js — Violations List + Evidence Preview Pages
// Pages: dashboard-violations.html | dashboard-admin-violations.html
// APIs:
//   GET  /api/violations           (paginated + search + filter)
//   GET  /api/violations/:id       (evidence modal)
//   PUT  /api/violations/:id/confirm
//   PUT  /api/violations/:id/dismiss
// ============================================================

// ── State ─────────────────────────────────────────────────────
let _allViolations  = [];   // full page of records (for client search/filter)
let _currentPage    = 1;
const PAGE_SIZE     = 15;
let _searchQuery    = '';
let _riskFilter     = '';
let _currentViolId  = null;

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadViolations(_currentPage);
    wireProblemInput();
});

// ============================================================
// A. VIOLATIONS TABLE
// ============================================================

async function loadViolations(page = 1) {
    _currentPage = page;
    const tbody  = document.getElementById('violations-body');
    if (!tbody) return;

    // Show loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-10 text-center text-slate-400">
                <span class="material-icons-round text-3xl block mb-2 animate-spin">sync</span>
                Loading violations…
            </td>
        </tr>`;

    try {
        // Apply risk_level filter to API if set
        const filters = {};
        if (_riskFilter) filters.risk_level = _riskFilter;

        // Isolate violations to current session ONLY
        const currentSessionId = localStorage.getItem('current_session_id');
        if (currentSessionId) {
            filters.session_id = currentSessionId;
        }

        const res = await API.getViolations({ ...filters, page, pageSize: PAGE_SIZE });
        _allViolations = res.data || [];

        renderViolationsTable(_searchQuery ? applySearchFilter(_allViolations) : _allViolations);
        renderPagination(res.totalPages, res.page, res.total);
    } catch (err) {
        console.error('[violations.js] Load error:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-10 text-center">
                    <span class="material-icons-round text-3xl text-red-500 block mb-2">error_outline</span>
                    <p class="text-red-400 font-medium">Failed to load violations</p>
                    <p class="text-slate-500 text-sm mt-1">${escHtml(err.message)}</p>
                    <button onclick="loadViolations(1)"
                        class="mt-4 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors">
                        Retry
                    </button>
                </td>
            </tr>`;
    }
}

// ── Table Renderer
function renderViolationsTable(violations) {
    const tbody = document.getElementById('violations-body');
    if (!tbody) return;

    if (!violations || violations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-10 text-center text-slate-500">
                    <span class="material-icons-round text-3xl block mb-2 opacity-30">search_off</span>
                    No violations detected for this session.
                </td>

            </tr>`;
        return;
    }

    tbody.innerHTML = violations.map(v => {
        const name      = v.users?.name       || v.student_id || 'Unknown Student';
        const initial   = name.charAt(0).toUpperCase();
        const examId    = v.exams?.course_code || v.exam_id    || '—';
        const type      = v.type              || '—';
        const conf      = v.confidence        != null ? v.confidence : '—';
        const confNum   = parseFloat(conf)    || 0;
        const ts        = v.timestamp         ? new Date(v.timestamp) : null;
        const risk      = riskLabel(confNum);
        const badgeCls  = riskBadgeInline(confNum);

        return `
        <tr class="hover:bg-primary/5 transition-colors group cursor-pointer violation-row"
            data-id="${escHtml(v.id)}"
            data-confidence="${confNum}"
            onclick="openEvidenceModal('${escHtml(v.id)}')">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                        ${escHtml(initial)}
                    </div>
                    <span class="font-medium text-sm">${escHtml(name)}</span>
                </div>
            </td>
            <td class="px-6 py-4 font-mono text-sm text-slate-400">${escHtml(examId)}</td>
            <td class="px-6 py-4">
                <span class="bg-rose-500/10 text-rose-500 text-xs font-medium px-2.5 py-1 rounded-full border border-rose-500/20">
                    ${escHtml(type)}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <div class="relative w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
                        <div class="absolute left-0 top-0 h-full rounded-full ${riskBarColor(confNum)}"
                             style="width:${Math.min(confNum, 100)}%"></div>
                    </div>
                    <span class="text-sm font-bold ${riskTextColor(confNum)}">${conf !== '—' ? conf + '%' : '—'}</span>
                    <span class="hidden sm:inline px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeCls}">${risk}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-500">
                ${ts
                    ? `<p class="font-medium">${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                       <p class="text-xs">${ts.toLocaleDateString()}</p>`
                    : '—'}
            </td>
            <td class="px-6 py-4 text-right" onclick="event.stopPropagation()">
                <button onclick="openEvidenceModal('${escHtml(v.id)}')"
                    class="text-primary hover:text-primary/70 text-sm font-medium flex items-center gap-1 justify-end ml-auto hover:underline transition-colors">
                    View Evidence
                    <span class="material-symbols-outlined text-[18px]">visibility</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── Search (client-side)
function applySearchFilter(violations) {
    if (!_searchQuery) return violations;
    const q = _searchQuery.toLowerCase();
    return violations.filter(v =>
        (v.users?.name       || '').toLowerCase().includes(q) ||
        (v.exams?.course_code || '').toLowerCase().includes(q) ||
        (v.type              || '').toLowerCase().includes(q) ||
        (v.exam_id           || '').toLowerCase().includes(q) ||
        (v.users?.student_id || '').toLowerCase().includes(q)
    );
}

function filterViolations(query) {
    _searchQuery = (query || '').trim().toLowerCase();
    renderViolationsTable(applySearchFilter(_allViolations));
}

// ── Risk Filter (sends request to backend with risk_level param)
function filterByRisk(level) {
    _riskFilter = level;
    loadViolations(1);
}

// ── Wire search input
function wireProblemInput() {
    const input = document.querySelector('input[oninput*="filterViolations"]') ||
                  document.querySelector('input[placeholder*="Search"]');
    if (!input) return;
    input.addEventListener('input', e => filterViolations(e.target.value));
}

// ── Pagination
function renderPagination(totalPages, currentPage, total) {
    let pager = document.getElementById('violations-pagination');

    if (!pager) {
        const wrap = document.getElementById('violations-body')?.closest?.('.rounded-xl');
        if (!wrap) return;
        pager = document.createElement('div');
        pager.id = 'violations-pagination';
        pager.className = 'flex items-center justify-between px-6 py-4 border-t border-primary/10 text-sm';
        wrap.parentNode.insertBefore(pager, wrap.nextSibling);
    }

    if (totalPages <= 1) {
        pager.innerHTML = `<span class="text-slate-500">${total} violation${total !== 1 ? 's' : ''} total</span>`;
        return;
    }

    const prevOk = currentPage > 1;
    const nextOk = currentPage < totalPages;

    pager.innerHTML = `
        <span class="text-slate-500">${total} violations — Page ${currentPage} of ${totalPages}</span>
        <div class="flex items-center gap-2">
            <button onclick="loadViolations(${currentPage - 1})"
                ${prevOk ? '' : 'disabled'}
                class="px-3 py-1.5 rounded-lg border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                ← Prev
            </button>
            ${buildPageNumbers(totalPages, currentPage)}
            <button onclick="loadViolations(${currentPage + 1})"
                ${nextOk ? '' : 'disabled'}
                class="px-3 py-1.5 rounded-lg border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                Next →
            </button>
        </div>`;
}

function buildPageNumbers(total, current) {
    if (total <= 5) {
        return Array.from({ length: total }, (_, i) => {
            const p   = i + 1;
            const cls = p === current
                ? 'px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold'
                : 'px-3 py-1.5 rounded-lg border border-primary/20 text-primary text-xs hover:bg-primary/10 transition-colors cursor-pointer';
            return `<button onclick="loadViolations(${p})" class="${cls}">${p}</button>`;
        }).join('');
    }
    // Show just current page number when many pages
    return `<span class="text-slate-400 text-xs px-2">Page ${current}</span>`;
}

// ============================================================
// B. EVIDENCE MODAL — full detail view
// ============================================================

let _currentPage   = 1;
let _currentStatus = 'pending';
let _currentViolId = null;

// Multi-frame Evidence Carousel State
let _evidenceFrames = [];
let _currentFrameIdx = 0;

function updateCarouselUI() {
    const imgEl = document.getElementById('modal-image');
    if (!imgEl) return;

    if (_evidenceFrames.length === 0) {
        imgEl.style.display = 'none';
        showNoEvidencePlaceholder(imgEl.parentElement);
        const indicators = document.getElementById('modal-carousel-indicators');
        if (indicators) indicators.innerHTML = '';
        return;
    }

    imgEl.style.display = 'block';
    imgEl.src = _evidenceFrames[_currentFrameIdx];

    // Hide placeholder if any
    const noEv = document.getElementById('modal-no-evidence');
    if (noEv) noEv.remove();

    // Update indicators if they exist
    const indicators = document.getElementById('modal-carousel-indicators');
    if (indicators) {
        indicators.innerHTML = _evidenceFrames.map((_, i) =>
            `<div class="w-2 h-2 rounded-full ${i === _currentFrameIdx ? 'bg-primary' : 'bg-white/30'}"></div>`
        ).join('');
    }

    // Update timestamp/frame labels if they exist
    const labels = ['-1.5s', 'Current (T-0)', '+1.5s'];
    const timeEls = ['modal-ts-start', 'modal-ts-mid', 'modal-ts-end'];
    timeEls.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = labels[idx] || '';
            el.style.color = idx === _currentFrameIdx ? '#0ea5e9' : '';
            el.style.fontWeight = idx === _currentFrameIdx ? 'bold' : 'normal';
        }
    });

    const frameLabel = document.getElementById('modal-frame-label');
    if (frameLabel) {
        frameLabel.textContent = `FRAME ${_currentFrameIdx + 1} OF ${_evidenceFrames.length}`;
    }
}

function nextEvidenceFrame() {
    if (_evidenceFrames.length <= 1) return;
    _currentFrameIdx = (_currentFrameIdx + 1) % _evidenceFrames.length;
    updateCarouselUI();
}

function prevEvidenceFrame() {
    if (_evidenceFrames.length <= 1) return;
    _currentFrameIdx = (_currentFrameIdx - 1 + _evidenceFrames.length) % _evidenceFrames.length;
    updateCarouselUI();
}

/**
 * openEvidenceModal(id)
 * Fetches GET /api/violations/:id and populates the modal with:
 * - student name + ID
 * - violation type
 * - AI confidence
 * - timestamp
 * - evidence images (array)
 * - exam context info
 */
async function openEvidenceModal(id) {
    const modal = document.getElementById('evidence-modal');
    if (!modal) return;

    // Show modal immediately with a loading state
    modal.classList.remove('hidden');
    _currentViolId = id;
    _evidenceFrames = [];
    _currentFrameIdx = 0;

    // Loading placeholders
    ['modal-id','modal-student-name','modal-student-id','modal-type',
     'modal-confidence','modal-timestamp-time','modal-timestamp-date',
     'modal-exam-title','modal-course-code','modal-ts-start','modal-ts-mid','modal-ts-end']
        .forEach(elId => safeText(elId, '…'));

    const imgEl = document.getElementById('modal-image');
    if (imgEl) {
        imgEl.src = '';
        imgEl.style.display = 'block';
        // Hide any previous no-evidence placeholder
        const noEv = document.getElementById('modal-no-evidence');
        if (noEv) noEv.remove();
    }

    try {
        const res  = await API.getViolationDetails(id);
        const data = res.data;
        if (!data) throw new Error('No violation data returned');

        // ── Basic fields
        safeText('modal-id',           shorten(data.id, 8));
        safeText('modal-student-name', data.users?.name           || '—');
        safeText('modal-student-id',   'Student ID: ' + (data.users?.student_id || '—'));
        safeText('modal-type',         data.type                  || '—');

        // ── Confidence
        const conf = data.confidence != null ? data.confidence + '%' : '—';
        safeText('modal-confidence', conf);

        // ── Timestamps
        if (data.timestamp) {
            const ts  = new Date(data.timestamp);
            const fmt = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            safeText('modal-timestamp-time', fmt(ts));
            safeText('modal-timestamp-date', ts.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }));

            // Scrubber timeline labels (−5s, current, +5s)
            const shifted = offset => {
                const d2 = new Date(ts);
                d2.setSeconds(d2.getSeconds() + offset);
                return fmt(d2);
            };
            safeText('modal-ts-start', shifted(-5));
            safeText('modal-ts-mid',   fmt(ts));
            safeText('modal-ts-end',   shifted(+5));
        } else {
            ['modal-timestamp-time','modal-timestamp-date','modal-ts-start','modal-ts-mid','modal-ts-end']
                .forEach(id => safeText(id, '—'));
        }

        // ── Exam context
        safeText('modal-exam-title',  data.exams?.title || data.exams?.name || '—');
        safeText('modal-course-code', data.exams?.course_code || '—');

        // ── Evidence media array processing
        console.log('[Evidence Modal] Violation data:', data);

        if (imgEl) {
            // Support both evidence_urls (new JSONB array) and evidence_url (legacy string)
            const urls = data.evidence_urls && Array.isArray(data.evidence_urls)
                ? data.evidence_urls
                : [data.evidence_url].filter(Boolean);

            if (urls.length > 0) {
                _evidenceFrames = urls;
                // If it's a 3-frame capture, default to the center frame ([1], "At-violation")
                _currentFrameIdx = urls.length === 3 ? 1 : 0;
            } else {
                _evidenceFrames = [];
            }
            updateCarouselUI();

            // Set up fallback chaining for the current active image
            imgEl.onerror = () => {
                console.warn('[Evidence Modal] Image failed to load:', imgEl.src);
                _evidenceFrames = []; // Clear array to show placeholder
                updateCarouselUI();
            };
        }

        // ── Risk badge in modal title area (if element exists)
        const riskBadgeEl = document.getElementById('modal-risk-badge');
        if (riskBadgeEl && data.confidence != null) {
            riskBadgeEl.textContent = riskLabel(data.confidence);
            riskBadgeEl.className   = `px-3 py-1 text-xs font-bold rounded-full ${riskBadgeInline(data.confidence)}`;
        }

    } catch (err) {
        // Show error inside the modal rather than an alert
        safeText('modal-student-name', 'Error loading evidence');
        safeText('modal-type', err.message);
        console.error('[violations.js] Modal error:', err);
    }
}

// Alias used by admin.js and buttons
function showEvidence(violation) {
    if (violation?.id) openEvidenceModal(violation.id);
}

function closeModal() {
    const modal = document.getElementById('evidence-modal');
    if (modal) modal.classList.add('hidden');
    _currentViolId = null;
}

// ── Close on backdrop click
document.addEventListener('click', e => {
    const modal = document.getElementById('evidence-modal');
    if (modal && e.target === modal) closeModal();
});

// ── Keyboard: Escape to close
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

// ============================================================
// C. CONFIRM / DISMISS ACTIONS
// ============================================================

/**
 * confirmViolationAction()
 * Calls PUT /api/violations/:id/confirm
 */
async function confirmViolationAction() {
    if (!_currentViolId) return;

    if (!confirm('Confirm this violation? It will be officially recorded.')) return;

    try {
        await API.updateViolationStatus(_currentViolId, 'confirm');
        API.toast('Violation confirmed and recorded.', 'success');
        closeModal();
        loadViolations(_currentPage);
    } catch (err) {
        API.toast('Error confirming: ' + err.message, 'error');
    }
}

/**
 * dismissViolationAction()
 * Calls PUT /api/violations/:id/dismiss
 */
async function dismissViolationAction() {
    if (!_currentViolId) return;

    if (!confirm('Dismiss this as a false positive?')) return;

    try {
        await API.updateViolationStatus(_currentViolId, 'dismiss');
        API.toast('Violation dismissed as false positive.', 'info');
        closeModal();
        loadViolations(_currentPage);
    } catch (err) {
        API.toast('Error dismissing: ' + err.message, 'error');
    }
}

// ── Download evidence image
function downloadEvidence() {
    const img = document.getElementById('modal-image');
    const src = img?.src || '';

    // Block only if no src at all or it's empty
    if (!src || src === window.location.href) {
        API.toast('No evidence image available to download.', 'warning');
        return;
    }
    const a = document.createElement('a');
    a.href     = src;
    a.download = `evidence_${shorten(_currentViolId, 8) || 'unknown'}.jpg`;
    a.target   = '_blank';  // open in new tab if cross-origin download blocked
    a.click();
}

// ============================================================
// UTILS
// ============================================================

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? '—';
}

function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}

function shorten(str, len) {
    return str ? str.toString().substring(0, len) : '—';
}

function riskLabel(confidence) {
    const pct = parseFloat(confidence) || 0;
    if (pct >= 80) return 'CRITICAL';
    if (pct >= 50) return 'SUSPICIOUS';
    return 'LOW RISK';
}

function riskBadgeInline(confidence) {
    const pct = parseFloat(confidence) || 0;
    if (pct >= 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (pct >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
}

function riskBarColor(confidence) {
    const pct = parseFloat(confidence) || 0;
    if (pct >= 80) return 'bg-red-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-emerald-500';
}

function riskTextColor(confidence) {
    const pct = parseFloat(confidence) || 0;
    if (pct >= 80) return 'text-red-500';
    if (pct >= 50) return 'text-amber-500';
    return 'text-emerald-500';
}

function exportToPDF() {
    API.toast('PDF export: feature coming soon in production build.', 'info');
}

// ============================================================
// EVIDENCE IMAGE HELPERS
// ============================================================

/**
 * showNoEvidencePlaceholder(container)
 * Renders a styled "No Evidence Available" box inside the modal image area
 * when evidence_url is missing or the image fails to load.
 */
function showNoEvidencePlaceholder(container) {
    if (!container) return;

    // Remove any existing placeholder
    const existing = container.querySelector('#modal-no-evidence');
    if (existing) existing.remove();

    const placeholder = document.createElement('div');
    placeholder.id = 'modal-no-evidence';
    placeholder.className = [
        'absolute inset-0 flex flex-col items-center justify-center',
        'bg-slate-900/80 text-slate-400 gap-3'
    ].join(' ');
    placeholder.innerHTML = `
        <span class="material-icons text-5xl opacity-30">hide_image</span>
        <div class="text-center">
            <p class="text-sm font-semibold text-slate-300">No Evidence Available</p>
            <p class="text-xs text-slate-500 mt-1">Screenshot was not captured for this event</p>
        </div>`;

    // Make sure the container is positioned so absolute works
    const current = getComputedStyle(container).position;
    if (current === 'static') container.style.position = 'relative';

    container.appendChild(placeholder);
}
