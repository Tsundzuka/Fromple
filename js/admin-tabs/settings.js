// ============================================================
// admin-tabs/settings.js
// ============================================================
let supabase = null;
let user = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 settings tab initialized');

    attachEventListeners();
    await loadSettings();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing settings tab');
    await loadSettings();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadSettings() {
    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch('/api/admin/administrator?resource=settings', {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        renderSettings(data.settings || {});

    } catch (err) {
        console.error('loadSettings failed:', err);
        toast('Failed to load settings', 'error');
    }
}

async function getToken() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch {
        return null;
    }
}

// ============================================================
// RENDER
// ============================================================
function renderSettings(s) {
    // Unwrap string-quoted JSON values if needed
    const v = (key, fallback = '') => {
        const val = s[key];
        if (val === undefined || val === null) return fallback;
        if (typeof val === 'string') return val;
        return String(val);
    };

    const b = (key, fallback = false) => {
        const val = s[key];
        if (val === undefined || val === null) return fallback;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') return val === 'true';
        return Boolean(val);
    };

    // General
    setValue('siteName', v('site_name', 'Fromple'));
    setValue('contactEmail', v('contact_email', 'hello@fromple.ai'));
    setValue('supportEmail', v('support_email', 'support@fromple.ai'));

    // Feature flags
    setChecked('flagFind', b('feature_find', true));
    setChecked('flagDiagnose', b('feature_diagnose', true));
    setChecked('flagOptimize', b('feature_optimize', true));
    setChecked('flagMonitor', b('feature_monitor', true));
    setChecked('maintenanceMode', b('maintenance_mode', false));

    // AI settings
    setValue('aiProvider', v('ai_default_provider', 'tavily'));
    setValue('maxTokens', v('ai_max_tokens', '4000'));
    setValue('temperature', v('ai_temperature', '0.7'));
    setText('temperatureValue', v('ai_temperature', '0.7'));

    // Maintenance message
    setValue('maintenanceMessage', v('maintenance_message', ''));
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
        // Set option, add if missing
        let found = false;
        for (const opt of el.options) {
            if (opt.value === value) {
                el.value = value;
                found = true;
                break;
            }
        }
        if (!found && value) {
            const newOpt = document.createElement('option');
            newOpt.value = value;
            newOpt.textContent = value;
            el.appendChild(newOpt);
            el.value = value;
        }
    } else {
        el.value = value;
    }
}

function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ============================================================
// SAVE
// ============================================================
async function saveAllSettings() {
    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const payload = {
            settings: {
                site_name: document.getElementById('siteName')?.value || '',
                contact_email: document.getElementById('contactEmail')?.value || '',
                support_email: document.getElementById('supportEmail')?.value || '',

                feature_find: !!document.getElementById('flagFind')?.checked,
                feature_diagnose: !!document.getElementById('flagDiagnose')?.checked,
                feature_optimize: !!document.getElementById('flagOptimize')?.checked,
                feature_monitor: !!document.getElementById('flagMonitor')?.checked,
                maintenance_mode: !!document.getElementById('maintenanceMode')?.checked,

                ai_default_provider: document.getElementById('aiProvider')?.value || 'tavily',
                ai_max_tokens: parseInt(document.getElementById('maxTokens')?.value || '4000', 10),
                ai_temperature: parseFloat(document.getElementById('temperature')?.value || '0.7'),

                maintenance_message: document.getElementById('maintenanceMessage')?.value || '',
            },
        };

        const res = await fetch('/api/admin/administrator?resource=settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        toast(`Saved ${data.written?.length || 0} settings`, 'success');
    } catch (err) {
        console.error('saveAllSettings failed:', err);
        toast('Failed to save settings: ' + err.message, 'error');
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const tempSlider = document.getElementById('temperature');
    if (tempSlider) {
        tempSlider.addEventListener('input', function () {
            setText('temperatureValue', this.value);
        });
    }

    // Override global — the header Save All button calls this
    window.saveAllSettings = saveAllSettings;
}

// ============================================================
// HELPERS
// ============================================================
function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
}

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.saveAllSettings = saveAllSettings;
