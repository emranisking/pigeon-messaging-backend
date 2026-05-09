/**
 * ============================================================
 * AUTHENTICATION MODULE
 * ============================================================
 * 
 * Purpose: Handles login and registration page logic
 * - Manages form switching (login <-> register)
 * - Validates user input
 * - Communicates with auth API
 * - Stores JWT token and user data in localStorage
 * - Redirects to main app after successful auth
 * 
 * ============================================================
 */

(function() {
    // ============================================================
    // AUTO-REDIRECT: If user already logged in, go to messenger
    // ============================================================
    if (localStorage.getItem('token') && localStorage.getItem('userId')) {
        window.location.href = '/messenger.html';
        return;
    }

    // ============================================================
    // DOM REFERENCES
    // ============================================================
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');

    // ============================================================
    // FORM SWITCHING: Toggle between login and register forms
    // ============================================================

    /**
     * Switch to registration form
     * Purpose: Hide login form and show register form
     */
    showRegisterLink?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        clearErrors();
    });

    /**
     * Switch to login form
     * Purpose: Hide register form and show login form
     */
    showLoginLink?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
        clearErrors();
    });

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    /**
     * Clear all error messages from both forms
     * Purpose: Reset error state when switching forms
     */
    function clearErrors() {
        document.getElementById('loginError').textContent = '';
        document.getElementById('registerError').textContent = '';
    }

    /**
     * Toggle loading spinner and button state
     * @param {HTMLElement} btn - Submit button element
     * @param {boolean} loading - Whether to show loading state
     * Purpose: Show spinner during API request, disable button to prevent duplicates
     */
    function setLoading(btn, loading) {
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (loading) {
            text.style.display = 'none';
            loader.style.display = 'block';
            btn.disabled = true;
        } else {
            text.style.display = 'inline';
            loader.style.display = 'none';
            btn.disabled = false;
        }
    }

    /**
     * Display error message to user
     * @param {HTMLElement} errorEl - Error message element
     * @param {string} message - Error text to display
     * Purpose: Show user-friendly error messages
     */
    function showError(errorEl, message) {
        errorEl.textContent = message;
    }

    /**
     * Store authentication data in localStorage
     * @param {object} data - Auth response { token, userId, username }
     * Purpose: Persist user session across page reloads
     */
    function saveAuthData(data) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username);
    }

    // ============================================================
    // LOGIN FORM HANDLER
    // ============================================================

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form values
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');

        // Validate input
        if (!username || !password) {
            showError(errorEl, 'Please fill in all fields');
            return;
        }

        // Show loading state
        setLoading(btn, true);
        clearErrors();

        try {
            // Call login API
            const data = await API.login(username, password);

            // Save credentials
            saveAuthData(data);

            // Redirect to main app
            window.location.href = '/messenger.html';
        } catch (err) {
            // Show error and restore button
            showError(errorEl, err.message || 'Login failed');
            setLoading(btn, false);
        }
    });

    // ============================================================
    // REGISTRATION FORM HANDLER
    // ============================================================

    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form values
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('registerConfirm').value;
        const errorEl = document.getElementById('registerError');
        const btn = document.getElementById('registerBtn');

        // Validate all fields filled
        if (!username || !password || !confirm) {
            showError(errorEl, 'Please fill in all fields');
            return;
        }

        // Validate passwords match
        if (password !== confirm) {
            showError(errorEl, 'Passwords do not match');
            return;
        }

        // Validate password length
        if (password.length < 6) {
            showError(errorEl, 'Password must be at least 6 characters');
            return;
        }

        // Show loading state
        setLoading(btn, true);
        clearErrors();

        try {
            // Call registration API
            const data = await API.register(username, password);

            // Save credentials
            saveAuthData(data);

            // Redirect to main app
            window.location.href = '/messenger.html';
        } catch (err) {
            // Show error and restore button
            showError(errorEl, err.message || 'Registration failed');
            setLoading(btn, false);
        }
    });
})();