-- ProctorAI Database RESET and SETUP Script
-- Run this in your Supabase SQL Editor to fixes all schema issues.
-- WARNING: This will delete existing data in these specific tables.

-- 1. Drop existing tables to ensure a clean slate
DROP TABLE IF EXISTS student_status CASCADE;
DROP TABLE IF EXISTS violations CASCADE;
DROP TABLE IF EXISTS exam_sessions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Re-create USERS table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'proctor', 'admin')),
    student_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Re-create EXAMS table
CREATE TABLE exams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    course_code VARCHAR(100) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Re-create EXAM SESSIONS table
CREATE TABLE exam_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exam_id, student_id)
);

-- 5. Re-create VIOLATIONS table
CREATE TABLE violations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    confidence DECIMAL(5,2) NOT NULL,
    evidence_url TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed', 'flagged')),
    risk_level VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Re-create STUDENT STATUS table
CREATE TABLE student_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    exam_session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'warning', 'flagged', 'offline')),
    risk_score DECIMAL(5,2) DEFAULT 0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fps INTEGER,
    latency_ms INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, exam_session_id)
);

-- 7. Create Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_violations_student ON violations(student_id);
CREATE INDEX idx_violations_exam ON violations(exam_id);

-- 8. Insert Sample Data (Optional, but included for completeness)
INSERT INTO users (email, password, name, role, student_id) VALUES
('student1@university.edu', 'password123', 'Jane Doe', 'student', '2024-8839'),
('student2@university.edu', 'password123', 'Marcus Thorne', 'student', '2024-7721'),
('proctor@example.com', 'password123', 'Dr. Sarah Smith', 'proctor', NULL),
('admin@example.com', 'password123', 'Dr. Harrison', 'admin', NULL);
