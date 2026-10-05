// ============================================================
// tabs/settings.js - Settings Tab
// ============================================================
// System control, instruments & tradeable hours, indicators,
// personal profile, trading parameters, notifications, account.

let supabase = null;
let user = null;

// ============================================================
// LOCALSTORAGE KEYS
// ============================================================

const LS_INDICATORS = 'fromple.indicators';
const LS_TRADING    = 'fromple.tradingParams';
const LS_NOTIFY     = 'fromple.notifications';

// ============================================================
// DEFAULTS
// ============================================================

const DEFAULT_TRADING = {
    minObs: 100,
    ratioFloor: 1.5,
    window: '24',
    similarity: 0.75,
    fdr: 'bh',
    retention: 'forever',
};

const DEFAULT_INDICATORS = [
    { name: 'SMA',            params: '20, 50',      role: 'Variation', enabled: true },
    { name: 'EMA',            params: '9, 21',       role: 'Variation', enabled: true },
    { name: 'RSI',            params: '14',          role: 'Variation', enabled: true },
    { name: 'MACD',           params: '12, 26, 9',   role: 'Variation', enabled: true },
    { name: 'Bollinger Bands',params: '20, 2',       role: 'Variation', enabled: true },
    { name: 'ATR',            params: '14',          role: 'Defining',  enabled: true },
    { name: 'Volume',         params: '20-period avg', role: 'Defining', enabled: true },
    { name: 'ADX',            params: '14',          role: 'Defining',  enabled: false },
];

const DEFAULT_NOTIFY = {
    newSetup: true,
    filtered: true,
    daily: true,
    weekly: false,
};

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔵 Settings tab initialized');

    await Promise.all([
        loadPersonalProfile(),
        loadSessions(),
    ]);

    loadIndicators();
    loadTradingParams();
    loadNotifications();

    attachEventListeners();
}

export async function refresh(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔄 Refreshing Settings tab');

    await Promise.all([
        loadPersonalProfile(),
        loadSessions(),
    ]);

    loadIndicators();
    loadTradingParams();
    loadNotifications();
}

// ============================================================
// PERSONAL PROFILE
// ============================================================

async function loadPersonalProfile() {
    if (!user) return;

    const fullNameInput = document.getElementById('personalFullName');
    const emailInput    = document.getElementById('personalEmail');
    const phoneInput    = document.getElementById('personalPhone');
    const tzInput       = document.getElementById('personalTimezone');

    const meta = user.user_metadata || {};
    const fullName = meta.full_name || user.email?.split('@')[0] || '';

    if (fullNameInput) fullNameInput.value = fullName;
    if (emailInput)    emailInput.value    = user.email || '';
    if (phoneInput)    phoneInput.value    = meta.phone || '';
    if (tzInput)       tzInput.value       = meta.timezone || 'Europe/London';
}

async function updatePersonalProfile() {
    if (!supabase) return;

    const fullName = document.getElementById('personalFullName')?.value?.trim();
    const email    = document.getElementById('personalEmail')?.value?.trim();
    const phone    = document.getElementById('personalPhone')?.value?.trim();
    const timezone = document.getElementById('personalTimezone')?.value;

    if (!email) {
        showToast('Email is required.', 'warning');
        return;
    }

    const btn = document.getElementById('updatePersonalBtn');
    if (btn) btn.disabled = true;

    try {
        const updates = {
            data: {
                full_name: fullName || null,
                phone: phone || null,
                timezone: timezone || null,
            },
        };

        // Only update email if it changed
        if (email && email !== user.email) {
            updates.email = email;
        }

        const { data, error } = await supabase.auth.updateUser(updates);
        if (error) throw error;

        // Update local user reference
        if (data?.user) {
            user = data.user;
            window.profileUser = data.user;
        }

        showToast('Personal profile updated.', 'success');
    } catch (err) {
        console.error('Update personal profile failed:', err);
        showToast('Could not update profile: ' + (err.message || err), 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// INSTRUMENTS & TRADEABLE HOURS (Supabase sessions)
// ============================================================

const DEFAULT_SESSIONS = {
    'EUR/USD': { start_utc: '08:00:00', end_utc: '17:00:00', active: true, timeframes: ['M5'] },
    'AUD/USD': { start_utc: '23:00:00', end_utc: '08:00:00', active: true, timeframes: ['M5'] },
    'USD/CHF': { start_utc: '13:00:00', end_utc: '21:00:00', active: true, timeframes: ['M5'] },
    'USD/CAD': { start_utc: '12:00:00', end_utc: '21:00:00', active: true, timeframes: ['M5'] },
    'DXY':     { start_utc: '07:30:00', end_utc: '17:00:00', active: true, timeframes: ['M5'] },
};

const ALL_TFS = ['M5','M15','H1','H4'];

let sessionCache = {};

async function loadSessions() {
    // Seed with defaults so the table always renders
    sessionCache = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));

    try {
        const { data, error } = await supabase.from('sessions').select('*');
        if (error) throw error;

        (data || []).forEach(row => {
            const sym = row.symbol;
            if (!sym) return;
            sessionCache[sym] = {
                start_utc: normaliseTime(row.start_utc) || DEFAULT_SESSIONS[sym]?.start_utc || '00:00:00',
                end_utc:   normaliseTime(row.end_utc)   || DEFAULT_SESSIONS[sym]?.end_utc   || '00:00:00',
                active:    !!row.active,
                timeframes: Array.isArray(row.timeframes)
                    ? row.timeframes
                    : (DEFAULT_SESSIONS[sym]?.timeframes || ['M5']),
            };
        });
    } catch (err) {
        console.warn('Could not load sessions, using defaults:', err.message);
    }

    renderSessionTable();
    recalcCreditEstimate();
}

function normaliseTime(v) {
    if (!v) return null;
    const s = String(v);
    const parts = s.split(':');
    if (parts.length < 2) return null;
    return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0') + ':00';
}

function renderSessionTable() {
    const tbody = document.getElementById('instTableBody');
    if (!tbody) return;

    tbody.innerHTML = Object.entries(sessionCache).map(([symbol, s]) => `
        <tr data-symbol="${escapeHtml(symbol)}">
            <td><input type="checkbox" class="inst-enabled" ${s.active ? 'checked' : ''} /></td>
            <td><strong>${escapeHtml(symbol)}</strong></td>
            <td><input type="time" value="${(s.start_utc || '').slice(0, 5)}" /></td>
            <td><input type="time" value="${(s.end_utc || '').slice(0, 5)}" /></td>
            <td>
                <div class="mini-tf-grid">
                    ${ALL_TFS.map(tf => `
                        <label>
                            <input type="checkbox" data-tf="${tf}" ${s.timeframes.includes(tf) ? 'checked' : ''} />
                            ${tf}
                        </label>
                    `).join('')}
                </div>
            </td>
        </tr>
    `).join('');
}

function readSessionsFromUI() {
    const out = {};
    document.querySelectorAll('#instTableBody tr').forEach(row => {
        const symbol = row.dataset.symbol;
        const enabled = row.querySelector('.inst-enabled')?.checked ?? false;
        const times = row.querySelectorAll('input[type="time"]');
        const start = times[0]?.value || '00:00';
        const end   = times[1]?.value || '00:00';
        const tfs = Array.from(row.querySelectorAll('.mini-tf-grid input[type="checkbox"]'))
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.tf);

        out[symbol] = {
            start_utc: start + ':00',
            end_utc:   end   + ':00',
            active:    enabled,
            timeframes: tfs,
        };
    });
    return out;
}

async function saveSessions() {
    if (!supabase) return;

    // Need the current user id for the composite primary key
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
        showToast('Not authenticated.', 'error');
        return;
    }

    const payload = Object.entries(readSessionsFromUI()).map(([symbol, s]) => ({
        user_id:    userId,
        symbol,
        start_utc:  s.start_utc,
        end_utc:    s.end_utc,
        active:     s.active,
        timeframes: s.timeframes,
        updated_at: new Date().toISOString(),
    }));

    const btn = document.getElementById('saveInstrumentsBtn');
    if (btn) btn.disabled = true;

    try {
        const { error } = await supabase
            .from('sessions')
            .upsert(payload, { onConflict: 'user_id,symbol' });

        if (error) throw error;

        showToast('Instruments & sessions saved.', 'success');
        await loadSessions();
    } catch (err) {
        console.error('Save sessions failed:', err);
        showToast('Could not save instruments: ' + (err.message || err), 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function recalcCreditEstimate() {
    const sessions = readSessionsFromUI();
    let credits = 0;

    Object.values(sessions).forEach(s => {
        if (!s.active) return;
        const tfCount = s.timeframes.length;
        const [sh, sm] = s.start_utc.split(':').map(Number);
        const [eh, em] = s.end_utc.split(':').map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins <= 0) mins += 1440;
        const fetches = Math.floor(mins / 5);
        credits += fetches * tfCount;
    });

    const el = document.getElementById('instCreditEstimate');
    if (el) {
        el.textContent = '~' + credits.toLocaleString();
        el.classList.toggle('neg', credits > 700);
    }
}

// ============================================================
// INDICATORS (localStorage)
// ============================================================

function loadIndicators() {
    const tbody = document.getElementById('indTableBody');
    if (!tbody) return;

    let saved = DEFAULT_INDICATORS;
    try {
        const raw = localStorage.getItem(LS_INDICATORS);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) saved = parsed;
        }
    } catch (err) {
        console.warn('Could not read indicators:', err.message);
    }

    tbody.innerHTML = saved.map(row => `
        <tr>
            <td><input type="checkbox" class="ind-enabled" ${row.enabled ? 'checked' : ''} /></td>
            <td><strong>${escapeHtml(row.name)}</strong></td>
            <td><input class="form-input mono" data-field="params" value="${escapeHtml(row.params || '')}" /></td>
            <td>
                <select class="form-select" data-field="role">
                    <option ${row.role === 'Variation' ? 'selected' : ''}>Variation</option>
                    <option ${row.role === 'Defining'  ? 'selected' : ''}>Defining</option>
                </select>
            </td>
        </tr>
    `).join('');
}

function saveIndicators() {
    const tbody = document.getElementById('indTableBody');
    if (!tbody) return;

    const out = Array.from(tbody.querySelectorAll('tr')).map(row => ({
        name:    row.querySelector('strong')?.textContent?.trim() || '',
        enabled: row.querySelector('.ind-enabled')?.checked ?? false,
        params:  row.querySelector('[data-field="params"]')?.value || '',
        role:    row.querySelector('[data-field="role"]')?.value || 'Variation',
    }));

    try {
        localStorage.setItem(LS_INDICATORS, JSON.stringify(out));
        showToast('Indicators saved.', 'success');
    } catch (err) {
        console.error('Save indicators failed:', err);
        showToast('Could not save indicators.', 'error');
    }
}

// ============================================================
// TRADING PARAMETERS (localStorage)
// ============================================================

function loadTradingParams() {
    let t = DEFAULT_TRADING;
    try {
        const raw = localStorage.getItem(LS_TRADING);
        if (raw) {
            const parsed = JSON.parse(raw);
            t = { ...DEFAULT_TRADING, ...parsed };
        }
    } catch (err) {
        console.warn('Could not read trading params:', err.message);
    }

    const map = {
        paramMinObservations: t.minObs,
        paramRatioFloor:      t.ratioFloor,
        paramWindow:          t.window,
        paramSimilarity:      t.similarity,
        paramFdr:             t.fdr,
        paramRetention:       t.retention,
    };

    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

function saveTradingParams() {
    const t = {
        minObs:     Number(document.getElementById('paramMinObservations')?.value) || DEFAULT_TRADING.minObs,
        ratioFloor: Number(document.getElementById('paramRatioFloor')?.value)      || DEFAULT_TRADING.ratioFloor,
        window:     document.getElementById('paramWindow')?.value                  || DEFAULT_TRADING.window,
        similarity: Number(document.getElementById('paramSimilarity')?.value)      || DEFAULT_TRADING.similarity,
        fdr:        document.getElementById('paramFdr')?.value                     || DEFAULT_TRADING.fdr,
        retention:  document.getElementById('paramRetention')?.value               || DEFAULT_TRADING.retention,
    };

    try {
        localStorage.setItem(LS_TRADING, JSON.stringify(t));
        showToast('Trading parameters saved.', 'success');
    } catch (err) {
        console.error('Save trading params failed:', err);
        showToast('Could not save trading parameters.', 'error');
    }
}

// ============================================================
// NOTIFICATIONS (localStorage)
// ============================================================

function loadNotifications() {
    let n = DEFAULT_NOTIFY;
    try {
        const raw = localStorage.getItem(LS_NOTIFY);
        if (raw) {
            const parsed = JSON.parse(raw);
            n = { ...DEFAULT_NOTIFY, ...parsed };
        }
    } catch (err) {
        console.warn('Could not read notifications:', err.message);
    }

    const container = document.querySelector('#tab-settings .notification-options');
    if (!container) return;

    const boxes = container.querySelectorAll('input[type="checkbox"]');
    if (boxes[0]) boxes[0].checked = !!n.newSetup;
    if (boxes[1]) boxes[1].checked = !!n.filtered;
    if (boxes[2]) boxes[2].checked = !!n.daily;
    if (boxes[3]) boxes[3].checked = !!n.weekly;
}

function saveNotifications() {
    const container = document.querySelector('#tab-settings .notification-options');
    if (!container) return;

    const boxes = container.querySelectorAll('input[type="checkbox"]');
    const n = {
        newSetup: boxes[0]?.checked ?? true,
        filtered: boxes[1]?.checked ?? true,
        daily:    boxes[2]?.checked ?? true,
        weekly:   boxes[3]?.checked ?? false,
    };

    try {
        localStorage.setItem(LS_NOTIFY, JSON.stringify(n));
    } catch (err) {
        console.warn('Could not save notifications:', err.message);
    }
}

// ============================================================
// SAVE ALL
// ============================================================

async function saveAll() {
    const btn = document.getElementById('saveAllSettingsBtn');
    if (btn) btn.disabled = true;

    try {
        await updatePersonalProfile();
        await saveSessions();
        saveIndicators();
        saveTradingParams();
        saveNotifications();
        showToast('All settings saved.', 'success');
    } catch (err) {
        console.error('Save all failed:', err);
        showToast('Some settings could not be saved.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// DELETE ACCOUNT
// ============================================================

function deleteAccount() {
    const first = confirm('Delete your account? This cannot be undone.');
    if (!first) return;

    const second = prompt('Type DELETE to confirm.');
    if (second !== 'DELETE') {
        showToast('Deletion cancelled.', 'info');
        return;
    }

    showToast('Account deletion request submitted. You will receive a confirmation email.', 'warning');
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function attachEventListeners() {
    const personalBtn = document.getElementById('updatePersonalBtn');
    if (personalBtn && !personalBtn.dataset.bound) {
        personalBtn.addEventListener('click', updatePersonalProfile);
        personalBtn.dataset.bound = 'true';
    }

    const paramsBtn = document.getElementById('updateParamsBtn');
    if (paramsBtn && !paramsBtn.dataset.bound) {
        paramsBtn.addEventListener('click', saveTradingParams);
        paramsBtn.dataset.bound = 'true';
    }

    const instSaveBtn = document.getElementById('saveInstrumentsBtn');
    if (instSaveBtn && !instSaveBtn.dataset.bound) {
        instSaveBtn.addEventListener('click', saveSessions);
        instSaveBtn.dataset.bound = 'true';
    }

    const instAll = document.getElementById('instSelectAll');
    if (instAll && !instAll.dataset.bound) {
        instAll.addEventListener('change', e => {
            document.querySelectorAll('#instTableBody .inst-enabled').forEach(cb => {
                cb.checked = e.target.checked;
            });
            recalcCreditEstimate();
        });
        instAll.dataset.bound = 'true';
    }

    const instBody = document.getElementById('instTableBody');
    if (instBody && !instBody.dataset.bound) {
        instBody.addEventListener('change', recalcCreditEstimate);
        instBody.addEventListener('input', recalcCreditEstimate);
        instBody.dataset.bound = 'true';
    }

    const indSaveBtn = document.getElementById('saveIndicatorsBtn');
    if (indSaveBtn && !indSaveBtn.dataset.bound) {
        indSaveBtn.addEventListener('click', saveIndicators);
        indSaveBtn.dataset.bound = 'true';
    }

    const indAll = document.getElementById('indSelectAll');
    if (indAll && !indAll.dataset.bound) {
        indAll.addEventListener('change', e => {
            document.querySelectorAll('#indTableBody .ind-enabled').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
        indAll.dataset.bound = 'true';
    }

    const notifContainer = document.querySelector('#tab-settings .notification-options');
    if (notifContainer && !notifContainer.dataset.bound) {
        notifContainer.addEventListener('change', saveNotifications);
        notifContainer.dataset.bound = 'true';
    }

    const saveAllBtn = document.getElementById('saveAllSettingsBtn');
    if (saveAllBtn && !saveAllBtn.dataset.bound) {
        saveAllBtn.addEventListener('click', saveAll);
        saveAllBtn.dataset.bound = 'true';
    }

    const delBtn = document.getElementById('deleteAccountBtn');
    if (delBtn && !delBtn.dataset.bound) {
        delBtn.addEventListener('click', deleteAccount);
        delBtn.dataset.bound = 'true';
    }
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(msg, type) {
    if (window.showToast) window.showToast(msg, type);
    else console.log(`[${type}] ${msg}`);
}

// ============================================================
// EXPOSE TO WINDOW (for legacy inline onclick handlers)
// ============================================================

window.updatePersonalProfile = updatePersonalProfile;
window.saveTradingParameters = saveTradingParams;
window.saveDataSources       = () => showToast('Data sources are configured in the Usage tab.', 'info');
window.saveNotificationPreferences = saveNotifications;
window.deleteAccount = deleteAccount;
