let selectedRole = 'proctor'; // Default matches the pre-selected UI button

function selectRole(role) {
    selectedRole = role;

    // Update UI
    ['student', 'proctor', 'admin'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        if (r === role) {
            btn.className = "py-2 text-xs font-medium rounded-md bg-primary text-white shadow-sm";
        } else {
            btn.className = "py-2 text-xs font-medium rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors";
        }
    });
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    if (!selectedRole) {
        errorText.textContent = "Please select a role.";
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        // Clear any old state before starting a new login session
        localStorage.clear();
        sessionStorage.clear();

        const response = await API.login(email, password, selectedRole);
        localStorage.setItem('authToken', response.token);
        localStorage.setItem('userRole', selectedRole);
        localStorage.setItem('userData', JSON.stringify(response.user));

        // Redirect based on role
        if (selectedRole === 'admin') {
            window.location.href = 'dashboard-admin.html';
        } else if (selectedRole === 'proctor') {
            window.location.href = 'dashboard-proctor.html';
        } else if (selectedRole === 'student') {
            window.location.href = 'dashboard-system-check.html';
        } else {
            alert('Dashboard for this role is under construction.');
        }
    } catch (error) {
        errorText.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
}

function logout() {
    // Clear ALL stored data (token, user, role, session_id, etc.)
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// Check auth on dashboard pages
if (window.location.pathname.includes('dashboard')) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'index.html';
    }
}
