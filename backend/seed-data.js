const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function seed() {
    console.log('🌱 Starting Robust Database Seed...');

    // --- PHASE 1: USERS ---
    console.log('Phase 1: Checking Users...');
    let users = [];
    const { data: existingUsers, error: userFetchError } = await supabase.from('users').select('*');

    if (userFetchError) {
        console.error('❌ Error connecting to DB:', userFetchError.message);
        return;
    }

    if (existingUsers && existingUsers.length > 0) {
        console.log(`✅ Found ${existingUsers.length} existing users. Using them.`);
        users = existingUsers;
    } else {
        console.log('Creating users...');
        const newUsers = [
            { email: 'student1@university.edu', password: 'password123', name: 'Jane Doe', role: 'student', student_id: '2024-8839' },
            { email: 'student2@university.edu', password: 'password123', name: 'Marcus Thorne', role: 'student', student_id: '2024-7721' },
            { email: 'student3@university.edu', password: 'password123', name: 'Elena Gilbert', role: 'student', student_id: '2024-1102' },
            { email: 'proctor@example.com', password: 'password123', name: 'Dr. Sarah Smith', role: 'proctor', student_id: null },
            { email: 'admin@example.com', password: 'password123', name: 'Dr. Harrison', role: 'admin', student_id: null }
        ];

        const { data: createdUsers, error: createError } = await supabase.from('users').insert(newUsers).select();
        if (createError) {
            console.error('Error creating users:', createError.message);
            return;
        }
        users = createdUsers;
        console.log(`✅ Created ${users.length} users.`);
    }

    // --- PHASE 2: EXAMS ---
    console.log('Phase 2: Checking Exams...');
    let exams = [];
    const { data: existingExams } = await supabase.from('exams').select('*');

    if (existingExams && existingExams.length > 0) {
        console.log(`✅ Found ${existingExams.length} existing exams. Using them.`);
        exams = existingExams;
    } else {
        console.log('Creating exam...');
        const newExams = [
            {
                title: 'Final Exam: Advanced Computer Science',
                course_code: 'CS101-2023-F',
                description: 'Comprehensive final examination',
                duration_minutes: 120,
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 7200000).toISOString() // +2 hours
            }
        ];

        const { data: createdExams, error: examError } = await supabase.from('exams').insert(newExams).select();
        if (examError) {
            console.error('Error creating exams:', examError.message);
            return;
        }
        exams = createdExams;
        console.log(`✅ Created ${exams.length} exams.`);
    }

    // --- PHASE 3: SESSIONS ---
    console.log('Phase 3: Checking Active Sessions...');
    const examId = exams[0].id;

    // Get all students
    let students = users.filter(u => u.role === 'student');

    // If not enough students, create some
    if (students.length < 3) {
        console.log(`Only found ${students.length} students. Creating more...`);
        const needed = 3 - students.length;
        const newStudents = [];
        for (let i = 0; i < needed; i++) {
            newStudents.push({
                email: `student_extra_${Date.now()}_${i}@test.com`,
                password: 'password123',
                name: `Test Student ${i + 1}`,
                role: 'student',
                student_id: `EXT-${Date.now()}-${i}`
            });
        }

        const { data: createdExtras, error: extraError } = await supabase.from('users').insert(newStudents).select();
        if (extraError) {
            console.error('Error creating extra students:', extraError.message);
        } else {
            if (createdExtras) {
                students = [...students, ...createdExtras];
                // Update main users list too
                users = [...users, ...createdExtras];
            }
        }
    }

    if (students.length === 0) {
        console.error('❌ No students found to create sessions.');
        return;
    }

    // Select first 3 students for the session
    const s1 = students[0];
    const s2 = students.length > 1 ? students[1] : students[0];
    const s3 = students.length > 2 ? students[2] : students[0];

    const { count: sessionCount } = await supabase.from('exam_sessions').select('*', { count: 'exact', head: true });

    if (sessionCount > 0) {
        console.log(`✅ Found ${sessionCount} existing sessions. Skipping session creation.`);
    } else {
        console.log('Creating sessions...');
        // Ensure unique students if we reused them
        const uniqueStudents = [...new Set([s1, s2, s3])];

        const sessions = uniqueStudents.map(s => ({
            exam_id: examId,
            student_id: s.id,
            status: 'active'
        }));

        const { data: createdSessions, error: sessionError } = await supabase.from('exam_sessions').insert(sessions).select();

        if (sessionError) {
            console.error('Error creating sessions:', sessionError.message);
        } else {
            console.log(`✅ Created ${createdSessions.length} active sessions.`);

            // Create Student Status (only if sessions were just created)
            console.log('Phase 4: Creating Real-time Status...');
            const statuses = [];

            if (createdSessions.length > 0) {
                statuses.push({ student_id: createdSessions[0].student_id, exam_session_id: createdSessions[0].id, status: 'active', risk_score: 12.5, fps: 30, latency_ms: 45 });
            }
            if (createdSessions.length > 1) {
                statuses.push({ student_id: createdSessions[1].student_id, exam_session_id: createdSessions[1].id, status: 'flagged', risk_score: 88.0, fps: 28, latency_ms: 120 });
            }
            if (createdSessions.length > 2) {
                statuses.push({ student_id: createdSessions[2].student_id, exam_session_id: createdSessions[2].id, status: 'offline', risk_score: 0, fps: 0, latency_ms: 0 });
            }

            if (statuses.length > 0) {
                await supabase.from('student_status').insert(statuses);
                console.log(`✅ Created student status records.`);
            }
        }
    }

    // --- PHASE 5: VIOLATIONS ---
    console.log('Phase 5: Checking Violations...');
    const { count: violationCount } = await supabase.from('violations').select('*', { count: 'exact', head: true });

    if (violationCount > 0) {
        console.log(`✅ Found ${violationCount} existing violations. Skipping violation seed.`);
    } else {
        // Find a student to assign violation to
        const vStudent = students.length > 1 ? students[1] : students[0];

        if (vStudent) {
            console.log('Creating mock violation...');
            const violation = {
                student_id: vStudent.id,
                exam_id: examId,
                type: 'Multiple People Detected',
                confidence: 88.0,
                status: 'pending',
                timestamp: new Date().toISOString()
            };

            await supabase.from('violations').insert([violation]);
            console.log(`✅ Created mock violation.`);
        }
    }

    console.log('\n✨ Database check/seed completed successfully!');
}

seed();
