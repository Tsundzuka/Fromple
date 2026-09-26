// ============================================================
// AUTH.JS - Supabase Authentication
// ============================================================

import { supabase } from './supabase-client.js';

console.log('🔥 AUTH.JS LOADED');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 DOM loaded, initializing auth...');
    initTabSystem();

    // ============================================================
    // REGISTRATION FORM
    // ============================================================
    const registerForm = document.getElementById('supabaseRegisterForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById('regFullName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;

            if (!fullName || !email || !password || !confirmPassword) {
                alert('Please fill in all fields.');
                return;
            }

            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }

            if (password.length < 6) {
                alert('Password must be at least 6 characters.');
                return;
            }

            try {
                console.log('📤 Attempting registration for:', email);
                
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName,
                        }
                    }
                });

                if (error) {
                    console.error('❌ Registration error:', error);
                    alert('Registration failed: ' + error.message);
                    return;
                }

                if (data.user) {
                    console.log('✅ Registration successful:', data.user.email);
                    alert('✅ Registration successful! Please check your email to confirm your account.');
                    registerForm.reset();
                    
                    // Switch to login tab
                    const loginTab = document.querySelector('[data-tab="login"]');
                    if (loginTab) loginTab.click();
                }

            } catch (err) {
                console.error('❌ Registration exception:', err);
                alert('Something went wrong. Please try again.');
            }
        });
    }

    // ============================================================
    // LOGIN FORM
    // ============================================================
    const loginForm = document.getElementById('supabaseLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                alert('Please fill in all fields.');
                return;
            }

            try {
                console.log('📤 Attempting login for:', email);
                
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    console.error('❌ Login error:', error);
                    alert('Login failed: ' + error.message);
                    return;
                }

                if (data.user) {
                    console.log('✅ Login successful:', data.user.email);
                    // Redirect to dashboard
                    window.location.href = '../dashboard.html';
                }

            } catch (err) {
                console.error('❌ Login exception:', err);
                alert('Something went wrong. Please try again.');
            }
        });
    }

    // ============================================================
    // ADMIN LOGIN FORM
    // ============================================================
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                alert('Please fill in all fields.');
                return;
            }

            try {
                console.log('📤 Attempting admin login for:', email);
                
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    console.error('❌ Admin login error:', error);
                    alert('Login failed: ' + error.message);
                    return;
                }

                if (data.user) {
                    console.log('✅ Admin login successful:', data.user.email);
                    // Redirect to admin dashboard
                    window.location.href = 'index.html';
                }

            } catch (err) {
                console.error('❌ Admin login exception:', err);
                alert('Something went wrong. Please try again.');
            }
        });
    }

    // ============================================================
    // SOCIAL BUTTONS - Google OAuth
    // ============================================================
    const googleButtons = document.querySelectorAll('.social-btn.google');
    googleButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            try {
                console.log('📤 Initiating Google login...');
                
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin + '/dashboard.html'
                    }
                });

                if (error) {
                    console.error('❌ Google login error:', error);
                    alert('Google login failed: ' + error.message);
                    return;
                }

                console.log('✅ Google login initiated');

            } catch (err) {
                console.error('❌ Google login exception:', err);
                alert('Something went wrong. Please try again.');
            }
        });
    });

    // Other social buttons (Facebook, Twitter, etc.) - placeholder
    const otherSocialButtons = document.querySelectorAll('.social-btn:not(.google)');
    otherSocialButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const provider = btn.textContent.trim();
            alert(`🔵 ${provider} authentication coming soon.`);
        });
    });

    // ============================================================
    // TAB SWITCHING
    // ============================================================
    const registerLink = document.getElementById('switchToRegister');
    if (registerLink) {
        registerLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('register');
        });
    }

    const loginLink = document.getElementById('switchToLogin');
    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('login');
        });
    }

    // ============================================================
    // CHECK IF ALREADY LOGGED IN
    // ============================================================
    checkExistingSession();
});

// ============================================================
// TAB SWITCHING SYSTEM
// ============================================================

function initTabSystem() {
    const tabs = document.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('loginFormContainer');
    const registerForm = document.getElementById('registerFormContainer');

    console.log('🔵 initTabSystem() called');
    console.log('🔵 Tabs found:', tabs.length);
    console.log('🔵 Login form found:', !!loginForm);
    console.log('🔵 Register form found:', !!registerForm);

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            console.log('🟡 Tab clicked:', tab.dataset.tab);
            switchTab(tab.dataset.tab);
        });
    });

    // Ensure login tab is active by default
    const defaultTab = document.querySelector('[data-tab="login"]');
    if (defaultTab) {
        defaultTab.classList.add('active');
    }
    if (loginForm) {
        loginForm.classList.remove('hidden');
    }
    if (registerForm) {
        registerForm.classList.add('hidden');
    }
}

function switchTab(target) {
    const tabs = document.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('loginFormContainer');
    const registerForm = document.getElementById('registerFormContainer');

    console.log('🟡 Switching to tab:', target);

    tabs.forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`[data-tab="${target}"]`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    if (target === 'login') {
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
    } else if (target === 'register') {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
    }
}

// Make switchTab globally accessible
window.switchTab = switchTab;

// ============================================================
// CHECK EXISTING SESSION
// ============================================================

async function checkExistingSession() {
    try {
        console.log('🔍 Checking existing session...');
        
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('❌ Session check error:', error);
            return;
        }

        if (session && session.user) {
            console.log('👤 User already logged in:', session.user.email);
            // If on login page and already logged in, redirect
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'login.html' || currentPage === 'login') {
                // Check if it's admin login
                if (window.location.pathname.includes('/admin/')) {
                    window.location.href = 'index.html';
                } else {
                    window.location.href = '../dashboard.html';
                }
            }
        } else {
            console.log('👤 No active session');
        }
    } catch (err) {
        console.error('❌ Session check failed:', err);
    }
}