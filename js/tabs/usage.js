// ============================================================
// tabs/usage.js - Usage & Analytics Tab
// ============================================================
// API quotas, data source ranges, registry growth, and
// observation volume over time.

let supabase = null;
let user = null;

// ============================================================
// DATA SOURCE RANGE DEFAULTS (localStorage)
// ============================================================

const DS_DEFAULTS = {
    cot:       { enabled: true, value: '52' },
    calendar:  { enabled: true, value: '3' },
    news:      { enabled: true, value: '12' },
    sentiment: { enabled: true, value: '0.3' },
};

const DS_KEY = 'fromple.dataSourceRanges';

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔵 Usage & Analytics tab initialized');

    hydrateDataRanges();
    attachDataRangeControls();
    attachExportButton();

    await Promise.all([
        loadRegistryStats(),
        loadConditionUsage(),
        loadObservationsByCategory(),
        loadObservationsOverTime(),
    ]);

    // API usage is rendered by profile.js; re-trigger a refresh in case
    if (window.loadApiUsage) window.loadApiUsage();
}

export async function refresh(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔄 Refreshing Usage & Analytics tab');

    hydrateDataRanges();

    await Promise.all([
        loadRegistryStats(),
        loadConditionUsage(),
        loadObservationsByCategory(),
        loadObservationsOverTime(),
    ]);
}

// ============================================================
// DATA SOURCE RANGES
// ============================================================

function getDataRanges() {
    try {
        const raw = localStorage.getItem(DS_KEY);
        if (!raw) return { ...DS_DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            cot:       { ...DS_DEFAULTS.cot,       ...(parsed.cot || {}) },
            calendar:  { ...DS_DEFAULTS.calendar,  ...(parsed.calendar || {}) },
            news:      { ...DS_DEFAULTS.news,      ...(parsed.news || {}) },
            sentiment: { ...DS_DEFAULTS.sentiment, ...(parsed.sentiment || {}) },
        };
    } catch {
        return { ...DS_DEFAULTS };
    }
}

function saveDataRanges(ranges) {
    try {
        localStorage.setItem(DS_KEY, JSON.stringify(ranges));
    } catch (err) {
        console.warn('Could not save data ranges:', err.message);
    }
}

function hydrateDataRanges() {
    const saved = getDataRanges();

    document.querySelectorAll('#tab-usage .ds-block').forEach(block => {
        const key = block.dataset.source;
        const cfg = saved[key];
        if (!cfg) return;

        const toggle = block.querySelector('[data-ds-toggle]');
        const value  = block.querySelector('[data-ds-value]');

        if (toggle) toggle.checked = !!cfg.enabled;
        if (value)  value.value = cfg.value;
    });
}

function readDataRangesFromUI() {
    const out = {};
    document.querySelectorAll('#tab-usage .ds-block').forEach(block => {
        const key = block.dataset.source;
        const toggle = block.querySelector('[data-ds-toggle]');
        const value  = block.querySelector('[data-ds-value]');
        out[key] = {
            enabled: toggle ? !!toggle.checked : true,
            value:   value ? value.value : DS_DEFAULTS[key]?.value,
        };
    });
    return out;
}

function attachDataRangeControls() {
    const btn = document.getElementById('saveDataRanges');
    if (btn && !btn.dataset.bound) {
        btn.addEventListener('click', () => {
            const ranges = readDataRangesFromUI();
            saveDataRanges(ranges);
            showToast('Data source ranges saved.', 'success');
        });
        btn.dataset.bound = 'true';
    }
}

// ============================================================
// REGISTRY STATS (four stat cards)
// ============================================================

async function loadRegistryStats() {
    const statValues = document.querySelectorAll('#tab-usage .stat-value');
    if (statValues.length < 4) return;

    let conditionsTracked  = 0;
    let totalObservations  = 0;
    let classesRegistered  = 0;
    let observationsToday  = 0;

    try {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);

        const [condRes, obsRes, classRes, obsTodayRes] = await Promise.all([
            supabase.from('condition_stats').select('condition_key', { count: 'exact', head: true }),
            supabase.from('observations').select('id', { count: 'exact', head: true }),
            supabase.from('classes').select('id', { count: 'exact', head: true }),
            supabase.from('observations')
                .select('id', { count: 'exact', head: true })
                .gte('fired_at', startOfDay.toISOString()),
        ]);

        conditionsTracked = condRes.count ?? 0;
        totalObservations = obsRes.count ?? 0;
        classesRegistered = classRes.count ?? 0;
        observationsToday = obsTodayRes.count ?? 0;
    } catch (err) {
        console.warn('Could not load registry stats:', err.message);
    }

    statValues[0].textContent = formatNumber(conditionsTracked);
    statValues[1].textContent = formatNumber(totalObservations);
    statValues[2].textContent = formatNumber(classesRegistered);
    statValues[3].textContent = formatNumber(observationsToday);
}

// ============================================================
// CONDITION USAGE (most + least used)
// ============================================================

async function loadConditionUsage() {
    const cards = document.querySelectorAll('#tab-usage .grid-2col .card');
    if (cards.length < 2) return;

    const mostList  = cards[0].querySelector('.feature-usage-list');
    const leastList = cards[1].querySelector('.feature-usage-list');
    if (!mostList || !leastList) return;

    let rows = [];

    try {
        const { data, error } = await supabase
            .from('condition_stats')
            .select('condition_key, favorable_count, unfavorable_count');

        if (error) throw error;

        // Aggregate by condition_key
        const map = {};
        (data || []).forEach(r => {
            const k = r.condition_key || '—';
            if (!map[k]) map[k] = 0;
            map[k] += (r.favorable_count || 0) + (r.unfavorable_count || 0);
        });

        rows = Object.entries(map).map(([condition_key, count]) => ({ condition_key, count }));
    } catch (err) {
        console.warn('Could not load condition usage:', err.message);
        return;
    }

    if (rows.length === 0) {
        const empty = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No condition data yet.
            </div>
        `;
        mostList.innerHTML = empty;
        leastList.innerHTML = empty;
        return;
    }

    rows.sort((a, b) => b.count - a.count);

    const most  = rows.slice(0, 5);
    const least = [...rows].reverse().slice(0, 5);

    renderConditionList(mostList, most, rows[0].count, false);
    renderConditionList(leastList, least, rows[0].count, true);
}

function renderConditionList(container, rows, maxCount, isLeast) {
    if (!rows.length) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No data available.
            </div>
        `;
        return;
    }

    container.innerHTML = rows.map(r => {
        const pct = Math.min((r.count / maxCount) * 100, 100);
        const colour = isLeast ? 'var(--gray-300)' : 'var(--primary)';
        return `
            <div class="feature-usage-item">
                <div class="feature-usage-info">
                    <span class="feature-usage-name">${escapeHtml(prettifyCondition(r.condition_key))}</span>
                    <span class="feature-usage-count">${formatNumber(r.count)} obs</span>
                </div>
                <div class="feature-usage-bar">
                    <div class="feature-usage-fill" style="width: ${pct}%; background: ${colour};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function prettifyCondition(key) {
    if (!key) return '—';
    return String(key)
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

// ============================================================
// OBSERVATIONS BY CATEGORY
// ============================================================

const CATEGORY_LABELS = {
    structure:   'Structure',
    indicator:   'Indicator',
    technical:   'Technical',
    fundamental: 'Fundamental',
    calendar:    'Calendar',
};

async function loadObservationsByCategory() {
    const container = document.querySelector('#tab-usage .adoption-list-full');
    if (!container) return;

    let rows = [];

    try {
        const { data, error } = await supabase
            .from('condition_stats')
            .select('condition_key, favorable_count, unfavorable_count');

        if (error) throw error;

        const counts = {};
        (data || []).forEach(r => {
            const cat = categoriseCondition(r.condition_key);
            if (!cat) return;
            counts[cat] = (counts[cat] || 0) + (r.favorable_count || 0) + (r.unfavorable_count || 0);
        });

        rows = Object.entries(counts)
            .map(([key, count]) => ({ key, count }))
            .sort((a, b) => b.count - a.count);
    } catch (err) {
        console.warn('Could not load category breakdown:', err.message);
        return;
    }

    if (rows.length === 0) return; // keep the static fallback

    const total = rows.reduce((a, b) => a + b.count, 0) || 1;

    container.innerHTML = rows.map(r => {
        const pct = Math.round((r.count / total) * 100);
        const label = CATEGORY_LABELS[r.key] || r.key;
        return `
            <div class="adoption-item-full">
                <div class="adoption-info-full">
                    <span class="adoption-module">${escapeHtml(label)}</span>
                    <span class="adoption-count">${formatNumber(r.count)} obs</span>
                    <span class="adoption-percent">${pct}%</span>
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
    if (k.startsWith('regime.') || k.includes('trend') || k.includes('consolidat')) return 'structure';
    if (k.startsWith('market.') || k.startsWith('state.') || k.includes('support') || k.includes('resistance') || k.includes('volume') || k.includes('volatility') || k.includes('wick')) return 'structure';
    if (k.startsWith('ind.') || k.startsWith('indicator.') || k.includes('sma') || k.includes('ema') || k.includes('rsi') || k.includes('macd') || k.includes('bollinger') || k.includes('atr')) return 'indicator';
    if (k.startsWith('tech.') || k.startsWith('technical.')) return 'technical';
    if (k.startsWith('cal.') || k.startsWith('calendar.') || k.includes('cpi') || k.includes('nfp') || k.includes('rate decision')) return 'calendar';
    if (k.startsWith('cot.') || k.includes('net long') || k.includes('net short') || k.includes('noncomm')) return 'fundamental';
    if (k.startsWith('news.') || k.startsWith('sentiment.') || k.includes('news') || k.includes('sentiment')) return 'fundamental';
    return null;
}

// ============================================================
// OBSERVATIONS OVER TIME
// ============================================================

async function loadObservationsOverTime() {
    const container = document.querySelector('#tab-usage .usage-timeline');
    if (!container) return;

    let byWeek = [];

    try {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 28);
        since.setUTCHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('observations')
            .select('fired_at')
            .gte('fired_at', since.toISOString())
            .order('fired_at', { ascending: true });

        if (error) throw error;

        // Bucket into 4 weeks, each week = 7 days
        const weeks = [];
        for (let w = 0; w < 4; w++) {
            weeks.push({ days: [0, 0, 0, 0, 0, 0, 0], total: 0 });
        }

        const start = since.getTime();
        const DAY = 24 * 60 * 60 * 1000;

        (data || []).forEach(r => {
            const t = new Date(r.fired_at).getTime();
            const dayIndex = Math.floor((t - start) / DAY);
            if (dayIndex < 0 || dayIndex >= 28) return;
            const weekIndex = Math.floor(dayIndex / 7);
            const dayOfWeek = dayIndex % 7;
            weeks[weekIndex].days[dayOfWeek] += 1;
            weeks[weekIndex].total += 1;
        });

        byWeek = weeks;
    } catch (err) {
        console.warn('Could not load observations over time:', err.message);
        return;
    }

    const maxValue = Math.max(...byWeek.map(w => Math.max(...w.days, w.total)), 1);

    container.innerHTML = byWeek.map((week, i) => {
        const bars = week.days.map(d => {
            const h = Math.max((d / maxValue) * 60, 2);
            const colour = d > 0 ? 'var(--primary)' : 'var(--gray-300)';
            return `<div class="usage-day-bar" style="height: ${h}px; background: ${colour};"></div>`;
        }).join('');

        return `
            <div class="usage-week">
                <span class="usage-week-label">Week ${i + 1}</span>
                <div class="usage-week-bars">${bars}</div>
                <span class="usage-week-total">${formatNumber(week.total)} obs</span>
            </div>
        `;
    }).join('');
}

// ============================================================
// EXPORT
// ============================================================

function attachExportButton() {
    const btn = document.getElementById('exportUsageBtn');
    if (!btn || btn.dataset.bound) return;

    btn.addEventListener('click', exportUsageData);
    btn.dataset.bound = 'true';
}

function exportUsageData() {
    showToast('Preparing export...', 'info');

    const statValues = document.querySelectorAll('#tab-usage .stat-value');

    const rows = [
        ['Metric', 'Value'],
        ['Conditions tracked', statValues[0]?.textContent || '0'],
        ['Total observations', statValues[1]?.textContent || '0'],
        ['Classes registered', statValues[2]?.textContent || '0'],
        ['Observations today', statValues[3]?.textContent || '0'],
        ['Exported at', new Date().toISOString()],
    ];

    // Add API usage snapshot
    rows.push(['', '']);
    rows.push(['API Provider', 'Used / Limit']);
    document.querySelectorAll('#tab-usage .api-card[data-provider]').forEach(card => {
        const name = card.querySelector('.api-name')?.textContent || card.dataset.provider;
        const text = card.querySelector('[data-usage-text]')?.textContent || '—';
        rows.push([name, text]);
    });

    // Add data source ranges
    rows.push(['', '']);
    rows.push(['Data Source', 'Lookback / Value']);
    const ranges = getDataRanges();
    Object.entries(ranges).forEach(([key, cfg]) => {
        rows.push([prettifyCondition(key), cfg.value + (cfg.enabled ? '' : ' (disabled)')]);
    });

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `fromple_usage_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Usage data exported.', 'success');
}

// ============================================================
// HELPERS
// ============================================================

function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString();
}

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
