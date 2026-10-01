// ============================================================
// DASHBOARD - MAIN ORCHESTRATOR
// ============================================================
// This file loads the user session, sets up tab switching,
// and dynamically imports the tab modules when needed.

import { requireAuth } from './auth-guard.js';
import { showToast } from './utils/toast.js';

// Make toast available globally for legacy inline onclick handlers
window.showToast = showToast;

// ============================================================
// STATE
// ============================================================

let supabaseInstance = null;
let dashboardUser = null;
let currentOrganizationId = null;
let currentTab = 'classes';

// ============================================================
// TAB MODULE MAPPING
// ============================================================

const tabModules = {
    'classes':        () => import('./tabs/classes.js'),
    'categorisation': () => import('./tabs/categorisation.js'),
    'paper-trading':  () => import('./tabs/paper-trading.js'),
    'signals':        () => import('./tabs/signals.js'),
    'monitoring':     () => import('./tabs/monitoring.js'),
};

// Cache loaded module instances
const loadedModules = {};

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeDashboard() {
    try {
        const { supabase } = await import('./supabase-client.js');
        supabaseInstance = supabase;

        const { data: { session } } = await supabaseInstance.auth.getSession();

        if (session) {
            dashboardUser = session.user;
            console.log("✅ Authenticated user:", dashboardUser.email);
            updateUserUI(dashboardUser);
        } else {
            console.log("👤 Guest user (not logged in)");
            updateGuestUI();
        }
    } catch (error) {
        console.error("Dashboard initialization error:", error);
        updateGuestUI();
    }
}

// ============================================================
// TAB SWITCHING
// ============================================================

async function switchTab(tabId) {
    console.log('🟡 Switching to tab:', tabId);

    // Update UI: active class on nav links and tab contents
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const tabContents = document.querySelectorAll('.tab-content');

    tabContents.forEach(tab => tab.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('active'));

    const selectedTab = document.getElementById('tab-' + tabId);
    if (selectedTab) selectedTab.classList.add('active');

    const activeLink = document.querySelector(`.sidebar-nav a[data-tab="${tabId}"]`);
    if (activeLink) activeLink.classList.add('active');

    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768) sidebar.classList.remove('open');

    if (tabId) window.location.hash = tabId;

    currentTab = tabId;

    // Load the tab module
    await loadTab(tabId);
}

async function loadTab(tabId) {
    // If already loaded, just refresh
    if (loadedModules[tabId]) {
        if (typeof loadedModules[tabId].refresh === 'function') {
            await loadedModules[tabId].refresh(supabaseInstance, dashboardUser);
        }
        return;
    }

    const moduleLoader = tabModules[tabId];
    if (!moduleLoader) {
        console.warn('No module found for tab:', tabId);
        return;
    }

    try {
        const module = await moduleLoader();
        loadedModules[tabId] = module;

        if (typeof module.init === 'function') {
            await module.init(supabaseInstance, dashboardUser);
        }

        console.log('✅ Tab loaded:', tabId);
    } catch (error) {
        console.error('Error loading tab:', tabId, error);
        showToast('Error loading tab content. Please refresh.', 'error');
    }
}

// ============================================================
// UI UPDATE HELPERS
// ============================================================

function updateGuestUI() {
    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-name');
    const planEl = document.querySelector('.user-plan');
    if (avatarEl) avatarEl.textContent = '👤';
    if (nameEl) nameEl.textContent = 'Guest';
    if (planEl) planEl.textContent = 'Not Logged In';

    const welcomeTitle = document.querySelector('.dashboard-header h1');
    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeTitle) welcomeTitle.textContent = 'Welcome to the Dashboard';
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Log in to view your registry statistics and trading experiments. <a href="/login.html" style="color: var(--primary); font-weight: 600;">Log in</a>`;
    }
}

function updateUserUI(user) {
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-name');
    const planEl = document.querySelector('.user-plan');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;
    if (planEl) planEl.textContent = 'Research';

    // Store user and supabase globally for tab modules that need them
    window.dashboardUser = user;
    window.supabaseInstance = supabaseInstance;
}

// ============================================================
// GLOBALS (for inline onclick handlers and legacy compatibility)
// ============================================================

window.switchTab = switchTab;

// Stub functions for legacy inline onclick handlers.
// These will be overwritten by the actual implementations when tabs load.
window.newClass = function() {
    console.warn('newClass called before classes tab loaded');
    showToast('Classes tab not loaded yet. Please try again.', 'warning');
};

window.exportClasses = function() {
    console.warn('exportClasses called before classes tab loaded');
    showToast('Classes tab not loaded yet. Please try again.', 'warning');
};

window.addCategory = function() {
    console.warn('addCategory called before categorisation tab loaded');
    showToast('Categorisation tab not loaded yet. Please try again.', 'warning');
};

window.exportConditions = function() {
    console.warn('exportConditions called before categorisation tab loaded');
    showToast('Categorisation tab not loaded yet. Please try again.', 'warning');
};

window.newExperiment = function() {
    console.warn('newExperiment called before paper-trading tab loaded');
    showToast('Paper Trading tab not loaded yet. Please try again.', 'warning');
};

window.exportTrades = function() {
    console.warn('exportTrades called before paper-trading tab loaded');
    showToast('Paper Trading tab not loaded yet. Please try again.', 'warning');
};

window.manualSignal = function() {
    console.warn('manualSignal called before signals tab loaded');
    showToast('Signals tab not loaded yet. Please try again.', 'warning');
};

window.exportSignals = function() {
    console.warn('exportSignals called before signals tab loaded');
    showToast('Signals tab not loaded yet. Please try again.', 'warning');
};

window.configureAlerts = function() {
    console.warn('configureAlerts called before monitoring tab loaded');
    showToast('Monitoring tab not loaded yet. Please try again.', 'warning');
};

// ============================================================
// EVENT BINDING
// ============================================================

function attachEventListeners() {
    // Attach click listeners to nav links
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Sidebar toggle button (mobile)
    const toggleBtn = document.getElementById('adminSidebarToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });
    }
}

// ============================================================
// BOOTSTRAP
// ============================================================
// Module scripts run after the DOM is parsed, so no
// DOMContentLoaded listener is needed.

(async function bootstrap() {
    console.log('🔵 Dashboard initializing...');

    // 1. Auth guard first — redirects to login if no session
    await requireAuth();

    // 2. Load session + update UI
    await initializeDashboard();

    // 3. Bind tab clicks + sidebar toggle
    attachEventListeners();

    // 4. Resolve initial tab from hash, falling back to classes
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['classes', 'categorisation', 'paper-trading', 'signals', 'monitoring'];
    const initialTab = validTabs.includes(hash) ? hash : 'classes';
    await switchTab(initialTab);

    console.log('✅ Dashboard initialized');
})();

// ============================================================
// EXPOSE AUTH AND USER FOR OTHER MODULES
// ============================================================

export { supabaseInstance, dashboardUser, currentOrganizationId };
