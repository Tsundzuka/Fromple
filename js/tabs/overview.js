// ============================================================
// tabs/overview.js - Overview Tab
// ============================================================
// Loads registry stats, top performing classes, category load,
// and recent registry activity. Pipeline status is handled
// globally by profile.js — this module does not touch it.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔵 Overview tab initialized');

    await Promise.all([
        loadRegistryStats(),
        loadTopClasses(),
        loadCategoryLoad(),
        loadRecentActivity(),
    ]);
}

export async function refresh(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔄 Refreshing Overview tab');

    await Promise.all([
        loadRegistryStats(),
        loadTopClasses(),
        loadCategoryLoad(),
        loadRecentActivity(),
    ]);
}

// ============================================================
// REGISTRY STATS (four stat cards)
// ============================================================

async function loadRegistryStats() {
    const statValues = document.querySelectorAll('#tab-overview .stat-value');
    if (statValues.length < 4) return;

    // Defaults in case tables aren't populated yet
    let totalObservations = 0;
    let totalClasses = 0;
    let activeSignals = 0;
    let filteredSetups = 0;

    try {
        const [obsRes, classRes, activeSigRes, filteredSigRes] = await Promise.all([
            supabase.from('observations').select('id', { count: 'exact', head: true }),
            supabase.from('classes').select('id', { count: 'exact', head: true }),
            supabase.from('signals').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('signals').select('id', { count: 'exact', head: true }).eq('status', 'filtered'),
        ]);

        totalObservations = obsRes.count ?? 0;
        totalClasses      = classRes.count ?? 0;
        activeSignals     = activeSigRes.count ?? 0;
        filteredSetups    = filteredSigRes.count ?? 0;
    } catch (err) {
        console.warn('Could not load registry stats, using fallbacks:', err.message);
    }

    statValues[0].textContent = formatNumber(totalObservations);
    statValues[1].textContent = formatNumber(totalClasses);
    statValues[2].textContent = formatNumber(activeSignals);
    statValues[3].textContent = formatNumber(filteredSetups);
}

// ============================================================
// TOP PERFORMING CLASSES
// ============================================================

async function loadTopClasses() {
    const container = document.querySelector('#tab-overview .feature-usage-list');
    if (!container) return;

    let classes = [];

    try {
        const { data, error } = await supabase
            .from('classes')
            .select('class_code, occurrences, market_state, regime')
            .order('occurrences', { ascending: false })
            .limit(5);

        if (error) throw error;
        classes = data || [];
    } catch (err) {
        console.warn('Could not load top classes:', err.message);
        return;
    }

    if (classes.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No classes registered yet.
            </div>
        `;
        return;
    }

    const maxOccurrences = Math.max(...classes.map(c => c.occurrences || 0), 1);

    container.innerHTML = classes.map(c => {
        const pct = Math.min(((c.occurrences || 0) / maxOccurrences) * 100, 100);
        const label = describeClass(c);
        return `
            <div class="feature-usage-item">
                <div class="feature-usage-info">
                    <span class="feature-usage-name">Class ${escapeHtml(c.class_code || '—')} · ${escapeHtml(label)}</span>
                    <span class="feature-usage-count">${formatNumber(c.occurrences || 0)} obs</span>
                </div>
                <div class="feature-usage-bar">
                    <div class="feature-usage-fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function describeClass(c) {
    const regime = (c.regime || '').toLowerCase();
    const state = c.market_state || {};

    if (state.position === 'support' || state.at_support) return 'At support';
    if (state.position === 'resistance' || state.at_resistance) return 'At resistance';
    if (state.volatility === 'expanding') return 'Volatility expansion';
    if (state.volume === 'high') return 'Elevated volume';
    if (regime.includes('up')) return 'Trend continuation';
    if (regime.includes('down')) return 'Downtrend reversal';
    return 'Registered pattern';
}

// ============================================================
// CATEGORY LOAD
// ============================================================

const CATEGORIES = [
    { key: 'regime',      label: 'Regime' },
    { key: 'market_state',label: 'Market State' },
    { key: 'indicators',  label: 'Indicators' },
    { key: 'calendar',    label: 'Calendar' },
    { key: 'cot',         label: 'COT' },
    { key: 'sentiment',   label: 'Sentiment' },
];

async function loadCategoryLoad() {
    // Find the adoption list inside the Category Load card
    const container = document.querySelector('#tab-overview .adoption-list');
    const badge = document.querySelector('#tab-overview .card .badge.info');
    if (!container) return;

    // Count conditions per category from condition_stats
    const counts = {};

    try {
        const { data, error } = await supabase
            .from('condition_stats')
            .select('condition_key');

        if (error) throw error;

        (data || []).forEach(row => {
            const cat = categoriseCondition(row.condition_key);
            if (cat) counts[cat] = (counts[cat] || 0) + 1;
        });
    } catch (err) {
        console.warn('Could not load category load:', err.message);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

    // If no data, keep the static fallback already in HTML
    if (total <= 1 && Object.keys(counts).length === 0) return;

    // Update badge
    if (badge) badge.textContent = `${total} conditions`;

    container.innerHTML = CATEGORIES.map(c => {
        const n = counts[c.key] || 0;
        const pct = Math.round((n / total) * 100);
        return `
            <div class="adoption-item">
                <div class="adoption-info">
                    <span class="adoption-module">${c.label}</span>
                    <span class="adoption-count">${n}/${total}</span>
                </div>
                <div class="adoption-bar">
                    <div class="adoption-fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function categoriseCondition(key) {
    if (!key) return null;
    const k = key.toLowerCase();
    if (k.startsWith('regime.') || k.includes('trend') || k.includes('consolidat')) return 'regime';
    if (k.startsWith('market.') || k.startsWith('state.') || k.includes('support') || k.includes('resistance') || k.includes('volume') || k.includes('volatility') || k.includes('wick')) return 'market_state';
    if (k.startsWith('ind.') || k.startsWith('indicator.') || k.includes('sma') || k.includes('ema') || k.includes('rsi') || k.includes('macd') || k.includes('bollinger') || k.includes('atr')) return 'indicators';
    if (k.startsWith('cal.') || k.startsWith('calendar.') || k.includes('cpi') || k.includes('nfp') || k.includes('rate decision')) return 'calendar';
    if (k.startsWith('cot.') || k.includes('net long') || k.includes('net short') || k.includes('noncomm')) return 'cot';
    if (k.startsWith('news.') || k.startsWith('sentiment.') || k.includes('news') || k.includes('sentiment')) return 'sentiment';
    return null;
}

// ============================================================
// RECENT REGISTRY ACTIVITY
// ============================================================

async function loadRecentActivity() {
    const tbody = document.querySelector('#tab-overview .activity-container .activity-table tbody');
    if (!tbody) return;

    let rows = [];

    try {
        const { data, error } = await supabase
            .from('observations')
            .select(`
                id,
                fired_at,
                direction,
                favorable_pips,
                adverse_pips,
                signals:signal_id ( signal_code, class_id ),
                classes:class_id ( class_code )
            `)
            .order('fired_at', { ascending: false })
            .limit(5);

        if (error) throw error;
        rows = data || [];
    } catch (err) {
        console.warn('Could not load recent activity:', err.message);
        return;
    }

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:40px;color:var(--gray-500);">
                    No recent activity to show.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const signalCode = r.signals?.signal_code || '—';
        const classCode  = r.classes?.class_code || '—';
        const dir        = r.direction === 'short' ? 'Short' : 'Long';
        const fav        = num(r.favorable_pips);
        const adv        = num(r.adverse_pips);

        return `
            <tr>
                <td><strong>Signal recorded</strong></td>
                <td>${escapeHtml(signalCode)} · ${dir} · +${fav} / −${adv}</td>
                <td>Class ${escapeHtml(classCode)}</td>
                <td class="activity-time">${timeAgo(new Date(r.fired_at))}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// HELPERS
// ============================================================

function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString();
}

function num(v) {
    if (v == null || isNaN(v)) return 0;
    return Math.abs(Math.round(Number(v)));
}

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

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
