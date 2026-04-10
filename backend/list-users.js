const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function check() {
    const { data: users } = await supabase.from('users').select('email, role');
    console.log('--- User Emails and Roles ---');
    console.table(users);
}

check();
