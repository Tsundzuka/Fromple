// ============================================================
// PROFILE - MAIN ORCHESTRATOR
// ============================================================
// Loads session, handles tab switching, and wires the
// global gating toggle + API usage that live in the sidebar
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
let currentTab = 'overview';
let pollTimer = null;

// ============================================================
// TAB MODULE MAPPING
// ============================================================

const tabModules = {
    'overview': () => import('./tabs/overview.js'),
    'security': () => import('./tabs/security.js'),
    'settings': () => import('./tabs/settings.js'),
};

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

    // FIXED: use data-tab attribute, not id="tab-..."
    const selectedTab = document.querySelector(`.tab-content[data-tab="${tabId}"]`);
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

    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Log in to view your profile and account settings. <a href="/login.html" style="color: var(--primary); font-weight: 600;">Log in</a>`;
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
    if (planEl) planEl.textContent = 'Sandbox';

    const welcomeSubtitle = document.querySelector('.page-subtitle');
    if (welcomeSubtitle) {
        welcomeSubtitle.innerHTML = `Profile, security, and account settings for ${fullName}.`;
    }

    // Populate personal profile fields
    const fullNameInput = document.getElementById('personalFullName');
    const emailInput = document.getElementById('personalEmail');
    if (fullNameInput) fullNameInput.value = fullName;
    if (emailInput) emailInput.value = user.email || '';

    // Populate profile hero
    const heroName = document.getElementById('heroName');
    const heroEmail = document.getElementById('heroEmail');
    const heroAvatar = document.getElementById('heroAvatar');
    if (heroName) heroName.textContent = fullName;
    if (heroEmail) heroEmail.textContent = user.email || '—';
    if (heroAvatar) heroAvatar.textContent = initials;

    window.profileUser = user;
    window.supabaseInstance = supabaseInstance;
}

// ============================================================
// GATING STATE
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

        const sbToggle = document.getElementById('sbPipelineToggle');
        if (sbToggle) sbToggle.checked = isRunning;

        const ovToggle = document.getElementById('ovPipelineToggle');
        if (ovToggle) ovToggle.checked = isRunning;

        const dot = document.getElementById('ovPipelineDot');
        const label = document.getElementById('ovPipelineLabel');
        const sub = document.getElementById('ovPipelineSub');

        if (dot) dot.classList.toggle('on', isRunning);
        if (label) label.textContent = isRunning ? 'Gating enabled' : 'Gating disabled';
        if (sub) {
            sub.textContent = isRunning
                ? 'All new links require name and email.'
                : 'No gate is applied to new links.';
        }

        const lastRun = document.getElementById('ovLastRun');
        if (lastRun) {
            lastRun.textContent = updatedAt ? timeAgo(new Date(updatedAt)) : '—';
        }

        const sysDot = document.getElementById('sysStatusDot');
        const sysLabel = document.getElementById('sysStatusLabel');
        const sysSub = document.getElementById('sysStatusSub');
        const sysUpdated = document.getElementById('sysConfigUpdated');
        const sysLastSuccess = document.getElementById('sysLastCheck');

        if (sysDot) sysDot.classList.toggle('on', isRunning);
        if (sysLabel) sysLabel.textContent = isRunning ? 'Gating enabled' : 'Gating disabled';
        if (sysSub) {
            sysSub.textContent = isRunning
                ? 'All new links require name and email.'
                : 'No gate is applied to new links.';
        }
        if (sysUpdated && updatedAt) sysUpdated.textContent = timeAgo(new Date(updatedAt));
        if (sysLastSuccess && updatedAt) sysLastSuccess.textContent = timeAgo(new Date(updatedAt));

    } catch (err) {
        console.warn('Could not load system_state:', err.message);
    }
}

async function setGateRunning(isRunning) {
    if (!supabaseInstance) return;

    const sbToggle = document.getElementById('sbPipelineToggle');
    const ovToggle = document.getElementById('ovPipelineToggle');
    const sysToggle = document.getElementById('sysGateToggle');
    [sbToggle, ovToggle, sysToggle].forEach(t => { if (t) t.disabled = true; });

    try {
        const { error } = await supabaseInstance
            .from('system_state')
            .update({ is_running: isRunning, updated_at: new Date().toISOString() })
            .eq('id', 1);

        if (error) throw error;

        if (sbToggle) sbToggle.checked = isRunning;
        if (ovToggle) ovToggle.checked = isRunning;
        if (sysToggle) sysToggle.checked = isRunning;

        showToast(isRunning ? 'Gating enabled.' : 'Gating disabled.', 'success');

        setTimeout(loadApiUsage, 500);
    } catch (err) {
        console.error('Failed to toggle gating:', err);
        if (sbToggle) sbToggle.checked = !isRunning;
        if (ovToggle) ovToggle.checked = !isRunning;
        if (sysToggle) sysToggle.checked = !isRunning;
        showToast('Could not update gating state: ' + (err.message || err), 'error');
    } finally {
        [sbToggle, ovToggle, sysToggle].forEach(t => { if (t) t.disabled = false; });
    }
}

// ============================================================
// API USAGE
// ============================================================

const PROVIDERS = {
    supabase: { name: 'Supabase Storage',  limit: 1024,  note: 'MB stored' },
    gemini:   { name: 'Gemini Embeddings', limit: 1500,  note: 'Calls / day' },
    groq:     { name: 'Groq',              limit: 14400, note: 'Tokens / day' },
    resend:   { name: 'Resend',            limit: 100,   note: 'Emails / day' },
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
        console.warn('api_usage not available:', err.message);
    }

    renderSidebarUsage(usage);
    renderOverviewUsage(usage);
    renderSettingsUsage(usage);
}

function renderSidebarUsage(usage) {
    const supa = usage['supabase'];
    const fill = document.querySelector('.sb-api[data-provider="supabase"] [data-usage-fill]');
    const text = document.querySelector('.sb-api[data-provider="supabase"] [data-usage-text]');

    if (!supa || !supa.limit_value) {
        if (text) text.textContent = '— / 1024 MB';
        if (fill) fill.style.width = '0%';
        return;
    }

    const pct = Math.min((supa.used / supa.limit_value) * 100, 100);
    if (fill) {
        fill.style.width = pct + '%';
        fill.classList.toggle('warning', pct >= 70 && pct < 90);
        fill.classList.toggle('danger',  pct >= 90);
    }
    if (text) {
        text.textContent = `${supa.used.toLocaleString()} / ${supa.limit_value.toLocaleString()}`;
    }
}

function renderOverviewUsage(usage) {
    const el = document.getElementById('ovSupaUsage');
    if (!el) return;

    const supa = usage['supabase'];
    if (supa && supa.limit_value) {
        el.textContent = `${supa.used.toLocaleString()} / ${supa.limit_value.toLocaleString()}`;
    } else {
        el.textContent = '— / 1024 MB';
    }
}

function renderSettingsUsage(usage) {
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

    const supa = usage['supabase'];
    const warning = document.getElementById('sysQuotaWarning');
    if (warning) {
        const isHigh = supa && supa.limit_value && (supa.used / supa.limit_value) > 0.8;
        warning.hidden = !isHigh;
    }
}

// ============================================================
// SYSTEM CONTROLS
// ============================================================

function attachSystemControls() {
    const sbToggle = document.getElementById('sbPipelineToggle');
    if (sbToggle && !sbToggle.dataset.bound) {
        sbToggle.addEventListener('change', e => setGateRunning(e.target.checked));
        sbToggle.dataset.bound = 'true';
    }

    const ovToggle = document.getElementById('ovPipelineToggle');
    if (ovToggle && !ovToggle.dataset.bound) {
        ovToggle.addEventListener('change', e => setGateRunning(e.target.checked));
        ovToggle.dataset.bound = 'true';
    }

    const sysToggle = document.getElementById('sysGateToggle');
    if (sysToggle && !sysToggle.dataset.bound) {
        sysToggle.addEventListener('change', e => setGateRunning(e.target.checked));
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
// GLOBALS (for inline onclick handlers)
// ============================================================

window.switchTab = switchTab;

window.updatePersonalProfile = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveLinkDefaults = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveSecurityFeatures = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.saveNotificationPreferences = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.deleteAccount = function() {
    showToast('Settings tab not loaded yet. Please try again.', 'warning');
};

window.enableTfa = function() {
    showToast('Security tab not loaded yet. Please try again.', 'warning');
};

window.generateRecoveryCodes = function() {
    showToast('Security tab not loaded yet. Please try again.', 'warning');
};

window.logoutAllSessions = function() {
    showToast('Security tab not loaded yet. Please try again.', 'warning');
};

window.exportAllAnalytics = function() {
    showToast('Security tab not loaded yet. Please try again.', 'warning');
};

// ============================================================
// EVENT BINDING
// ============================================================

function attachEventListeners() {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

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

    await requireAuth();
    await initializeProfile();

    attachEventListeners();

    attachSystemControls();
    await loadSystemState();
    await loadApiUsage();
    startPolling();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            loadSystemState();
            loadApiUsage();
            startPolling();
        }
    });

    const hash = window.location.hash.replace('#', '');
    const validTabs = ['overview', 'security', 'settings'];
    const initialTab = validTabs.includes(hash) ? hash : 'overview';
    await switchTab(initialTab);

    console.log('✅ Profile initialized');
})();

// ============================================================
// EXPOSE FOR OTHER MODULES
// ============================================================

export { supabaseInstance, profileUser };
