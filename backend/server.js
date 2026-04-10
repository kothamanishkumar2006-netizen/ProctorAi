const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'https://kothamanishkumar2006-netizen.github.io'
    ],
    credentials: true
}));
// Increase limit to 5MB to handle webcam screenshot base64 payloads
app.use(express.json({ limit: '5mb' }));

const supabase = require('./supabase');

// ============================================================
// IN-MEMORY EVIDENCE STORE
// Maps filename → { buffer: Buffer, mimeType: string }
// Each violation gets its own captured frame.
// Images persist as long as the server is running.
// In production this is replaced by Supabase Storage.
// ============================================================
const evidenceStore = new Map();

// ── Serve captured evidence images ──────────────────────────
// GET /api/evidence/:filename
// Returns the raw image bytes with correct Content-Type.
// The URL stored in violations.evidence_url points here.
app.get('/api/evidence/:filename', (req, res) => {
    const { filename } = req.params;
    const record = evidenceStore.get(filename);
    if (!record) {
        return res.status(404).json({ error: 'Evidence not found' });
    }
    res.set('Content-Type', record.mimeType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(record.buffer);
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;

        // Query users table
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('role', role)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // In production, use proper password hashing (bcrypt)
        if (data.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Return user data (exclude password)
        const { password: _, ...userData } = data;
        res.json({
            message: 'Login successful',
            user: userData,
            token: 'mock-jwt-token-' + data.id // In production, use real JWT
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STUDENT MANAGEMENT ENDPOINTS
// ============================================

// Get all students
app.get('/api/students', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'student')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get student by ID
app.get('/api/students/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.params.id)
            .eq('role', 'student')
            .single();

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new student
app.post('/api/students', async (req, res) => {
    try {
        const studentData = { ...req.body, role: 'student' };
        const { data, error } = await supabase
            .from('users')
            .insert([studentData])
            .select();

        if (error) throw error;
        res.status(201).json({ message: 'Student created', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// EXAM MANAGEMENT ENDPOINTS
// ============================================

// Get all exams
app.get('/api/exams', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exams')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get exam by ID
app.get('/api/exams/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exams')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new exam
app.post('/api/exams', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exams')
            .insert([req.body])
            .select();

        if (error) throw error;
        res.status(201).json({ message: 'Exam created', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get students in exam
app.get('/api/exams/:id/students', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_sessions')
            .select(`
                *,
                users (*)
            `)
            .eq('exam_id', req.params.id);

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get questions for an exam
app.get('/api/exams/:id/questions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .eq('exam_id', req.params.id);

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// EXAM SESSION & ANSWERS ENDPOINTS
// ============================================

// Submit or update an answer
app.post('/api/exam-sessions/:sessionId/answers', async (req, res) => {
    try {
        const { question_id, selected_option, is_flagged } = req.body;
        const sessionId = req.params.sessionId;

        const { data, error } = await supabase
            .from('answers')
            .upsert([{
                session_id: sessionId,
                question_id,
                selected_option,
                is_flagged,
                updated_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;
        res.json({ message: 'Answer saved', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all answers for a session
app.get('/api/exam-sessions/:sessionId/answers', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('answers')
            .select('*')
            .eq('session_id', req.params.sessionId);

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// VIOLATION MANAGEMENT ENDPOINTS
// ============================================

// Get all violations with optional filters
app.get('/api/violations', async (req, res) => {
    try {
        const { risk_level, student_id, exam_id, status, session_id } = req.query;

        let query = supabase
            .from('violations')
            .select(`
                *,
                users (id, name, email, student_id),
                exams (id, title, course_code)
            `)
            .order('created_at', { ascending: false });

        if (risk_level)  query = query.eq('risk_level',  risk_level);
        if (student_id)  query = query.eq('student_id',  student_id);
        if (exam_id)     query = query.eq('exam_id',     exam_id);
        if (status)      query = query.eq('status',      status);
        if (session_id)  query = query.eq('session_id',  session_id);


        const { data, error } = await query;

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get violation by ID — with evidence_url enrichment
app.get('/api/violations/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('violations')
            .select(`
                *,
                users (id, name, email, student_id),
                exams (id, title, course_code)
            `)
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Violation not found' });

        // ── Evidence URL enrichment
        // If a real Supabase Storage URL exists, generate a public URL.
        // Otherwise fall back to a deterministic placeholder image.
        if (!data.evidence_url || data.evidence_url.trim() === '') {
            const violationType = (data.type || 'violation').replace(/\s+/g, '_').toLowerCase();
            // Use a reliable placeholder that always returns an image
            data.evidence_url = `https://picsum.photos/seed/${data.id}/800/450`;
            data.evidence_url_generated = true; // flag for frontend debugging
        }

        // If using real Supabase Storage (not mock), uncomment this:
        // if (data.evidence_path && !data.evidence_url) {
        //     const { data: urlData } = supabase.storage
        //         .from('evidence')
        //         .getPublicUrl(data.evidence_path);
        //     data.evidence_url = urlData.publicUrl;
        // }

        console.log(`[Violation ${data.id?.slice(0,8)}] evidence_url: ${data.evidence_url}`);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Insert new violation (also auto-generates evidence_url if missing)
app.post('/api/violations', async (req, res) => {
    try {
        const { student_id, type, confidence, exam_id, evidence_url, timestamp } = req.body;

        // Generate a deterministic placeholder evidence image if none provided
        const seed      = `${student_id}-${Date.now()}`;
        const finalUrl  = evidence_url || `https://picsum.photos/seed/${seed}/800/450`;

        const { data, error } = await supabase
            .from('violations')
            .insert([{
                student_id,
                type,
                confidence,
                exam_id,
                evidence_url: finalUrl,
                timestamp: timestamp || new Date().toISOString(),
                status: 'pending'
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ message: 'Violation recorded', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Confirm violation
app.put('/api/violations/:id/confirm', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('violations')
            .update({ status: 'confirmed', reviewed_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select();

        if (error) throw error;
        res.json({ message: 'Violation confirmed', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dismiss violation as false positive
app.put('/api/violations/:id/dismiss', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('violations')
            .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select();

        if (error) throw error;
        res.json({ message: 'Violation dismissed', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete violation
app.delete('/api/violations/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('violations')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ message: 'Violation deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// MONITORING ENDPOINTS
// ============================================

// Get active exam sessions
app.get('/api/monitoring/active-sessions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_sessions')
            .select(`
                *,
                users (id, name, email, student_id),
                exams (id, title, course_code),
                student_status (*)
            `)
            .eq('status', 'active')
            .order('started_at', { ascending: false });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get student status
app.get('/api/monitoring/student/:id/status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('student_status')
            .select('*')
            .eq('student_id', req.params.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update student status
app.post('/api/monitoring/student-status', async (req, res) => {
    try {
        const { student_id, status, risk_score, last_activity } = req.body;

        const { data, error } = await supabase
            .from('student_status')
            .upsert([{
                student_id,
                status,
                risk_score,
                last_activity,
                updated_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;
        res.json({ message: 'Status updated', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Flag student for review
app.post('/api/monitoring/flag-student', async (req, res) => {
    try {
        const { student_id, exam_id, reason } = req.body;

        // Create a violation record
        const { data, error } = await supabase
            .from('violations')
            .insert([{
                student_id,
                exam_id,
                type: reason,
                confidence: 100,
                status: 'flagged',
                timestamp: new Date().toISOString()
            }])
            .select();

        if (error) throw error;
        res.json({ message: 'Student flagged', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send alert to student
app.post('/api/monitoring/send-alert', async (req, res) => {
    try {
        const { student_id, message, type } = req.body;
        console.log(`Alert sent to student ${student_id}: ${message}`);
        res.json({ message: 'Alert sent successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// VIOLATION LOGGING ENDPOINT (Monitoring page)
// POST /api/log-violation
// Accepts all violation types including face detection events.
// Stores in violations table and updates student_status risk score.
// ============================================

// Allowed violation types (no filtering — all are accepted and stored)
const VIOLATION_TYPES = [
    'face_not_detected',
    'multiple_faces',
    'face_out_of_frame',
    'unusual_sound',
    'unauthorized_device',
    'tab_switching',
    'copy_paste_detected',
    'eye_gaze_deviation',
    'suspicious_activity'
];

const VIOLATION_LABELS = {
    face_not_detected:    'Face Not Detected',
    multiple_faces:       'Multiple Faces Detected',
    face_out_of_frame:    'Face Out of Frame',
    unusual_sound:        'Unusual Sound Detected',
    unauthorized_device:  'Unauthorized Device Detected',
    tab_switching:        'Tab Switching Detected',
    copy_paste_detected:  'Copy-Paste Activity',
    eye_gaze_deviation:   'Eye Gaze Deviation',
    suspicious_activity:  'Suspicious Activity'
};

app.post('/api/log-violation', async (req, res) => {
    try {
        const {
            session_id,
            violation_type,
            confidence_score,
            evidence_url,
            student_id:   bodyStudentId,
            exam_id:      bodyExamId,
            exam_submitted          // optional safety flag sent by frontend after submit
        } = req.body;

        // ── Backend Safety Check (Stage 8) ─────────────────────────
        // If the client signals the exam is already submitted, silently
        // ignore the request — no violation recorded, no error thrown.
        // This catches any in-flight requests that arrive after the
        // frontend clears its intervals.
        if (exam_submitted === true) {
            console.log(`[log-violation] Ignored: exam already submitted (session: ${session_id || bodyStudentId})`);
            return res.status(200).json({ message: 'Ignored: exam already submitted', skipped: true });
        }

        if (!session_id && !bodyStudentId) {
            return res.status(400).json({ error: 'session_id or student_id required' });
        }

        // Resolve student_id and exam_id from session if not provided directly
        let student_id = bodyStudentId;
        let exam_id    = bodyExamId;

        if (session_id && (!student_id || !exam_id)) {
            const { data: session } = await supabase
                .from('exam_sessions')
                .select('student_id, exam_id')
                .eq('id', session_id)
                .single();
            if (session) {
                student_id = student_id || session.student_id;
                exam_id    = exam_id    || session.exam_id;
            }
        }

        // Normalize type: accept both snake_case and display label
        const type  = VIOLATION_LABELS[violation_type] || violation_type || 'Unknown Violation';
        const conf  = Math.round((parseFloat(confidence_score) || 0.85) * 100); // store as 0-100

        // ── Extract and store multi-frame base64 screenshots ─────────
        //
        //  evidence_frames: optional array of base64 data URLs.
        //  evidence_image:  optional single base64 data URL (legacy).
        //
        let finalEvidenceUrls = [];
        let framesToProcess = [];

        // Normalize input
        if (req.body.evidence_frames && Array.isArray(req.body.evidence_frames)) {
            framesToProcess = req.body.evidence_frames;
        } else if (req.body.evidence_image) {
            framesToProcess = [req.body.evidence_image];
        } else if (evidence_url) {
            finalEvidenceUrls = [evidence_url]; // Respect passed URL if exists
        }

        const host = req.headers.origin || `http://localhost:${process.env.PORT || 5000}`;

        for (let i = 0; i < framesToProcess.length; i++) {
            const dataUrl = framesToProcess[i];
            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

            if (matches) {
                const mimeType = matches[1];                          // e.g. 'image/jpeg'
                const b64data  = matches[2];
                const buffer   = Buffer.from(b64data, 'base64');
                const ext      = mimeType.split('/')[1] || 'jpg';
                const filename = `viol_${student_id || session_id}_${Date.now()}_${i}.${ext}`;

                evidenceStore.set(filename, { buffer, mimeType });
                finalEvidenceUrls.push(`${host}/api/evidence/${filename}`);
                console.log(`[Evidence] Stored ${(buffer.length / 1024).toFixed(1)} KB → ${filename}`);
            } else {
                console.warn('[Evidence] Invalid base64 format in frame array');
            }
        }

        // Picsum fallback (if no frames received or all parsing failed)
        if (finalEvidenceUrls.length === 0) {
            const seed = `${student_id || session_id}-${Date.now()}`;
            finalEvidenceUrls.push(`https://picsum.photos/seed/${seed}/800/450`);
        }

        const firstEvidenceUrl = finalEvidenceUrls[0];

        // Determine risk score contribution (face violations are HIGH risk)
        const faceTypes  = ['face_not_detected', 'multiple_faces', 'face_out_of_frame'];
        const riskBoost  = faceTypes.includes(violation_type) ? 30 : 15;

        // Insert into violations table
        const { data: violationData, error: violationError } = await supabase
            .from('violations')
            .insert([{
                student_id,
                exam_id,
                session_id,     // Bind violation to session
                type,
                confidence: conf,
                evidence_url: firstEvidenceUrl,
                evidence_urls: finalEvidenceUrls,
 // New JSONB array field
                timestamp:   new Date().toISOString(),
                status:      'pending'
            }])
            .select();

        if (violationError) throw violationError;

        // Update student_status risk score
        if (student_id) {
            const { data: existingStatus } = await supabase
                .from('student_status')
                .select('risk_score')
                .eq('student_id', student_id)
                .single();

            const currentRisk = existingStatus?.risk_score || 0;
            const newRisk     = Math.min(100, currentRisk + riskBoost);

            await supabase
                .from('student_status')
                .upsert([{
                    student_id,
                    risk_score:    newRisk,
                    status:        newRisk >= 70 ? 'flagged' : 'active',
                    alert_message: type,
                    last_activity: new Date().toISOString(),
                    updated_at:    new Date().toISOString()
                }]);
        }

        console.log(`[ViolationLog] ${type} | Student: ${student_id} | Conf: ${conf}% | Evidence: ${firstEvidenceUrl}`);

        // Build the response record
        const responseRecord = {
            ...(violationData?.[0] || {}),
            evidence_url:  firstEvidenceUrl,          // guaranteed backward compatible
            evidence_urls: finalEvidenceUrls,         // array of frames
            type:         type,
            confidence:   conf,
            status:       'pending',
            student_id,
            exam_id,
            timestamp:    new Date().toISOString(),
        };
        // Preserve the generated ID from the inserted record (if available)
        if (violationData?.[0]?.id) responseRecord.id = violationData[0].id;

        res.status(201).json({
            message:    'Violation logged',
            data:        responseRecord,
            type_label:  type,
            risk_level:  conf >= 80 ? 'high' : conf >= 50 ? 'medium' : 'low'
        });
    } catch (err) {
        console.error('[log-violation] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STATISTICS ENDPOINTS
// ============================================

// Get dashboard statistics
app.get('/api/stats/dashboard', async (req, res) => {
    try {
        // Get counts for active sessions, violations, etc.
        // Sequential awaits — safe for both mock and real Supabase
        const sessionsResult   = await supabase.from('exam_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const violationsResult = await supabase.from('violations').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        const studentsResult   = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student');

        res.json({
            active_sessions:    sessionsResult.count    || 0,
            pending_violations: violationsResult.count  || 0,
            total_students:     studentsResult.count    || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── Rich Admin Dashboard endpoint
// GET /api/dashboard
// Returns: KPIs + violations_per_day (7 days) + ai_confidence + recent_alerts
app.get('/api/dashboard', async (req, res) => {
    try {
        // Sequential awaits — safe for both mock and real Supabase
        const sessionsRes   = await supabase.from('exam_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const violationsRes = await supabase.from('violations').select(`
            id, type, confidence, status, timestamp, created_at,
            users (id, name, student_id),
            exams (id, title, course_code)
        `).order('created_at', { ascending: false });
        const studentsRes   = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student');
        const examsRes      = await supabase.from('exams').select('*', { count: 'exact', head: true });


        if (violationsRes.error) throw violationsRes.error;

        const violations = violationsRes.data || [];

        // ── KPIs
        const totalViolations   = violations.length;
        const pendingViolations  = violations.filter(v => v.status === 'pending').length;
        const highRiskStudents   = violations.filter(v => (v.confidence || 0) >= 80).length;

        // ── Violations per day (last 7 days)
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const buckets  = {};
        const today    = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            buckets[d.toDateString()] = 0;
        }
        violations.forEach(v => {
            const ts  = new Date(v.timestamp || v.created_at);
            const key = ts.toDateString();
            if (buckets[key] !== undefined) buckets[key]++;
        });
        const violationsPerDay = Object.entries(buckets).map(([dateStr, count]) => ({
            day: dayNames[new Date(dateStr).getDay()],
            count
        }));

        // ── AI Confidence distribution
        const high   = violations.filter(v => (v.confidence || 0) >= 80).length;
        const medium = violations.filter(v => (v.confidence || 0) >= 50 && (v.confidence || 0) < 80).length;
        const low    = violations.filter(v => (v.confidence || 0) < 50).length;
        const total  = violations.length || 1;

        // ── Recent alerts (top 10 by confidence desc)
        const recentAlerts = [...violations]
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 10);

        res.json({
            total_exams:        examsRes.count    || 0,
            total_violations:   totalViolations,
            pending_violations: pendingViolations,
            high_risk_students: highRiskStudents,
            active_sessions:    sessionsRes.count || 0,
            total_students:     studentsRes.count || 0,
            violations_per_day: violationsPerDay,
            ai_confidence: {
                high:   Math.round((high   / total) * 100),
                medium: Math.round((medium / total) * 100),
                low:    Math.round((low    / total) * 100)
            },
            recent_alerts: recentAlerts
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
