// ============================================================
// DASHBOARD - MAIN ORCHESTRATOR
// ============================================================
// This file loads the user session, sets up tab switching,
// and dynamically imports the tab modules when needed.

import { showToast } from './utils/toast.js';

// Make toast available globally for legacy inline onclick handlers
window.showToast = showToast;

// ============================================================
// STATE
// ============================================================

let supabaseInstance = null;
let dashboardUser = null;
let currentOrganizationId = null;
let currentTab = 'dashboard';

// ============================================================
// TAB MODULE MAPPING
// ============================================================

const tabModules = {
    'dashboard': () => import('./tabs/overview.js'),
    'ai-visibility': () => import('./tabs/ai-visibility.js'),
    'upload': () => import('./tabs/uploads.js'),
    'review': () => import('./tabs/review.js'),
    'brand-voice': () => import('./tabs/brand-voice.js'),
    'usage': () => import('./tabs/usage.js'),
    'settings': () => import('./tabs/settings.js'),
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

            // Load the default tab (Overview)
            await loadTab('dashboard');
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
    const planEl = document.getElementById('userPlan');
    if (avatarEl) avatarEl.textContent = '👤';
    if (nameEl) nameEl.textContent = 'Guest';
    if (planEl) planEl.textContent = 'Not Logged In';

    const welcomeTitle = document.querySelector('.dashboard-header h1');
    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeTitle) welcomeTitle.textContent = 'Welcome to Fromple';
    if (welcomeSubtitle) {
        const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        welcomeSubtitle.innerHTML = `View your content overview for <strong>${month}</strong>. <a href="/login.html" style="color: var(--primary); font-weight: 600;">Log in</a> to access full features.`;
    }
}

function updateUserUI(user) {
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-name');
    const planEl = document.getElementById('userPlan');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;
    if (planEl) planEl.textContent = 'Loading...';

    const welcomeTitle = document.querySelector('.dashboard-header h1');
    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${fullName}`;
    if (welcomeSubtitle) {
        const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        welcomeSubtitle.innerHTML = `Welcome back, ${fullName}. Here's your content overview for <strong>${month}</strong>.`;
    }

    // Populate personal profile fields (full name and email)
    const fullNameInput = document.getElementById('personalFullName');
    const emailInput = document.getElementById('personalEmail');
    if (fullNameInput) fullNameInput.value = fullName;
    if (emailInput) emailInput.value = user.email || '';

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
window.saveBrandVoice = function() {
    console.warn('saveBrandVoice called before tab loaded');
    showToast('Brand Voice tab not loaded yet. Please try again.', 'warning');
};

window.exportUsageData = function() {
    console.warn('exportUsageData called before tab loaded');
    showToast('Usage tab not loaded yet. Please try again.', 'warning');
};

window.downloadInvoice = function(id) {
    console.warn('downloadInvoice called before tab loaded');
    showToast('Invoice download functionality not loaded yet.', 'warning');
};

window.updatePersonalProfile = function() {
    console.warn('updatePersonalProfile called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.updateBusinessProfile = function() {
    console.warn('updateBusinessProfile called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveAllSettings = function() {
    console.warn('saveAllSettings called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.createNewSchedule = function() {
    console.warn('createNewSchedule called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.toggleSchedule = function(id) {
    console.warn('toggleSchedule called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.deleteSchedule = function(id) {
    console.warn('deleteSchedule called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.deleteAccount = function() {
    console.warn('deleteAccount called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.loadPlanAndBilling = function() {
    console.warn('loadPlanAndBilling called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.changePlan = function() {
    console.warn('changePlan called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.viewContent = function(id) {
    console.warn('viewContent called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.editContent = function(id) {
    console.warn('editContent called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.publishContent = function(id) {
    console.warn('publishContent called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

// ============================================================
// DOM EVENT BINDING
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔵 Dashboard initializing...');

    // Initialize
    initializeDashboard();

    // Attach click listeners to nav links
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Handle hash on load
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        const validTabs = ['dashboard', 'upload', 'review', 'planner', 'brand-voice', 'billing', 'settings', 'usage', 'ai-visibility'];
        if (validTabs.includes(hash)) {
            setTimeout(() => switchTab(hash), 100);
        }
    }

    // Sidebar toggle button
    const toggleBtn = document.getElementById('adminSidebarToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });
    }

    // ============================================================
    // Full Report button is handled by ai-visibility.js
    // The old quickScanFromPillars button has been removed.
    // ============================================================

    console.log('✅ Dashboard initialized');
});

// ============================================================
// EXPOSE AUTH AND USER FOR OTHER MODULES
// ============================================================

// This allows other modules to access the user and supabase instance
// without having to re-authenticate.
export { supabaseInstance, dashboardUser, currentOrganizationId };
