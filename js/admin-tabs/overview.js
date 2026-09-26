// ============================================================
// admin-tabs/overview.js
// ============================================================
let supabase = null;
let user = null;
let activityCache = [];
let activeFilter = 'all';

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 overview tab initialized');

    attachEventListeners();
    await loadOverview();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing overview tab');
    await loadOverview();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadOverview() {
    try {
        const token = await getToken();
        if (!token) return;

        const topUsersRange = document.getElementById('topUsersRange')?.value || '30';
        const userGrowthRange = document.getElementById('userGrowthRange')?.value || '90';
        const scanVolumeRange = document.getElementById('scanVolumeRange')?.value || '90';

        const params = new URLSearchParams();
        params.set('resource', 'dashboard');
        params.set('topUsersRange', topUsersRange);
        params.set('userGrowthRange', userGrowthRange);
        params.set('scanVolumeRange', scanVolumeRange);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) {
            console.error('Dashboard fetch failed:', res.status);
            return;
        }

        const data = await res.json();

        renderStats(data.stats || {});
        renderUsage(data.usage || {});
        renderActivity(data.activity || []);
        renderTopUsers(data.topUsers || []);
        renderRecentScans(data.recentScans || []);
        drawChart('userGrowthCanvas', data.userGrowth || []);
        drawChart('scanVolumeCanvas', data.scanVolume || []);

        const lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleTimeString();

        // Sidebar badges
        setText('userCount', data.stats?.totalUsers ?? 0);
        setText('scanCount', data.usage?.totalScans ?? 0);

    } catch (err) {
        console.error('loadOverview failed:', err);
    }
}

async function getToken() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch (err) {
        console.error('getToken failed:', err);
        return null;
    }
}

// ============================================================
// RENDER STATS
// ============================================================
function renderStats(s) {
    setText('totalUsers', s.totalUsers ?? 0);
    setText('totalOrgs', s.totalOrgs ?? 0);
    setText('activeSubs', s.activeSubs ?? 0);
    setText('mrr', '$' + (s.mrr ?? 0).toLocaleString());
    setDelta('userGrowth', s.userGrowthPct ?? 0);
    setDelta('orgGrowth', s.orgGrowthPct ?? 0);
    setText('subBreakdown', `${s.paidSubs ?? 0} paid · ${s.freeSubs ?? 0} free`);
}

function setDelta(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    const sign = pct > 0 ? '+' : '';
    el.textContent = `${sign}${pct}% this month`;
    el.className = 'stat-change ' + (pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral');
}

function renderUsage(u) {
    setText('totalScans', u.totalScans ?? 0);
    setText('scansThisMonth', u.scansThisMonth ?? 0);
    setText('activeSchedules', u.activeSchedules ?? 0);
    setText('unreadAlerts', u.unreadAlerts ?? 0);
    setText('failedDiagnoses', u.failedDiagnoses ?? 0);
}

// ============================================================
// RENDER ACTIVITY
// ============================================================
function renderActivity(activity) {
    activityCache = activity;
    const container = document.getElementById('recentActivity');
    if (!container) return;

    const filtered = activeFilter === 'all'
        ? activity
        : activity.filter(a => a.type === activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="activity-item" style="opacity:0.6;">No activity to show.</div>`;
        return;
    }

    container.innerHTML = filtered.slice(0, 12).map(a => `
        <div class="activity-item">
            <span class="activity-icon">${a.icon || '•'}</span>
            <span>${escapeHtml(a.title)}</span>
            <span class="activity-time">${relTime(a.created_at)}</span>
        </div>
    `).join('');
}

// ============================================================
// RENDER TOP USERS
// ============================================================
function renderTopUsers(users) {
    const tbody = document.getElementById('topUsersBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading-text">No user activity in this period.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${escapeHtml(u.full_name)}</strong><br><span style="font-size:12px;color:var(--gray-500);">${escapeHtml(u.email)}</span></td>
            <td>${u.scans}</td>
            <td>${u.queries}</td>
            <td style="font-size:12px;color:var(--gray-500);">${relTime(u.last_active)}</td>
        </tr>
    `).join('');
}

// ============================================================
// RENDER RECENT SCANS
// ============================================================
function renderRecentScans(scans) {
    const tbody = document.getElementById('recentScansBody');
    if (!tbody) return;

    if (scans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text">No scans yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = scans.map(s => {
        const scoreDisplay = s.score !== null && s.score !== undefined ? s.score + '%' : '—';
        const diag = s.diagnosis_status || 'pending';
        const diagClass = { complete: 'success', running: 'info', pending: 'warning', failed: 'error' }[diag] || 'info';
        const statusClass = { complete: 'success', scanning: 'info', pending: 'warning', failed: 'error' }[s.status] || 'info';

        return `
            <tr>
                <td><strong>${escapeHtml(s.business_name)}</strong></td>
                <td>${escapeHtml(s.user_email)}</td>
                <td>${s.queries}</td>
                <td>${scoreDisplay}</td>
                <td><span class="badge ${diagClass}">${diag}</span></td>
                <td><span class="badge ${statusClass}">${s.status}</span></td>
                <td style="font-size:12px;color:var(--gray-500);">${relTime(s.created_at)}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// LINE CHART (canvas)
// ============================================================
function drawChart(canvasId, series) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 220;

    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, width, height);

    if (!series || series.length < 2) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data', width / 2, height / 2);
        return;
    }

    const pad = { top: 16, bottom: 28, left: 36, right: 16 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const maxY = Math.max(...series.map(p => p.count), 1);
    const stepX = series.length > 1 ? cw / (series.length - 1) : 0;

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#9ca3af';
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ch / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(maxY - (maxY / 4) * i)), pad.left - 6, y + 3);
    }

    // Line
    ctx.beginPath();
    series.forEach((p, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + ch - (p.count / maxY) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill
    const lastX = pad.left + (series.length - 1) * stepX;
    ctx.lineTo(lastX, pad.top + ch);
    ctx.lineTo(pad.left, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20, 184, 166, 0.08)';
    ctx.fill();

    // Points
    series.forEach((p, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + ch - (p.count / maxY) * ch;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#14b8a6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const activityFilter = document.getElementById('activityFilter');
    if (activityFilter) {
        activityFilter.addEventListener('change', (e) => {
            activeFilter = e.target.value;
            renderActivity(activityCache);
        });
    }

    const topUsersRange = document.getElementById('topUsersRange');
    if (topUsersRange) {
        topUsersRange.addEventListener('change', loadOverview);
    }

    const userGrowthRange = document.getElementById('userGrowthRange');
    if (userGrowthRange) {
        userGrowthRange.addEventListener('change', loadOverview);
    }

    const scanVolumeRange = document.getElementById('scanVolumeRange');
    if (scanVolumeRange) {
        scanVolumeRange.addEventListener('change', loadOverview);
    }
}

// ============================================================
// HELPERS
// ============================================================
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function relTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.refreshData = async function () {
    await loadOverview();
    if (typeof window.showToast === 'function') {
        window.showToast('Dashboard refreshed', 'success');
    }
};

window.filterActivity = function () {
    const el = document.getElementById('activityFilter');
    activeFilter = el ? el.value : 'all';
    renderActivity(activityCache);
};

window.loadTopUsers = loadOverview;
window.loadUserGrowthChart = loadOverview;
window.loadScanVolumeChart = loadOverview;
