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

    function cleanHeaders(client) {
        if (!client) return;
        if (client.auth && client.auth.headers) {
            delete client.auth.headers['x-access-code'];
        }
        if (client.storage && client.storage.headers) {
            delete client.storage.headers['x-access-code'];
        }
        if (client.functions && client.functions.headers) {
            delete client.functions.headers['x-access-code'];
        }
    }

    let supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        global: {
            headers: {
                'x-access-code': accessCode
            }
        }
    });
    cleanHeaders(supabase);

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
            cleanHeaders(supabase);
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
        const errorDiv = document.getElementById('login-error');

        // Auto-login from URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const codeParam = urlParams.get('code');
        if (codeParam) {
            console.log('Auth.js: Found access code in URL, logging in automatically...');
            if (errorDiv) {
                errorDiv.classList.remove('hidden');
                errorDiv.textContent = 'Logging you in automatically...';
            }
            window.Auth.login(codeParam.trim())
                .then(() => {
                    window.location.href = 'dashboard.html';
                })
                .catch(err => {
                    console.error('Auto-login failed:', err);
                    if (errorDiv) {
                        errorDiv.textContent = 'Auto-login failed: ' + err.message;
                    }
                });
        }

        if (loginForm) {
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const codeInput = document.getElementById('accessCode');

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

        // Recovery Modal DOM elements
        const forgotCodeLink = document.getElementById('btn-forgot-code');
        const recoveryModal = document.getElementById('recovery-modal');
        const recoveryModalClose = document.getElementById('recovery-modal-close');
        const recoveryFormStep1 = document.getElementById('recovery-form-step-1');
        const recoveryFormStep2 = document.getElementById('recovery-form-step-2');
        const recoveryStep1 = document.getElementById('recovery-step-1');
        const recoveryStep2 = document.getElementById('recovery-step-2');
        const recoveryStepSuccess = document.getElementById('recovery-step-success');
        const recoveryError = document.getElementById('recovery-error');
        const recoveryLoader = document.getElementById('recovery-loader');
        const btnRecoverySuccessClose = document.getElementById('btn-recovery-success-close');

        let verifiedGuestId = null;

        function showLoader(show) {
            if (show) {
                recoveryLoader.classList.remove('hidden');
            } else {
                recoveryLoader.classList.add('hidden');
            }
        }

        function showError(msg) {
            if (msg) {
                recoveryError.textContent = msg;
                recoveryError.classList.remove('hidden');
            } else {
                recoveryError.classList.add('hidden');
                recoveryError.textContent = '';
            }
        }

        function resetRecoveryModal() {
            verifiedGuestId = null;
            showLoader(false);
            showError(null);
            
            // Show step 1, hide others
            recoveryStep1.classList.remove('hidden');
            recoveryStep2.classList.add('hidden');
            recoveryStepSuccess.classList.add('hidden');
            
            // Clear inputs
            if (recoveryFormStep1) recoveryFormStep1.reset();
            if (recoveryFormStep2) recoveryFormStep2.reset();
        }

        if (forgotCodeLink && recoveryModal) {
            forgotCodeLink.onclick = (e) => {
                e.preventDefault();
                resetRecoveryModal();
                recoveryModal.classList.remove('hidden');
            };

            // Close modal events
            const closeModal = () => {
                recoveryModal.classList.add('hidden');
            };
            
            if (recoveryModalClose) recoveryModalClose.onclick = closeModal;
            if (btnRecoverySuccessClose) btnRecoverySuccessClose.onclick = closeModal;

            // Close when clicking overlay
            recoveryModal.onclick = (e) => {
                if (e.target === recoveryModal) {
                    closeModal();
                }
            };

            // Step 1: Verify details
            if (recoveryFormStep1) {
                recoveryFormStep1.onsubmit = async (e) => {
                    e.preventDefault();
                    showError(null);
                    showLoader(true);

                    const nameInput = document.getElementById('recovery-name');
                    const phoneInput = document.getElementById('recovery-phone');

                    try {
                        const { data, error } = await window.Auth.client.functions.invoke('send-email-code', {
                            body: {
                                action: 'verify',
                                name: nameInput.value.trim(),
                                phone: phoneInput.value.trim()
                            }
                        });

                        showLoader(false);

                        if (error || (data && data.error)) {
                            const errMessage = error?.message || data?.error || 'Verification failed.';
                            throw new Error(errMessage);
                        }

                        if (data && data.success) {
                            verifiedGuestId = data.guestId;
                            // Transition to Step 2
                            recoveryStep1.classList.add('hidden');
                            recoveryStep2.classList.remove('hidden');
                        }
                    } catch (err) {
                        showLoader(false);
                        showError(err.message);
                    }
                };
            }

            // Step 2: Email and Send Code
            if (recoveryFormStep2) {
                recoveryFormStep2.onsubmit = async (e) => {
                    e.preventDefault();
                    showError(null);
                    showLoader(true);

                    const emailInput = document.getElementById('recovery-email');

                    try {
                        if (!verifiedGuestId) {
                            throw new Error('Session mismatch. Please restart the recovery process.');
                        }

                        const { data, error } = await window.Auth.client.functions.invoke('send-email-code', {
                            body: {
                                action: 'send',
                                guestId: verifiedGuestId,
                                email: emailInput.value.trim()
                            }
                        });

                        showLoader(false);

                        if (error || (data && data.error)) {
                            const errMessage = error?.message || data?.error || 'Failed to send recovery email.';
                            throw new Error(errMessage);
                        }

                        if (data && data.success) {
                            // Transition to Success Step
                            recoveryStep2.classList.add('hidden');
                            recoveryStepSuccess.classList.remove('hidden');
                        }
                    } catch (err) {
                        showLoader(false);
                        showError(err.message);
                    }
                };
            }
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
