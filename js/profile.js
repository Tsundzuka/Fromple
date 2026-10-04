// ============================================================
// PROFILE - MAIN ORCHESTRATOR
// ============================================================
// Loads session, handles tab switching, and wires the
// global pipeline toggle + API usage that live in the sidebar
// and Overview strip.

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
let pollTimer = null;

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

    await loadTab(tabId);
}

async function loadTab(tabId) {
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
    if (planEl) planEl.textContent = 'Research';

    const welcomeTitle = document.querySelector('.dashboard-header h1');
    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeTitle) welcomeTitle.textContent = 'Your Profile';
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Registry statistics, activity, and account settings for ${fullName}.`;
    }

    // Populate personal profile fields
    const fullNameInput = document.getElementById('personalFullName');
    const emailInput = document.getElementById('personalEmail');
    if (fullNameInput) fullNameInput.value = fullName;
    if (emailInput) emailInput.value = user.email || '';

    // Store user and supabase globally for tab modules
    window.profileUser = user;
    window.supabaseInstance = supabaseInstance;
}

// ============================================================
// PIPELINE STATE (sidebar + Overview toggle)
// ============================================================

async function loadSystemState() {
    if (!supabaseInstance) return;

    try {
        const { data, error } = await supabaseInstance
            .from('system_state')
            .select('is_running, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;

        const isRunning = !!data?.is_running;
        const updatedAt = data?.updated_at;

        // Sidebar toggle
        const sbToggle = document.getElementById('sbPipelineToggle');
        if (sbToggle) sbToggle.checked = isRunning;

        // Overview toggle
        const ovToggle = document.getElementById('ovPipelineToggle');
        if (ovToggle) ovToggle.checked = isRunning;

        // Overview dot + labels
        const dot = document.getElementById('ovPipelineDot');
        const label = document.getElementById('ovPipelineLabel');
        const sub = document.getElementById('ovPipelineSub');

        if (dot) dot.classList.toggle('on', isRunning);
        if (label) label.textContent = isRunning ? 'Pipeline active' : 'Pipeline stopped';
        if (sub) {
            sub.textContent = isRunning
                ? 'API queries are enabled. The pipeline will fetch market data on schedule.'
                : 'API queries are disabled.';
        }

        // Last run
        const lastRun = document.getElementById('ovLastRun');
        if (lastRun) {
            lastRun.textContent = updatedAt ? timeAgo(new Date(updatedAt)) : '—';
        }

        // Settings tab status (if present)
        const sysDot = document.getElementById('sysStatusDot');
        const sysLabel = document.getElementById('sysStatusLabel');
        const sysSub = document.getElementById('sysStatusSub');
        const sysUpdated = document.getElementById('sysStateUpdated');
        const sysLastSuccess = document.getElementById('sysLastSuccess');

        if (sysDot) sysDot.classList.toggle('on', isRunning);
        if (sysLabel) sysLabel.textContent = isRunning ? 'Pipeline active' : 'Pipeline stopped';
        if (sysSub) {
            sysSub.textContent = isRunning
                ? 'API queries are enabled.'
                : 'API queries are disabled.';
        }
        if (sysUpdated && updatedAt) sysUpdated.textContent = timeAgo(new Date(updatedAt));
        if (sysLastSuccess && updatedAt) sysLastSuccess.textContent = timeAgo(new Date(updatedAt));

    } catch (err) {
        console.warn('Could not load system_state:', err.message);
    }
}

async function setPipelineRunning(isRunning) {
    if (!supabaseInstance) return;

    // Disable both toggles during write
    const sbToggle = document.getElementById('sbPipelineToggle');
    const ovToggle = document.getElementById('ovPipelineToggle');
    if (sbToggle) sbToggle.disabled = true;
    if (ovToggle) ovToggle.disabled = true;

    try {
        const { error } = await supabaseInstance
            .from('system_state')
            .update({ is_running: isRunning, updated_at: new Date().toISOString() })
            .eq('id', 1);

        if (error) throw error;

        // Reflect on both
        if (sbToggle) sbToggle.checked = isRunning;
        if (ovToggle) ovToggle.checked = isRunning;

        showToast(isRunning ? 'Pipeline started.' : 'Pipeline stopped.', 'success');

        // Refresh usage shortly after
        setTimeout(loadApiUsage, 500);
    } catch (err) {
        console.error('Failed to toggle pipeline:', err);
        // Revert both
        if (sbToggle) sbToggle.checked = !isRunning;
        if (ovToggle) ovToggle.checked = !isRunning;
        showToast('Could not update pipeline state: ' + (err.message || err), 'error');
    } finally {
        if (sbToggle) sbToggle.disabled = false;
        if (ovToggle) ovToggle.disabled = false;
    }
}

// ============================================================
// API USAGE (sidebar mini-bar + Overview + Settings)
// ============================================================

const PROVIDERS = {
    twelvedata: { name: 'Twelve Data',   limit: 800,   note: 'OHLCV' },
    finnhub:    { name: 'Finnhub',       limit: 60,    note: 'Calendar' },
    fxnewsbias: { name: 'FXNewsBias',    limit: 25,    note: 'News' },
    upstash:    { name: 'Upstash Redis', limit: 10000, note: 'Temp state' },
    cftc:       { name: 'CFTC Socrata',  limit: 0,     note: 'COT' },
};

async function loadApiUsage() {
    if (!supabaseInstance) return;

    const usage = {};

    try {
        const { data, error } = await supabaseInstance
            .from('api_usage')
            .select('provider, used, limit_value, period_start, period_end')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        (data || []).forEach(row => {
            if (!usage[row.provider]) usage[row.provider] = row;
        });
    } catch (err) {
        // Table may not exist yet — degrade gracefully
        console.warn('api_usage not available:', err.message);
    }

    renderSidebarUsage(usage);
    renderOverviewUsage(usage);
    renderSettingsUsage(usage);
}

function renderSidebarUsage(usage) {
    const td = usage['twelvedata'];
    const fill = document.querySelector('.sb-api[data-provider="twelvedata"] [data-usage-fill]');
    const text = document.querySelector('.sb-api[data-provider="twelvedata"] [data-usage-text]');

    if (!td || !td.limit_value) {
        if (text) text.textContent = '— / 800';
        if (fill) fill.style.width = '0%';
        return;
    }

    const pct = Math.min((td.used / td.limit_value) * 100, 100);
    if (fill) {
        fill.style.width = pct + '%';
        fill.classList.toggle('warning', pct >= 70 && pct < 90);
        fill.classList.toggle('danger',  pct >= 90);
    }
    if (text) {
        text.textContent = `${td.used.toLocaleString()} / ${td.limit_value.toLocaleString()}`;
    }
}

function renderOverviewUsage(usage) {
    const el = document.getElementById('ovTdUsage');
    if (!el) return;

    const td = usage['twelvedata'];
    if (td && td.limit_value) {
        el.textContent = `${td.used.toLocaleString()} / ${td.limit_value.toLocaleString()}`;
    } else {
        el.textContent = '— / 800';
    }
}

function renderSettingsUsage(usage) {
    // Update every card in the Settings / Usage tab that carries data-provider
    document.querySelectorAll('.api-card[data-provider]').forEach(card => {
        const key = card.dataset.provider;
        const cfg = PROVIDERS[key];
        const row = usage[key];

        const fill = card.querySelector('[data-usage-fill]');
        const text = card.querySelector('[data-usage-text]');
        const limit = row?.limit_value ?? cfg?.limit ?? 0;
        const used = row?.used ?? 0;

        if (!limit) {
            if (text) text.textContent = '—';
            if (fill) fill.style.width = '0%';
            return;
        }

        const pct = Math.min((used / limit) * 100, 100);
        if (fill) {
            fill.style.width = pct + '%';
            fill.classList.toggle('warning', pct >= 70 && pct < 90);
            fill.classList.toggle('danger',  pct >= 90);
        }
        if (text) {
            text.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;
        }
    });

    // Show quota warning in Settings if TD > 80%
    const td = usage['twelvedata'];
    const warning = document.getElementById('sysQuotaWarning');
    if (warning) {
        const isHigh = td && td.limit_value && (td.used / td.limit_value) > 0.8;
        warning.hidden = !isHigh;
    }
}

// ============================================================
// SYSTEM CONTROLS — attach both toggles
// ============================================================

function attachSystemControls() {
    const sbToggle = document.getElementById('sbPipelineToggle');
    if (sbToggle && !sbToggle.dataset.bound) {
        sbToggle.addEventListener('change', e => setPipelineRunning(e.target.checked));
        sbToggle.dataset.bound = 'true';
    }

    const ovToggle = document.getElementById('ovPipelineToggle');
    if (ovToggle && !ovToggle.dataset.bound) {
        ovToggle.addEventListener('change', e => setPipelineRunning(e.target.checked));
        ovToggle.dataset.bound = 'true';
    }

    const sysToggle = document.getElementById('sysPipelineToggle');
    if (sysToggle && !sysToggle.dataset.bound) {
        sysToggle.addEventListener('change', e => setPipelineRunning(e.target.checked));
        sysToggle.dataset.bound = 'true';
    }
}

// ============================================================
// POLLING
// ============================================================

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        loadSystemState();
        loadApiUsage();
    }, 60000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ============================================================
// HELPERS
// ============================================================

function timeAgo(date) {
    if (!date || isNaN(date.getTime())) return '—';
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return secs + 's ago';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

// ============================================================
// GLOBALS (for inline onclick handlers and legacy compatibility)
// ============================================================

window.switchTab = switchTab;

// Stub functions — overwritten by tabs when they load
window.updatePersonalProfile = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveTradingParameters = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveDataSources = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveNotificationPreferences = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.deleteAccount = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.exportUsageData = function() {
    showToast('Usage & Analytics tab not loaded yet. Please try again.', 'warning');
};

window.reviewSetup = function() {
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.flagSetup = function() {
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

window.dismissSetup = function() {
    showToast('Review tab not loaded yet. Please try again.', 'warning');
};

// ============================================================
// EVENT BINDING
// ============================================================

function attachEventListeners() {
    // Sidebar nav
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Sidebar toggle (mobile)
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

(async function bootstrap() {
    console.log('🔵 Profile initializing...');

    // 1. Auth guard — redirects to login if no session
    await requireAuth();

    // 2. Load session + update UI
    await initializeProfile();

    // 3. Bind tab clicks + sidebar toggle
    attachEventListeners();

    // 4. Wire pipeline toggle + API usage (sidebar + Overview)
    attachSystemControls();
    await loadSystemState();
    await loadApiUsage();
    startPolling();

    // 5. Stop polling when the page is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            loadSystemState();
            loadApiUsage();
            startPolling();
        }
    });

    // 6. Resolve initial tab from hash
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['overview', 'review', 'usage', 'settings'];
    const initialTab = validTabs.includes(hash) ? hash : 'overview';
    await switchTab(initialTab);

    console.log('✅ Profile initialized');
})();

// ============================================================
// EXPOSE FOR OTHER MODULES
// ============================================================

export { supabaseInstance, profileUser, currentOrganizationId };
