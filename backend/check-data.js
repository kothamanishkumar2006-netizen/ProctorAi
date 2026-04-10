const supabase = require('./supabase');

async function check() {
    console.log('--- Checking Database Counts ---');

    const TABLES = ['users', 'exams', 'questions', 'exam_sessions', 'answers', 'violations', 'student_status'];

    for (const table of TABLES) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) console.log(`${table}: ERROR - ${error.message}`);
        else console.log(`${table}: ${count} rows`);
    }
}

check();
