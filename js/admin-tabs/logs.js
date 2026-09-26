// ============================================================
// admin-tabs/logs.js
// ============================================================
let supabase = null;
let user = null;
let currentPage = 1;
let lastPage = 1;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 logs tab initialized');

    attachEventListeners();
    overridePagination();
    await loadLogs(1);
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing logs tab');
    await loadLogs(currentPage);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadLogs(page) {
    currentPage = page || 1;
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Loading logs...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'logs');
        params.set('page', currentPage);
        params.set('limit', '50');

        const search = document.getElementById('logSearch')?.value?.trim();
        const type = document.getElementById('logTypeFilter')?.value;
        const severity = document.getElementById('logSeverityFilter')?.value;
        const dateFrom = document.getElementById('logDateFrom')?.value;
        const dateTo = document.getElementById('logDateTo')?.value;

        if (search) params.set('search', search);
        if (type && type !== 'all') params.set('type', type);
        if (severity && severity !== 'all') params.set('severity', severity);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-text">No logs found for these filters.</td></tr>`;
            setText('logTableInfo', 'Showing 0 logs');
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const sevClass = {
                info: 'success',
                warning: 'warning',
                error: 'error',
                critical: 'error',
            }[l.severity] || 'info';

            const time = new Date(l.timestamp);
            const timeStr = time.toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });

            return `
                <tr>
                    <td style="font-size:12px;white-space:nowrap;">${escapeHtml(timeStr)}</td>
                    <td><span class="badge info">${escapeHtml(l.type || '—')}</span></td>
                    <td><span class="badge ${sevClass}">${escapeHtml(l.severity || 'info')}</span></td>
                    <td style="font-size:12px;">${escapeHtml(l.user_email || '—')}</td>
                    <td>${escapeHtml(l.message || '')}</td>
                    <td style="font-size:12px;color:var(--gray-500);">${escapeHtml(l.ip_address || '—')}</td>
                </tr>
            `;
        }).join('');

        lastPage = data.totalPages || 1;
        setText('logTableInfo', `Showing ${logs.length} of ${data.total} logs`);

    } catch (err) {
        console.error('loadLogs failed:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="loading-text" style="color:var(--red);">Failed to load logs.</td></tr>`;
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
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const search = document.getElementById('logSearch');
    if (search) {
        let timer;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadLogs(1), 300);
        });
    }

    ['logTypeFilter', 'logSeverityFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadLogs(1));
    });
}

// ============================================================
// PAGINATION
// ============================================================
function overridePagination() {
    window.prevPage = function () {
        if (currentPage > 1) loadLogs(currentPage - 1);
    };
    window.nextPage = function () {
        if (currentPage < lastPage) loadLogs(currentPage + 1);
    };
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

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.filterLogs = function () { loadLogs(1); };
window.applyLogDateFilter = function () { loadLogs(1); };

window.exportLogs = function () {
    if (typeof window.showToast === 'function') {
        window.showToast('Export — not yet implemented', 'info');
    }
};

window.clearLogs = function () {
    if (typeof window.showToast === 'function') {
        window.showToast('Clearing logs — not yet implemented', 'info');
    }
};
