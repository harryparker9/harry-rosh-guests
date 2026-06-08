(function () {
    console.log('Auth.js: Initializing...');

    if (typeof CONFIG === 'undefined') {
        console.error('Auth.js: CONFIG is missing. Make sure config.js is loaded first.');
        return;
    }

    if (!window.supabase) {
        console.error('Auth.js: Supabase SDK is missing.');
        return;
    }

    // Initialize Supabase Client with global header if logged in
    let accessCode = '';
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        try {
            const parsed = JSON.parse(storedUser);
            accessCode = parsed.access_code || '';
        } catch (e) {}
    }

    let supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        global: {
            headers: {
                'x-access-code': accessCode
            }
        }
    });

    // Global Auth Object
    window.Auth = {
        client: supabase,
        user: null,

        init: async function () {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                this.user = JSON.parse(storedUser);
                // Optional: Verify session validity here if needed
            }
        },

        login: async function (accessCode) {
            if (!accessCode) throw new Error("Access code required");

            // Re-create the client with the typed access code in the global headers first
            supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
                global: {
                    headers: {
                        'x-access-code': accessCode
                    }
                }
            });
            this.client = supabase;

            const { data, error } = await supabase
                .from('guests')
                .select('*')
                .eq('access_code', accessCode)
                .single();

            if (error || !data) {
                throw new Error("Invalid access code");
            }

            this.user = data;
            localStorage.setItem('user', JSON.stringify(data));
            return data;
        },

        logout: function () {
            this.user = null;
            localStorage.removeItem('user');
            window.location.href = 'index.html';
        },

        requireAuth: function () {
            if (!this.user) {
                window.location.href = 'index.html';
                return false;
            }
            return true;
        }
    };

    // Auto-init on load
    window.Auth.init();

    // Login Form Logic (if present on page)
    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const codeInput = document.getElementById('accessCode');
                const errorDiv = document.getElementById('login-error');

                if (errorDiv) {
                    errorDiv.classList.add('hidden');
                    errorDiv.textContent = 'Verifying...';
                }

                try {
                    await window.Auth.login(codeInput.value.trim());
                    window.location.href = 'dashboard.html';
                } catch (err) {
                    if (errorDiv) {
                        errorDiv.textContent = err.message;
                        errorDiv.classList.remove('hidden');
                    } else {
                        alert(err.message);
                    }
                }
            };
        }

        // Global Logout Button Logic
        const logoutBtns = document.querySelectorAll('.logout-btn');
        logoutBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                window.Auth.logout();
            };
        });
    });

})();
