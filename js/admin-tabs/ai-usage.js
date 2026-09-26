// ============================================================
// admin-tabs/ai-usage.js
// ============================================================
let supabase = null;
let user = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 ai-usage tab initialized');

    await loadAiUsage();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing ai-usage tab');
    await loadAiUsage();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadAiUsage() {
    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch('/api/admin/administrator?resource=ai-usage', {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        renderTotals(data.totals || {});
        renderProviderUsage(data.providerUsage || {});
        renderQueue(data.queue || {});
        renderUsageByOrg(data.usageByOrg || []);

    } catch (err) {
        console.error('loadAiUsage failed:', err);
        const tbody = document.getElementById('aiUsageTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-text" style="color:var(--red);">Failed to load AI usage.</td></tr>`;
        }
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
// RENDER TOTALS
// ============================================================
function renderTotals(t) {
    setText('aiTotalTokens', formatNum(t.totalTokens || 0));
    setText('aiGroqTokens', formatNum(t.groqTokens || 0));
    setText('aiTavilyCalls', formatNum(t.tavilyCalls || 0));
    setText('aiYouCalls', formatNum(t.youCalls || 0));
    setText('aiCostThisMonth', '$' + (t.costThisMonth || 0).toFixed(2));
}

// ============================================================
// RENDER PROVIDER USAGE BARS
// ============================================================
function renderProviderUsage(p) {
    const tavily = p.tavily ?? 0;
    const you = p.you ?? 0;
    const groq = p.groq ?? 0;

    const tavilyBar = document.getElementById('tavilyBarFill');
    const tavilyVal = document.getElementById('tavilyBarValue');
    if (tavilyBar) tavilyBar.style.width = tavily + '%';
    if (tavilyVal) tavilyVal.textContent = tavily + '%';

    const youBar = document.getElementById('youBarFill');
    const youVal = document.getElementById('youBarValue');
    if (youBar) youBar.style.width = you + '%';
    if (youVal) youVal.textContent = you + '%';

    const groqBar = document.getElementById('groqBarFill');
    const groqVal = document.getElementById('groqBarValue');
    if (groqBar) groqBar.style.width = groq + '%';
    if (groqVal) groqVal.textContent = groq + '%';
}

// ============================================================
// RENDER QUEUE
// ============================================================
function renderQueue(q) {
    setText('queueWaiting', q.waiting ?? 0);
    setText('queueProcessing', q.processing ?? 0);
    setText('queueCompletedToday', q.completedToday ?? 0);
    setText('queueAvgWait', (q.avgWait ?? 0) + 's');
}

// ============================================================
// RENDER USAGE BY ORG
// ============================================================
function renderUsageByOrg(rows) {
    const tbody = document.getElementById('aiUsageTableBody');
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-text">No usage recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>
                <strong>${escapeHtml(r.org_name)}</strong>
                ${r.org_slug ? `<br><span style="font-size:11px;color:var(--gray-500);">${escapeHtml(r.org_slug)}</span>` : ''}
            </td>
            <td>${r.scans}</td>
            <td>${r.queries}</td>
            <td>${r.tavily_calls}</td>
            <td>${r.you_calls}</td>
            <td>$${(r.estimated_cost || 0).toFixed(4)}</td>
        </tr>
    `).join('');
}

// ============================================================
// HELPERS
// ============================================================
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
