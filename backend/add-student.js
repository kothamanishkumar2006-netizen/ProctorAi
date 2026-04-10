const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function addStudent() {
    console.log('Adding student@example.com...');
    const { data, error } = await supabase.from('users').insert([{
        email: 'student@example.com',
        password: 'password123',
        name: 'Jane Student',
        role: 'student',
        student_id: 'S-2024-TEST'
    }]).select();

    if (error) {
        console.error('Error adding student:', error.message);
    } else {
        console.log('✅ Student added successfully!');
    }
}

addStudent();
