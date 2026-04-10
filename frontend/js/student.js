// ============================================================
// student.js — ProctorAI Exam Interface
// 3-Stage Flow:
//   Stage 1: Exam Active      (isExamActive=true,  isSubmitted=false)
//   Stage 2: Exam Submitted   (isExamActive=true,  isSubmitted=true)
//   Stage 3: Exam Finished    (isExamActive=false, isSubmitted=true)
// ============================================================

// ── State (equivalent to React useState) ──────────────────────
let currentQuestions     = [];
let currentAnswers       = {};
let currentQuestionIndex = 0;
let activeSessionId      = localStorage.getItem('current_session_id') || 's_' + Date.now();
localStorage.setItem('current_session_id', activeSessionId);
let activeExamId         = 'e1';


let isExamActive = true;
let isSubmitted  = false;

// ── Interval / Timer refs (equivalent to React useRef) ─────────
// All stored here so they can be cleared atomically on Submit.
const _intervals = {
    timer:          null,   // countdown timer setInterval
    audioSim:       null,   // simulated audio detection loop
    visualSim:      null,   // simulated visual detection loop
    audioProcessor: null,   // real WebAudio ScriptProcessor node
    audioContext:   null,   // real WebAudio AudioContext
    blurHandler:    null,   // blur event listener ref
    focusHandler:   null,   // focus event listener ref
    frameBuffer:    null,   // rolling frame buffer loop (1.5s interval)
};

// ============================================================
// EVIDENCE CAPTURE SYSTEM
// Multi-frame capture: [prior frame, at-violation, post-violation]
// A rolling buffer keeps the last 3 raw frames so we always have
// a "before" shot even when a violation fires unexpectedly.
// Each frame has a timestamp + violation label burned in.
// Resolution is capped to 640×480 for performance.
// ============================================================

/** Rolling frame ring-buffer — holds at most MAX_BUFFER entries. */
const MAX_BUFFER = 3;
const _frameBuffer = [];

/** Per-violation-type debounce map. Prevents same type firing < 15s. */
const _lastViolationTime = {};
const VIOLATION_DEBOUNCE_MS = 15000;

/**
 * captureFrameWithOverlay(label)
 * Draws the current webcam frame onto a max-640×480 canvas,
 * then burns in a timestamp and optional label.
 * Returns JPEG base64 data URL or null on failure.
 */
function captureFrameWithOverlay(label = '') {
    try {
        const video = document.getElementById('exam-camera') ||
                      document.querySelector('video');
        if (!video || !video.videoWidth || video.videoWidth === 0) return null;

        // Cap resolution to 640×480 for performance & bandwidth
        const MAX_W = 640, MAX_H = 480;
        const scale  = Math.min(1, MAX_W / video.videoWidth, MAX_H / video.videoHeight);
        const width  = Math.round(video.videoWidth  * scale);
        const height = Math.round(video.videoHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 1. Draw the webcam frame
        ctx.drawImage(video, 0, 0, width, height);

        // 2. Timestamp overlay (bottom-left, semi-transparent bar)
        const now     = new Date();
        const tsText  = now.toLocaleTimeString('en-US', { hour12: false }) +
                        '.' + String(now.getMilliseconds()).padStart(3, '0');
        const dateText = now.toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' });
        const barH = 28;

        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, height - barH, width, barH);

        ctx.font      = 'bold 11px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(tsText + '  ' + dateText, 8, height - 10);

        // 3. Violation label overlay (top-left red badge)
        if (label) {
            const labelText = '⚠ ' + label.toUpperCase();
            const labelW    = ctx.measureText(labelText).width + 16;
            ctx.fillStyle   = 'rgba(220,38,38,0.85)';   // red-600
            ctx.fillRect(0, 0, labelW, 24);
            ctx.fillStyle   = '#ffffff';
            ctx.font        = 'bold 11px sans-serif';
            ctx.fillText(labelText, 8, 16);
        }

        // 4. ProctorAI watermark (top-right)
        ctx.font      = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'right';
        ctx.fillText('ProctorAI ©', width - 6, 14);
        ctx.textAlign = 'left';

        // JPEG at 0.65 quality ≈ 15–50 KB per frame
        return canvas.toDataURL('image/jpeg', 0.65);
    } catch (err) {
        console.warn('[EvidenceCapture] Frame capture failed:', err.message);
        return null;
    }
}

/**
 * startFrameBuffer()
 * Begins a 1.5-second rolling capture loop.
 * Stores up to MAX_BUFFER raw (no-label) frames so we always have
 * a "before" frame available when a violation fires.
 * Stopped via stopAllMonitoring().
 */
function startFrameBuffer() {
    _intervals.frameBuffer = setInterval(() => {
        if (!isExamActive || isSubmitted) return;
        const frame = captureFrameWithOverlay('');   // no label for buffer frames
        if (frame) {
            _frameBuffer.push(frame);
            if (_frameBuffer.length > MAX_BUFFER) _frameBuffer.shift();
        }
    }, 1500);
}

/**
 * captureEvidenceFrames(violationLabel)
 * Returns a Promise that resolves to an array of up to 3 frames:
 *   [0] prior frame   — from the rolling buffer (1–3s before violation)
 *   [1] at-violation  — captured right now with violation label overlay
 *   [2] post-violation — captured 1.5s later with "POST-EVENT" label
 *
 * Never rejects — returns whatever frames are available.
 */
function captureEvidenceFrames(violationLabel = 'VIOLATION') {
    const priorFrame = _frameBuffer.length > 0
        ? _frameBuffer[_frameBuffer.length - 1]   // most recent buffered frame
        : null;

    const atFrame = captureFrameWithOverlay(violationLabel);

    // Post-violation frame: captured after 1.5s delay
    return new Promise(resolve => {
        setTimeout(() => {
            const postFrame = isSubmitted ? null : captureFrameWithOverlay('POST-EVENT');
            const frames = [priorFrame, atFrame, postFrame].filter(Boolean);
            console.log(`[EvidenceCapture] ${frames.length} frame(s) captured for: ${violationLabel}`);
            resolve(frames);
        }, 1500);
    });
}

/**
 * isDebounced(violationType)
 * Returns true if this violation type fired < VIOLATION_DEBOUNCE_MS ago.
 * Prevents the same violation type from spamming the API.
 */
function isDebounced(violationType) {
    const last = _lastViolationTime[violationType] || 0;
    const now  = Date.now();
    if (now - last < VIOLATION_DEBOUNCE_MS) {
        console.log(`[Debounce] ${violationType} suppressed (last fired ${((now - last)/1000).toFixed(1)}s ago)`);
        return true;
    }
    _lastViolationTime[violationType] = now;
    return false;
}

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('camera-preview')) {
        setupSystemCheck();
    }

    if (document.getElementById('exam-camera') || document.getElementById('question-text')) {
        setupExam();
        const finishBtn = document.querySelector('button[onclick="finishExam()"]') ||
                          document.getElementById('btn-finish-exam');
        if (finishBtn) {
            finishBtn.style.position = 'relative';
            finishBtn.style.zIndex   = '100';
        }
    }
});

// ============================================================
// SYSTEM CHECK
// ============================================================

async function setupSystemCheck() {
    const statusWebcam = document.getElementById('status-webcam');
    const statusMic    = document.getElementById('status-mic');
    const proceedBtn   = document.getElementById('proceed-btn');
    const videoElem    = document.getElementById('camera-preview');
    const faceGuide    = document.getElementById('face-guide');
    const progressText = document.getElementById('progress-text');
    const progressBar  = document.getElementById('progress-bar');
    const cards        = document.querySelectorAll('.lg\\:col-span-5 .bg-white\\/5');

    let passedChecks = 0, cameraOk = false, micOk = false;

    const updateProgress = () => {
        if (progressText) progressText.textContent = `${passedChecks} of 3 Checks Passed`;
        if (progressBar)  progressBar.style.width  = `${(passedChecks / 3) * 100}%`;
    };

    updateProgress();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoElem) { videoElem.srcObject = stream; cameraOk = true; passedChecks++; }
        if (statusWebcam) { statusWebcam.textContent = 'Camera Found & Active'; statusWebcam.className = 'text-xs text-green-500/80'; }
        if (faceGuide) faceGuide.classList.add('border-emerald-500/50');
        updateProgress();
    } catch (err) {
        console.error('Webcam error:', err);
        if (statusWebcam) { statusWebcam.textContent = 'Camera Not Found or Denied'; statusWebcam.className = 'text-xs text-red-500/80'; }
        updateProgress();
    }

    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micOk = true;
        passedChecks++;
        if (statusMic) { statusMic.textContent = 'Microphone Active'; statusMic.className = 'text-xs text-green-500/80'; }
        audioStream.getTracks().forEach(t => t.stop());
        updateProgress();
    } catch (err) {
        console.error('Mic error:', err);
        if (statusMic) { statusMic.textContent = 'Microphone Not Found or Denied'; statusMic.className = 'text-xs text-red-500/80'; }
        updateProgress();
    }

    passedChecks++;
    updateProgress();

    if (cameraOk && micOk && proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// ============================================================
// EXAM SETUP
// ============================================================

async function setupExam() {
    const timerElem = document.getElementById('exam-timer');
    const videoElem = document.getElementById('exam-camera');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoElem) videoElem.srcObject = stream;
    } catch (err) { console.error('Exam camera error:', err); }

    try {
        const questionsData = await API.getQuestions(activeExamId);
        currentQuestions    = questionsData.data;

        const answersData = await API.getAnswers(activeSessionId);
        answersData.data.forEach(ans => { currentAnswers[ans.question_id] = ans; });

        renderQuestion();
        updateQuestionMap();
        startAIProctoring();
        startFrameBuffer();   // Start rolling evidence buffer
    } catch (err) { console.error('Failed to load exam data:', err); }

    // ── Timer — stored in ref so it can be cleared on Submit ──
    let timeLeft = 3600;
    _intervals.timer = setInterval(() => {
        timeLeft--;
        const h = Math.floor(timeLeft / 3600);
        const m = Math.floor((timeLeft % 3600) / 60);
        const s = timeLeft % 60;
        if (timerElem) timerElem.textContent =
            `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        if (timeLeft <= 0) {
            clearInterval(_intervals.timer);
            _intervals.timer = null;
            handleSubmitExam(true);
        }
    }, 1000);
}

// ============================================================
// QUESTION RENDERING
// ============================================================

function renderQuestion() {
    const question = currentQuestions[currentQuestionIndex];
    if (!question) return;

    const el = document.getElementById('question-text');
    if (el) el.textContent = question.text;

    const progressText = document.querySelector('.text-xs.font-bold.ml-2.text-slate-400');
    if (progressText) progressText.textContent =
        `Question ${currentQuestionIndex + 1} of ${currentQuestions.length}`;

    const barContainer = document.querySelector('.hidden.lg\\:flex.items-center.gap-2 .flex.gap-1\\.5');
    if (barContainer) {
        barContainer.innerHTML = '';
        currentQuestions.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = `h-1.5 w-6 rounded-full ${i <= currentQuestionIndex ? 'bg-primary' : 'bg-primary/20'}`;
            barContainer.appendChild(dot);
        });
    }

    const opts = document.querySelector('.space-y-4');
    if (!opts) return;
    opts.innerHTML = '';

    const saved = currentAnswers[question.id];
    question.options.forEach((option, index) => {
        const sel = saved && saved.selected_option === index;
        const label = document.createElement('label');
        label.className = `group relative flex items-center p-5 rounded-lg border ${sel ? 'border-2 border-primary bg-primary/5' : 'border-border-dark hover:border-primary/50 bg-slate-50 dark:bg-background-dark/50'} cursor-pointer transition-all`;
        label.innerHTML = `
            <input class="w-5 h-5 text-primary bg-background-dark border-border-dark focus:ring-primary focus:ring-offset-background-dark"
                   name="answer" type="radio" value="${index}" ${sel ? 'checked' : ''} onclick="onSelectOption(${index})">
            <span class="ml-4 ${sel ? 'text-primary font-medium' : 'text-slate-700 dark:text-slate-300 font-normal'}">${option}</span>
            ${sel ? '<span class="ml-auto material-icons text-primary">check_circle</span>' : ''}
        `;
        opts.appendChild(label);
    });
}

function updateQuestionMap() {
    const container = document.querySelector('.grid.grid-cols-4.gap-2');
    if (!container) return;
    container.innerHTML = '';
    currentQuestions.forEach((q, i) => {
        const btn      = document.createElement('button');
        const isCur    = i === currentQuestionIndex;
        const ans      = currentAnswers[q.id];
        const isAns    = ans && ans.selected_option !== null;
        const isFlag   = ans && ans.is_flagged;

        let cls = 'h-10 rounded text-xs font-bold transition-all ';
        if (isCur)    cls += 'border-2 border-primary bg-primary/10 text-primary';
        else if (isAns)  cls += 'border border-primary bg-primary text-white';
        else if (isFlag) cls += 'border border-amber-500/50 bg-amber-500/10 text-amber-500';
        else             cls += 'border border-border-dark bg-background-dark/30 text-slate-500';

        btn.className  = cls;
        btn.textContent = i + 1;
        btn.onclick = () => goToQuestion(i);
        container.appendChild(btn);
    });
}

async function onSelectOption(index) {
    const q = currentQuestions[currentQuestionIndex];
    const isFlagged = currentAnswers[q.id]?.is_flagged || false;
    try {
        const res = await API.submitAnswer(activeSessionId, q.id, index, isFlagged);
        currentAnswers[q.id] = res.data[0];
        renderQuestion(); updateQuestionMap();
    } catch (err) { console.error('Failed to save answer:', err); }
}

async function toggleFlag() {
    const q = currentQuestions[currentQuestionIndex];
    const ans = currentAnswers[q.id];
    const sel = ans ? ans.selected_option : null;
    const flag = !(ans?.is_flagged || false);
    try {
        const res = await API.submitAnswer(activeSessionId, q.id, sel, flag);
        currentAnswers[q.id] = res.data[0];
        updateQuestionMap();
    } catch (err) { console.error('Failed to toggle flag:', err); }
}

function nextQuestion() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion(); updateQuestionMap();
    } else {
        alert('You are at the last question. Use "Submit Exam" when ready.');
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion(); updateQuestionMap();
    }
}

function goToQuestion(i) { currentQuestionIndex = i; renderQuestion(); updateQuestionMap(); }

function clearSelection() { onSelectOption(null); }

// ============================================================
// STAGE 2 — SUBMIT EXAM
// Stops ALL monitoring immediately. No more violation events.
// ============================================================

function handleSubmitExam(isAuto = false) {
    if (isSubmitted) return; // prevent double-submit

    const answered = Object.values(currentAnswers).filter(a => a && a.selected_option !== null).length;
    const total    = currentQuestions.length;

    if (!isAuto && !confirm(
        `You have answered ${answered} of ${total} questions.\n\n` +
        `Submitting will stop all monitoring immediately.\n\nAre you sure?`
    )) return;

    // ── 1. Set submitted flag (gate for all violation paths) ──
    isSubmitted = true;
    console.log('[Exam] Submitted — stopping all monitoring immediately.');

    // ── 2. Clear ALL intervals and event listeners ─────────────
    stopAllMonitoring();

    // ── 3. Hide violation popup banner ─────────────────────────
    const banner = document.querySelector('.animate-bounce');
    if (banner) { banner.classList.add('hidden'); banner.style.display = 'none'; }

    // ── 4. Update Submit button UI ─────────────────────────────
    const submitBtn = document.getElementById('btn-submit-exam');
    if (submitBtn) {
        submitBtn.disabled   = true;
        submitBtn.innerHTML  = '<span style="margin-right:6px">✓</span> Exam Submitted';
        submitBtn.style.background    = '#059669';
        submitBtn.style.cursor        = 'not-allowed';
        submitBtn.style.opacity       = '0.85';
        submitBtn.style.pointerEvents = 'none';
    }

    // ── 5. Show persistent submitted banner ─────────────────────
    showSubmittedBanner();

    // ── 6. Enable the Finish button ────────────────────────────
    const finishBtn = document.querySelector('button[onclick="finishExam()"]') ||
                      document.getElementById('btn-finish-exam');
    if (finishBtn) {
        finishBtn.disabled            = false;
        finishBtn.style.opacity       = '1';
        finishBtn.style.pointerEvents = 'auto';
    }

    // ── 7. Notify backend ──────────────────────────────────────
    API.updateStudentStatus('submitted', 0)
       .catch(err => console.warn('[Exam] Status update failed:', err.message));

    console.log('[Exam] Stage 2 complete. Awaiting finishExam().');
}

/**
 * stopAllMonitoring()
 * Clears every setInterval and every event listener set up
 * by startAIProctoring(). Called synchronously on Submit.
 */
function stopAllMonitoring() {
    if (_intervals.audioSim)    { clearInterval(_intervals.audioSim);    _intervals.audioSim    = null; }
    if (_intervals.visualSim)   { clearInterval(_intervals.visualSim);   _intervals.visualSim   = null; }
    if (_intervals.frameBuffer) { clearInterval(_intervals.frameBuffer); _intervals.frameBuffer = null; }
    _frameBuffer.length = 0;   // Wipe buffer so no stale frames after submit

    try {
        if (_intervals.audioProcessor) {
            _intervals.audioProcessor.onaudioprocess = null;
            _intervals.audioProcessor.disconnect();
            _intervals.audioProcessor = null;
        }
        if (_intervals.audioContext && _intervals.audioContext.state !== 'closed') {
            _intervals.audioContext.close();
            _intervals.audioContext = null;
        }
    } catch (_) {}

    if (_intervals.blurHandler)  { window.removeEventListener('blur',  _intervals.blurHandler);  _intervals.blurHandler  = null; }
    if (_intervals.focusHandler) { window.removeEventListener('focus', _intervals.focusHandler); _intervals.focusHandler = null; }

    console.log('[Exam] stopAllMonitoring() complete — all intervals and listeners cleared.');
}

/**
 * showSubmittedBanner()
 * Renders a persistent green success bar below the page header.
 * Only inserted once; clicking "Finish Exam" inside it calls finishExam().
 */
function showSubmittedBanner() {
    if (document.getElementById('exam-submitted-banner')) return;
    const el = document.createElement('div');
    el.id = 'exam-submitted-banner';
    el.setAttribute('style', [
        'position:fixed', 'top:64px', 'left:0', 'right:0', 'z-index:9998',
        'background:linear-gradient(90deg,#059669 0%,#047857 100%)',
        'color:#fff', 'padding:11px 24px',
        'display:flex', 'align-items:center', 'justify-content:center', 'gap:10px',
        'font-weight:600', 'font-size:13px', 'letter-spacing:0.04em',
        'box-shadow:0 4px 20px rgba(5,150,105,0.35)'
    ].join(';'));
    el.innerHTML = `
        <span class="material-icons" style="font-size:17px;line-height:1">check_circle</span>
        Exam Submitted — Monitoring Stopped &nbsp;|&nbsp;
        Click
        <span onclick="finishExam()"
              style="text-decoration:underline;cursor:pointer;font-weight:700;margin:0 4px">
            Finish Exam
        </span>
        to end your session.
    `;
    document.body.insertBefore(el, document.body.firstChild);
}

// ============================================================
// STAGE 3 — FINISH EXAM
// Ends the session and navigates away.
// ============================================================

async function finishExam(isAuto = false) {
    // If somehow called before Submit, do Submit first
    if (!isSubmitted) {
        handleSubmitExam(isAuto);
        if (!isSubmitted) return; // user cancelled confirm dialog
    }

    try {
        await API.updateStudentStatus('completed', 0);
        isExamActive = false;

        localStorage.removeItem('session_id');
        localStorage.removeItem('activeSessionId');
        sessionStorage.removeItem('session_id');

        console.log('[Exam] Stage 3 — session ended. Navigating home.');
        window.location.href = 'index.html';
    } catch (err) {
        console.error('[Exam] Finish failed:', err);
        window.location.href = 'index.html';
    }
}

// ============================================================
// AI PROCTORING — Stage 1 only
// canTrigger() gates ALL violation paths.
// ============================================================

function startAIProctoring() {
    // Use the named banner element (ID added in HTML)
    const banner     = document.getElementById('violation-alert-banner') ||
                       document.querySelector('.animate-bounce');
    const bannerText = banner ? banner.querySelector('p') : null;
    const riskBadge  = document.querySelector('[class*="bg-emerald-500"][class*="text-emerald-500"]');

    let riskScore = 0;

    // ── Gate: only fire if in Stage 1 ───────────────────────────
    function canTrigger() {
        return isExamActive && !isSubmitted;
    }

    // ── Show banner popup ────────────────────────────────────────
    function showAlert(msg, isCritical = false) {
        if (!canTrigger()) return; // NEVER show after submit
        if (banner) banner.classList.remove('hidden');
        if (bannerText) bannerText.textContent = msg;
        setTimeout(() => {
            if (banner) banner.classList.add('hidden');
        }, isCritical ? 6000 : 4000);
    }

    // ── Core violation trigger ───────────────────────────────────
    async function triggerViolation(violationType, confidence, alertMsg, isCritical = false) {
        if (!canTrigger()) {
            console.log(`[Exam] Blocked post-submit violation: ${violationType}`);
            return;
        }

        // Apply debounce per violation type
        if (isDebounced(violationType)) return;

        riskScore += isCritical ? 20 : 10;
        showAlert(alertMsg, isCritical);
        updateRiskUI();

        if (typeof API !== 'undefined' && API.logViolation) {
            // Capture multi-frame evidence (Prior, At, Post)
            const frames = await captureEvidenceFrames(violationType.toUpperCase().replace(/_/g, ' '));

            API.logViolation(activeSessionId, violationType, confidence / 100, frames)
               .then(res => {
                   if (res?.data?.evidence_urls) {
                       console.log(`[Exam] Evidence stored: ${res.data.evidence_urls.length} frames`);
                   }
               })
               .catch(err => console.warn('[Exam] Violation API failed:', err.message));
        }
    }


    // ── 1. Browser Focus Detection ───────────────────────────────
    _intervals.blurHandler = () => {
        triggerViolation('tab_switching', 85, 'Switching browser tabs is strictly prohibited!', true);
    };
    _intervals.focusHandler = () => {
        setTimeout(() => { if (banner) banner.classList.add('hidden'); }, 3000);
    };
    window.addEventListener('blur',  _intervals.blurHandler);
    window.addEventListener('focus', _intervals.focusHandler);

    // ── 2. Simulated Audio + Heartbeat (10s) ────────────────────
    _intervals.audioSim = setInterval(() => {
        if (!canTrigger()) return;

        if (Math.random() < 0.05) {
            const pick = [
                { t: 'unusual_sound',       c: 88, m: 'Warning: Unusual Sound Detected!' },
                { t: 'unauthorized_device', c: 91, m: 'Warning: Mobile Device Detected!' },
                { t: 'multiple_faces',      c: 94, m: 'Warning: Multiple Faces Detected!' }
            ][Math.floor(Math.random() * 3)];
            triggerViolation(pick.t, pick.c, pick.m, false);
        }

        if (canTrigger()) {
            API.updateStudentStatus(riskScore > 50 ? 'flagged' : 'active', riskScore)
               .catch(() => {});
        }
    }, 10000);

    // ── 3. Simulated Visual Detection (15s) ──────────────────────
    _intervals.visualSim = setInterval(() => {
        if (!canTrigger()) return;

        if (Math.random() < 0.03) {
            const pick = [
                { t: 'face_not_detected',  c: 100, m: 'CRITICAL: Face Not Detected! Please face the camera.' },
                { t: 'face_out_of_frame',  c: 92,  m: 'CRITICAL: Face Out of Frame! Return to camera view.' },
                { t: 'multiple_faces',     c: 97,  m: 'CRITICAL: Multiple Persons Detected! Incident recorded.' },
                { t: 'eye_gaze_deviation', c: 76,  m: 'Warning: Looking Away — focus on the screen.' }
            ][Math.floor(Math.random() * 4)];
            triggerViolation(pick.t, pick.c, pick.m, true);
        }
    }, 15000);

    // ── 4. Real Audio Monitoring (WebAudio API) ──────────────────
    (async function monitorAudio() {
        try {
            const stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx     = new (window.AudioContext || window.webkitAudioContext)();
            _intervals.audioContext = ctx;

            const analyser   = ctx.createAnalyser();
            const mic        = ctx.createMediaStreamSource(stream);
            const processor  = ctx.createScriptProcessor(2048, 1, 1);
            _intervals.audioProcessor = processor;

            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;
            mic.connect(analyser);
            analyser.connect(processor);
            processor.connect(ctx.destination);

            processor.onaudioprocess = () => {
                if (!canTrigger()) {
                    processor.onaudioprocess = null;
                    try { processor.disconnect(); } catch (_) {}
                    return;
                }
                const data = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(data);
                const avg = data.reduce((s, v) => s + v, 0) / data.length;
                if (avg > 30) {
                    riskScore += 2;
                    if (Math.random() < 0.1) {
                        triggerViolation(
                            'unusual_sound',
                            Math.min(60 + avg, 100),
                            'Unusual sound detected! Please maintain silence.',
                            false
                        );
                    }
                    updateRiskUI();
                }
            };
        } catch (e) { console.error('Audio monitoring failed:', e); }
    })();

    function updateRiskUI() {
        if (!riskBadge) return;
        if (riskScore > 50) {
            riskBadge.className  = 'px-2 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-black rounded-full uppercase';
            riskBadge.textContent = 'High Risk';
        } else if (riskScore > 20) {
            riskBadge.className  = 'px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-black rounded-full uppercase';
            riskBadge.textContent = 'Medium Risk';
        }
    }
}
