// ============================================================
// admin-tabs/analytics.js
// ============================================================
let supabase = null;
let user = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 analytics tab initialized');

    attachEventListeners();
    await loadAnalytics();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing analytics tab');
    await loadAnalytics();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadAnalytics() {
    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const period = document.getElementById('analyticsPeriod')?.value || '30d';
        const res = await fetch(`/api/admin/administrator?resource=analytics&period=${period}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        renderStats(data);
        renderBreakdown(data.breakdown || {}, data.breakdownMax || 1);

    } catch (err) {
        console.error('loadAnalytics failed:', err);
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
function renderStats(d) {
    setDelta('userGrowthRate', d.userGrowthRate ?? 0, '%');
    setDelta('revenueGrowthRate', d.revenueGrowthRate ?? 0, '%');
    setText('conversionRate', (d.conversionRate ?? 0) + '%');
    setText('churnRate', (d.churnRate ?? 0) + '%');
}

function setDelta(id, value, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    const sign = value > 0 ? '+' : '';
    el.textContent = `${sign}${value}${suffix}`;
    el.className = 'mini-value ' + (value > 0 ? 'positive' : value < 0 ? 'negative' : '');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderBreakdown(b, max) {
    // Starter
    setText('breakdownStarter', b.starter ?? 0);
    setBar('breakdownStarterBar', b.starter ?? 0, max);

    // Pro Agency
    setText('breakdownPro', b.pro_agency ?? 0);
    setBar('breakdownProBar', b.pro_agency ?? 0, max);

    // Growth
    setText('breakdownGrowth', b.growth ?? 0);
    setBar('breakdownGrowthBar', b.growth ?? 0, max);

    // Enterprise
    setText('breakdownEnterprise', b.enterprise ?? 0);
    setBar('breakdownEnterpriseBar', b.enterprise ?? 0, max);
}

function setBar(id, value, max) {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    el.style.width = pct + '%';
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const periodSelect = document.getElementById('analyticsPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', loadAnalytics);
    }
}

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.updateAnalytics = loadAnalytics;

window.exportAnalytics = function () {
    if (typeof window.showToast === 'function') {
        window.showToast('Export — not yet implemented', 'info');
    }
};
