// ============================================================
// api.js — ProctorAI Unified API Service
// Auto-detects environment:
//   → Development (localhost / 127.0.0.1): uses local backend
//   → GitHub Pages / Production: uses BACKEND_URL below
// Auth: Bearer token from localStorage ('authToken')
// ============================================================

// ┌─────────────────────────────────────────────────────────┐
// │  PRODUCTION BACKEND URL                                 │
// │  Deploy your backend to Railway/Render, then paste URL  │
// └─────────────────────────────────────────────────────────┘
const PRODUCTION_BACKEND_URL = 'https://YOUR-BACKEND.up.railway.app/api';

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocal ? 'http://localhost:5000/api' : PRODUCTION_BACKEND_URL;

class API {

    // ── Token ────────────────────────────────────────────────
    static get token() {
        return localStorage.getItem('authToken');
    }

    static get currentUser() {
        try { return JSON.parse(localStorage.getItem('userData') || '{}'); }
        catch { return {}; }
    }

    static get currentUserId() {
        return this.currentUser.id || null;
    }

    // ── Core Request ─────────────────────────────────────────
    static async request(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

            // Handle non-JSON or empty responses
            const text = await response.text();
            const data = text ? JSON.parse(text) : {};

            if (!response.ok) {
                const msg = data.error || data.message || `HTTP ${response.status}`;
                throw new Error(msg);
            }

            return data;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('Invalid response from server');
            }
            console.error(`[API] ${method} ${endpoint} →`, error.message);
            throw error;
        }
    }

    // ── Toast Notification Helper ────────────────────────────
    static toast(message, type = 'info') {
        const colors = {
            success: 'bg-emerald-600',
            error:   'bg-red-600',
            info:    'bg-primary',
            warning: 'bg-amber-500',
        };
        const el = document.createElement('div');
        el.className = `fixed top-6 right-6 z-[999] px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-medium flex items-center gap-2 ${colors[type] || colors.info}`;
        el.innerHTML = `<span class="material-icons-round text-sm">${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}</span>${message}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    // ============================================================
    // AUTH
    // ============================================================

    static async login(email, password, role) {
        return this.request('/auth/login', 'POST', { email, password, role });
    }

    // ============================================================
    // DASHBOARD  →  GET /api/stats/dashboard  (+ composed data)
    // ============================================================

    /**
     * getDashboardStats()
     * Returns: { active_sessions, pending_violations, total_students }
     * Also fetches violations to compute chart data + AI confidence distribution.
     */
    static async getDashboardStats() {
        return this.request('/stats/dashboard');
    }

    /**
     * getFullDashboard()
     * Composes dashboard data from multiple endpoints for the Admin Dashboard page.
     * Returns a unified object that the admin.js renderDashboard() function consumes.
     */
    static async getFullDashboard() {
        const [statsRes, violationsRes, sessionsRes] = await Promise.allSettled([
            this.request('/stats/dashboard'),
            this.request('/violations'),
            this.request('/monitoring/active-sessions'),
        ]);

        const stats      = statsRes.status      === 'fulfilled' ? statsRes.value      : {};
        const violations = violationsRes.status  === 'fulfilled' ? violationsRes.value.data || [] : [];
        const sessions   = sessionsRes.status    === 'fulfilled' ? sessionsRes.value.data   || [] : [];

        // ── KPIs
        const totalExams       = stats.active_sessions   ?? sessions.length;
        const totalViolations  = violations.length;
        const pendingViolations = stats.pending_violations ?? violations.filter(v => v.status === 'pending').length;

        // High-risk = confidence ≥ 80
        const highRiskStudents = violations.filter(v => (v.confidence || 0) >= 80).length;

        // ── Violations per day (last 7 days)
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const buckets = {};
        days.forEach(d => (buckets[d] = 0));

        violations.forEach(v => {
            const ts   = new Date(v.timestamp || v.created_at);
            const day  = ts.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
            if (buckets[day] !== undefined) buckets[day]++;
        });

        const violationsPerDay = days.map(d => ({ day: d, count: buckets[d] }));
        const maxCount         = Math.max(...violationsPerDay.map(d => d.count), 1);

        // ── AI Confidence Distribution
        const high   = violations.filter(v => (v.confidence || 0) >= 80).length;
        const medium = violations.filter(v => (v.confidence || 0) >= 50 && (v.confidence || 0) < 80).length;
        const low    = violations.filter(v => (v.confidence || 0) < 50).length;
        const total  = violations.length || 1;

        const aiConfidence = {
            high:   Math.round((high   / total) * 100),
            medium: Math.round((medium / total) * 100),
            low:    Math.round((low    / total) * 100),
        };

        // ── Recent critical alerts (top 10, sorted by confidence desc)
        const recentAlerts = [...violations]
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 10);

        return {
            totalExams,
            totalViolations,
            pendingViolations,
            highRiskStudents,
            violationsPerDay,
            maxCount,
            aiConfidence,
            recentAlerts,
        };
    }

    // ============================================================
    // VIOLATIONS  →  GET /api/violations  |  GET /api/violations/:id
    // ============================================================

    /**
     * getViolations(filters)
     * @param {Object} filters – { risk_level, student_id, exam_id, page, pageSize }
     */
    static async getViolations(filters = {}) {
        const { page = 1, pageSize = 20, ...apiFilters } = filters;
        const query = new URLSearchParams(apiFilters).toString();
        const response = await this.request(`/violations?${query}`);
        const data = response.data || [];

        // Client-side pagination
        const total     = data.length;
        const totalPages = Math.ceil(total / pageSize);
        const start     = (page - 1) * pageSize;
        const paginated = data.slice(start, start + pageSize);

        return { data: paginated, total, totalPages, page, pageSize };
    }

    /**
     * getViolationDetails(id)
     * Returns full violation object with joined users + exams.
     */
    static async getViolationDetails(id) {
        return this.request(`/violations/${id}`);
    }

    // Alias used by older code
    static async getViolation(id) {
        return this.getViolationDetails(id);
    }

    /**
     * updateViolationStatus(id, action)
     * @param {string} id     – violation UUID
     * @param {string} action – 'confirm' | 'dismiss'
     */
    static async updateViolationStatus(id, action) {
        if (action === 'confirm') return this.request(`/violations/${id}/confirm`, 'PUT');
        if (action === 'dismiss') return this.request(`/violations/${id}/dismiss`, 'PUT');
        throw new Error(`Unknown action: ${action}`);
    }

    // Explicit aliases for backwards compat
    static async confirmViolation(id) { return this.updateViolationStatus(id, 'confirm'); }
    static async dismissViolation(id) { return this.updateViolationStatus(id, 'dismiss'); }

    // ============================================================
    // LIVE MONITORING  →  GET /api/monitoring/active-sessions
    // ============================================================

    /**
     * getLiveSessions()
     * Returns array of active exam sessions with joined user + status data.
     */
    static async getLiveSessions() {
        return this.request('/monitoring/active-sessions');
    }

    // Alias
    static async getActiveSessions() { return this.getLiveSessions(); }

    /**
     * getSessionAlerts()
     * Fetches latest pending violations to use as real-time alerts in the sidebar.
     */
    static async getSessionAlerts() {
        const response = await this.request('/violations?status=pending&limit=10');
        return { data: (response.data || []).slice(0, 10) };
    }

    /**
     * performViolationAction(sessionId, action)
     * POST /api/monitoring/flag-student  or  /api/monitoring/send-alert
     * @param {string} sessionId
     * @param {string} action – 'flag' | 'dismiss'
     * @param {string} reason – optional reason text
     */
    static async performViolationAction(sessionId, action, reason = 'Manual review') {
        if (action === 'flag') {
            return this.request('/monitoring/flag-student', 'POST', {
                student_id: sessionId,
                exam_id:    'current',
                reason,
            });
        }
        if (action === 'dismiss') {
            return this.request('/monitoring/send-alert', 'POST', {
                student_id: sessionId,
                message:    `Alert dismissed: ${reason}`,
                type:       'dismiss',
            });
        }
        throw new Error(`Unknown action: ${action}`);
    }

    /**
     * flagStudent(studentId, examId, reason)  — convenience wrapper
     */
    static async flagStudent(studentId, examId = 'current', reason = 'Suspicious Activity - Manual Flag') {
        return this.request('/monitoring/flag-student', 'POST', {
            student_id: studentId,
            exam_id:    examId,
            reason,
        });
    }

    /**
     * sendAlert(studentId, message, type)
     */
    static async sendAlert(studentId, message, type = 'info') {
        return this.request('/monitoring/send-alert', 'POST', { student_id: studentId, message, type });
    }

    // ============================================================
    // STUDENTS  &  EXAMS
    // ============================================================

    static async getStudents()         { return this.request('/students'); }
    static async getExams()            { return this.request('/exams'); }
    static async getExamStudents(id)   { return this.request(`/exams/${id}/students`); }
    static async getQuestions(examId)  { return this.request(`/exams/${examId}/questions`); }

    static async submitAnswer(sessionId, questionId, selectedOption, isFlagged = false) {
        return this.request(`/exam-sessions/${sessionId}/answers`, 'POST', {
            question_id:     questionId,
            selected_option: selectedOption,
            is_flagged:      isFlagged,
        });
    }

    static async getAnswers(sessionId) { return this.request(`/exam-sessions/${sessionId}/answers`); }

    // ============================================================
    // PROCTOR ACTIONS (legacy compatibility)
    // ============================================================

    static async updateStudentStatus(status, riskScore) {
        return this.request('/monitoring/student-status', 'POST', {
            student_id:    this.currentUserId,
            status,
            risk_score:    riskScore,
            last_activity: new Date().toISOString(),
        });
    }

    static async recordViolation(type, confidence, evidence_url = '') {
        return this.request('/violations', 'POST', {
            student_id: this.currentUserId,
            exam_id:    'current',
            type,
            confidence,
            evidence_url,
        });
    }

    /**
     * logViolation(sessionId, violationType, confidenceScore, evidenceImage)
     * Primary endpoint for all violation logging.
     * Calls POST /api/log-violation which:
     *   - Accepts face_not_detected, multiple_faces, face_out_of_frame, unusual_sound, etc.
     *   - If evidenceImage (base64 data URL) is provided: stores it server-side and returns
     *     a real self-hosted URL (http://localhost:5000/api/evidence/...)
     *   - If no image: auto-generates a deterministic picsum.photos placeholder
     *   - Updates student risk score in student_status table
     *
     * @param {string}  sessionId      - exam session ID
     * @param {string}  violationType  - snake_case violation key
     * @param {number}  confidenceScore - float 0.0–1.0
     * @param {string|null} [evidenceImage] - webcam frame as base64 data URL
     *                                        e.g. "data:image/jpeg;base64,/9j/..."
    /**
     * logViolation(sessionId, violationType, confidenceScore, evidenceData)
     * @param {string|string[]} [evidenceData] - Base64 frame(s). Can be single string or array of strings.
     */
    static async logViolation(sessionId, violationType, confidenceScore, evidenceData = null) {
        const payload = {
            session_id:       sessionId,
            violation_type:   violationType,
            confidence_score: confidenceScore,
        };

        if (Array.isArray(evidenceData)) {
            payload.evidence_frames = evidenceData.filter(Boolean); // array of base64 strings
        } else if (typeof evidenceData === 'string' && evidenceData.startsWith('data:')) {
            payload.evidence_image = evidenceData; // backward compatibility
        }

        return this.request('/log-violation', 'POST', payload);
    }
}

