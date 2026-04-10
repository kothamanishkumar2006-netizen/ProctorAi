// Native fetch is available in Node.js 18+

const BASE_URL = 'http://localhost:5000/api';
let authToken = null;

async function testAuth() {
    console.log('\n--- Testing Authentication ---');
    try {
        // 1. Test Login (Proctor)
        console.log('Attempting login as proctor...');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'proctor@example.com',
                password: 'password123',
                role: 'proctor'
            })
        });

        const loginData = await loginRes.json();
        console.log('Login Status:', loginRes.status);

        if (loginRes.ok) {
            console.log('Login Success!');
            authToken = loginData.token;
            return true;
        } else {
            console.log('Login Failed:', loginData);
            return false;
        }

    } catch (error) {
        console.error('Auth Test Error:', error.message);
        return false;
    }
}

async function testStudents() {
    console.log('\n--- Testing Student Endpoints ---');
    if (!authToken) {
        console.log('Skipping: No auth token');
        return;
    }

    try {
        // Get all students
        const res = await fetch(`${BASE_URL}/students`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        console.log('Get Students Status:', res.status);
        console.log('Student Count:', data.data ? data.data.length : 0);

    } catch (error) {
        console.error('Student Test Error:', error.message);
    }
}

async function testViolations() {
    console.log('\n--- Testing Violation Endpoints ---');
    if (!authToken) return;

    try {
        // Create Violation
        console.log('Creating test violation...');
        const createRes = await fetch(`${BASE_URL}/violations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                student_id: 'test-student-1',
                type: 'Test Violation',
                confidence: 88.5,
                evidence_url: 'http://example.com/evidence.jpg'
            })
        });
        console.log('Create Violation Status:', createRes.status);

        // Get Violations
        const getRes = await fetch(`${BASE_URL}/violations`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await getRes.json();
        console.log('Get Violations Status:', getRes.status);
        console.log('Violation Count:', data.data ? data.data.length : 0);

    } catch (error) {
        console.error('Violation Test Error:', error.message);
    }
}

async function runTests() {
    console.log('Starting API Tests...');

    // Check if server is running
    try {
        await fetch(BASE_URL.replace('/api', ''));
    } catch (e) {
        console.log('⚠️  Server does not appear to be running on localhost:5000');
        console.log('Please start the server first with: npm start');
        return;
    }

    const authSuccess = await testAuth();
    if (authSuccess) {
        await testStudents();
        await testViolations();
    }
    console.log('\nTests Completed.');
}

runTests();
