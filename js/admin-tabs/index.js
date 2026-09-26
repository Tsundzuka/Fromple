// ============================================================
// admin-tabs/index.js — Admin Dashboard Orchestrator
// ============================================================
// Lives at js/admin-tabs/index.js and drives admin/index.html.

import { showToast } from '../utils/toast.js';

window.showToast = showToast;

// ============================================================
// STATE
// ============================================================
let supabaseInstance = null;
let adminUser = null;
let currentTab = 'overview';

// ============================================================
// TAB MODULE MAPPING
// ============================================================
const tabModules = {
    'overview':      () => import('./overview.js'),
    'users':         () => import('./users.js'),
    'scans':         () => import('./scans.js'),
    'subscriptions': () => import('./subscriptions.js'),
    'billing':       () => import('./billing.js'),
    'ai-usage':      () => import('./ai-usage.js'),
    'prompts':       () => import('./prompts.js'),
    'settings':      () => import('./settings.js'),
    'logs':          () => import('./logs.js'),
    'analytics':     () => import('./analytics.js'),
};

const loadedModules = {};

// ============================================================
// INITIALIZATION
// ============================================================
async function initializeAdmin() {
    try {
        const { supabase } = await import('../supabase-client.js');
        supabaseInstance = supabase;

        const { data: { session } } = await supabaseInstance.auth.getSession();

        if (!session) {
            console.log('👤 No session — redirecting to admin login');
            window.location.href = '/admin/login.html';
            return;
        }

        const { data: adminRow, error: adminErr } = await supabaseInstance
            .from('admin_users')
            .select('role, full_name, email, is_active')
            .eq('id', session.user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (adminErr || !adminRow) {
            console.log('🚫 Not an admin — redirecting');
            window.location.href = '/dashboard.html';
            return;
        }

        adminUser = {
            ...session.user,
            adminRole: adminRow.role,
            adminName: adminRow.full_name || adminRow.email,
            adminEmail: adminRow.email,
        };

        console.log('✅ Admin authenticated:', adminUser.adminEmail);
        updateAdminUI(adminUser);

        await loadTab('overview');

    } catch (error) {
        console.error('Admin initialization error:', error);
        window.location.href = '/admin/login.html';
    }
}

// ============================================================
// TAB SWITCHING
// ============================================================
async function switchTab(tabId) {
    console.log('🟡 Switching admin tab:', tabId);

    const navLinks = document.querySelectorAll('.admin-nav a');
    const tabContents = document.querySelectorAll('.tab-content');

    tabContents.forEach(tab => tab.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('active'));

    const selectedTab = document.getElementById('tab-' + tabId);
    if (selectedTab) selectedTab.classList.add('active');

    const activeLink = document.querySelector(`.admin-nav a[data-tab="${tabId}"]`);
    if (activeLink) activeLink.classList.add('active');

    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768) sidebar.classList.remove('open');

    if (tabId) window.location.hash = tabId;

    currentTab = tabId;

    await loadTab(tabId);
}

async function loadTab(tabId) {
    if (loadedModules[tabId]) {
        if (typeof loadedModules[tabId].refresh === 'function') {
            await loadedModules[tabId].refresh(supabaseInstance, adminUser);
        }
        return;
    }

    const moduleLoader = tabModules[tabId];
    if (!moduleLoader) {
        console.warn('No admin module found for tab:', tabId);
        return;
    }

    try {
        const module = await moduleLoader();
        loadedModules[tabId] = module;

        if (typeof module.init === 'function') {
            await module.init(supabaseInstance, adminUser);
        }

        console.log('✅ Admin tab loaded:', tabId);
    } catch (error) {
        console.error('Error loading admin tab:', tabId, error);
        showToast('Error loading tab content. Please refresh.', 'error');
    }
}

// ============================================================
// UI UPDATE HELPERS
// ============================================================
function updateAdminUI(user) {
    const displayName = user.adminName || 'Admin';

    const nameEl = document.querySelector('.admin-name');
    const roleEl = document.querySelector('.admin-role');
    const avatarEl = document.querySelector('.admin-avatar');

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
        roleEl.textContent = (user.adminRole || 'admin')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    if (avatarEl) {
        const initials = displayName
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
        avatarEl.textContent = initials || 'A';
    }

    window.adminUser = user;
    window.supabaseInstance = supabaseInstance;
}

// ============================================================
// GLOBALS — stubs for inline handlers, overwritten per tab
// ============================================================
window.switchTab = switchTab;

function notLoaded(tabName) {
    return function () {
        console.warn(`${tabName} called before tab loaded`);
        showToast(`${tabName} not available yet. Please try again.`, 'warning');
    };
}

window.refreshData = notLoaded('refreshData');

window.filterUsers = notLoaded('filterUsers');
window.showAddUserModal = notLoaded('showAddUserModal');
window.closeModal = notLoaded('closeModal');
window.saveUser = notLoaded('saveUser');
window.editUser = notLoaded('editUser');
window.deleteUser = notLoaded('deleteUser');
window.exportUsers = notLoaded('exportUsers');

window.filterScans = notLoaded('filterScans');

window.filterSubscriptions = notLoaded('filterSubscriptions');
window.editSubscription = notLoaded('editSubscription');
window.cancelSubscription = notLoaded('cancelSubscription');

window.filterInvoices = notLoaded('filterInvoices');
window.applyDateFilter = notLoaded('applyDateFilter');
window.generateInvoice = notLoaded('generateInvoice');
window.downloadInvoice = notLoaded('downloadInvoice');

window.filterPrompts = notLoaded('filterPrompts');
window.showAddPromptModal = notLoaded('showAddPromptModal');
window.closePromptModal = notLoaded('closePromptModal');
window.editPrompt = notLoaded('editPrompt');
window.savePrompt = notLoaded('savePrompt');
window.testPrompt = notLoaded('testPrompt');

window.saveAllSettings = notLoaded('saveAllSettings');

window.filterLogs = notLoaded('filterLogs');
window.applyLogDateFilter = notLoaded('applyLogDateFilter');
window.exportLogs = notLoaded('exportLogs');
window.clearLogs = notLoaded('clearLogs');

window.updateAnalytics = notLoaded('updateAnalytics');
window.exportAnalytics = notLoaded('exportAnalytics');

window.prevPage = notLoaded('prevPage');
window.nextPage = notLoaded('nextPage');

// ============================================================
// BOOTSTRAP
// ============================================================
function bootstrapAdmin() {
    console.log('🔵 Admin dashboard initializing...');

    initializeAdmin();

    const navLinks = document.querySelectorAll('.admin-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    const hash = window.location.hash.replace('#', '');
    const validTabs = Object.keys(tabModules);
    if (hash && validTabs.includes(hash)) {
        setTimeout(() => switchTab(hash), 100);
    }

    const toggleBtn = document.getElementById('adminSidebarToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });
    }

    console.log('✅ Admin dashboard initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapAdmin);
} else {
    bootstrapAdmin();
}

export { supabaseInstance, adminUser, currentTab };
