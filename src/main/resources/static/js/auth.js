/* ============================================================
   Auth Module — Login/Register page logic
   ============================================================ */

(function () {
    // Redirect if already logged in
    if (localStorage.getItem('token') && localStorage.getItem('userId')) {
        window.location.href = '/messenger.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');

    // Toggle forms
    showRegisterLink?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        clearErrors();
    });

    showLoginLink?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
        clearErrors();
    });

    function clearErrors() {
        document.getElementById('loginError').textContent = '';
        document.getElementById('registerError').textContent = '';
    }

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

    // Login
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');

        if (!username || !password) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }

        setLoading(btn, true);
        errorEl.textContent = '';

        try {
            const data = await API.login(username, password);
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            window.location.href = '/messenger.html';
        } catch (err) {
            errorEl.textContent = err.message || 'Login failed';
            setLoading(btn, false);
        }
    });

    // Register
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('registerConfirm').value;
        const errorEl = document.getElementById('registerError');
        const btn = document.getElementById('registerBtn');

        if (!username || !password || !confirm) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            return;
        }

        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }

        setLoading(btn, true);
        errorEl.textContent = '';

        try {
            const data = await API.register(username, password);
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            window.location.href = '/messenger.html';
        } catch (err) {
            errorEl.textContent = err.message || 'Registration failed';
            setLoading(btn, false);
        }
    });
})();
