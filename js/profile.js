// ============================================================
// PROFILE - MAIN ORCHESTRATOR
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
let profileUser = null;
let currentOrganizationId = null;
let currentTab = 'overview';

// ============================================================
// TAB MODULE MAPPING
// ============================================================

const tabModules = {
    'overview': () => import('./tabs/overview.js'),
    'review':   () => import('./tabs/review.js'),
    'usage':    () => import('./tabs/usage.js'),
    'settings': () => import('./tabs/settings.js'),
};

// Cache loaded module instances
const loadedModules = {};

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeProfile() {
    try {
        const { supabase } = await import('./supabase-client.js');
        supabaseInstance = supabase;

        const { data: { session } } = await supabaseInstance.auth.getSession();

        if (session) {
            profileUser = session.user;
            console.log("✅ Authenticated user:", profileUser.email);
            updateUserUI(profileUser);
        } else {
            console.log("👤 Guest user (not logged in)");
            updateGuestUI();
        }
    } catch (error) {
        console.error("Profile initialization error:", error);
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
            await loadedModules[tabId].refresh(supabaseInstance, profileUser);
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
            await module.init(supabaseInstance, profileUser);
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
    if (welcomeTitle) welcomeTitle.textContent = 'Your Profile';
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Log in to view your registry statistics and account settings. <a href="/login.html" style="color: var(--primary); font-weight: 600;">Log in</a>`;
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
    if (planEl) planEl.textContent = 'Loading...';

    const welcomeTitle = document.querySelector('.dashboard-header h1');
    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeTitle) welcomeTitle.textContent = 'Your Profile';
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Registry statistics, activity, and account settings for ${fullName}.`;
    }

    // Populate personal profile fields (full name and email)
    const fullNameInput = document.getElementById('personalFullName');
    const emailInput = document.getElementById('personalEmail');
    if (fullNameInput) fullNameInput.value = fullName;
    if (emailInput) emailInput.value = user.email || '';

    // Store user and supabase globally for tab modules that need them
    window.profileUser = user;
    window.supabaseInstance = supabaseInstance;
}

// ============================================================
// GLOBALS (for inline onclick handlers and legacy compatibility)
// ============================================================

window.switchTab = switchTab;

// Stub functions for legacy inline onclick handlers.
// These will be overwritten by the actual implementations when tabs load.
window.updatePersonalProfile = function() {
    console.warn('updatePersonalProfile called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveTradingParameters = function() {
    console.warn('saveTradingParameters called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveDataSources = function() {
    console.warn('saveDataSources called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveNotificationPreferences = function() {
    console.warn('saveNotificationPreferences called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.deleteAccount = function() {
    console.warn('deleteAccount called before settings tab loaded');
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.exportUsageData = function() {
    console.warn('exportUsageData called before usage tab loaded');
    showToast('Usage & Analytics tab not loaded yet. Please try again.', 'warning');
};

window.reviewSetup = function(id) {
    console.warn('reviewSetup called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.flagSetup = function(id) {
    console.warn('flagSetup called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.dismissSetup = function(id) {
    console.warn('dismissSetup called before review tab loaded');
    showToast('Review tab not loaded yet. Please try again.', 'warning');
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
    console.log('🔵 Profile initializing...');

    // 1. Auth guard first — redirects to login if no session
    await requireAuth();

    // 2. Load session + update UI
    await initializeProfile();

    // 3. Bind tab clicks + sidebar toggle
    attachEventListeners();

    // 4. Resolve initial tab from hash, falling back to overview
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['overview', 'review', 'usage', 'settings'];
    const initialTab = validTabs.includes(hash) ? hash : 'overview';
    await switchTab(initialTab);

    console.log('✅ Profile initialized');
})();

// ============================================================
// EXPOSE AUTH AND USER FOR OTHER MODULES
// ============================================================

export { supabaseInstance, profileUser, currentOrganizationId };
