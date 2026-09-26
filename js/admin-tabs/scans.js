// ============================================================
// admin-tabs/scans.js
// ============================================================
let supabase = null;
let user = null;
let currentPage = 1;
let lastPage = 1;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 scans tab initialized');

    attachEventListeners();
    overridePagination();
    await loadScans(1);
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing scans tab');
    await loadScans(currentPage);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadScans(page) {
    currentPage = page;
    const tbody = document.getElementById('scansTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">Loading scans...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'scans');
        params.set('page', page);
        params.set('limit', '20');

        const search = document.getElementById('scanSearch')?.value?.trim();
        const status = document.getElementById('scanStatusFilter')?.value;
        const diagnosis = document.getElementById('scanDiagnosisFilter')?.value;

        if (search) params.set('search', search);
        if (status && status !== 'all') params.set('status', status);
        if (diagnosis && diagnosis !== 'all') params.set('diagnosis', diagnosis);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const scans = data.scans || [];

        if (scans.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-text">No scans found.</td></tr>`;
            setText('scanTableInfo', 'Showing 0 scans');
            setText('scanCount', data.total || 0);
            setText('scanPageInfo', 'Page 1');
            return;
        }

        tbody.innerHTML = scans.map(s => {
            const scoreDisplay = s.score !== null && s.score !== undefined ? s.score + '%' : '—';
            const diag = s.diagnosis_status || 'pending';
            const diagClass = {
                complete: 'success',
                running: 'info',
                pending: 'warning',
                failed: 'error',
            }[diag] || 'info';
            const statusClass = {
                complete: 'success',
                scanning: 'info',
                pending: 'warning',
                failed: 'error',
            }[s.status] || 'info';

            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(s.business_name)}</strong><br>
                        <span style="font-size:11px;color:var(--gray-500);">${escapeHtml(s.website || '')}</span>
                    </td>
                    <td>
                        <span style="font-size:13px;">${escapeHtml(s.user_email)}</span>
                    </td>
                    <td>${s.queries}</td>
                    <td><strong>${scoreDisplay}</strong></td>
                    <td><span class="badge ${diagClass}">${diag}</span></td>
                    <td><span class="badge ${statusClass}">${s.status}</span></td>
                    <td style="font-size:12px;color:var(--gray-500);">${relTime(s.created_at)}</td>
                </tr>
            `;
        }).join('');

        lastPage = data.totalPages || 1;
        setText('scanTableInfo', `Showing ${scans.length} of ${data.total} scans`);
        setText('scanCount', data.total);
        setText('scanPageInfo', `Page ${data.page} of ${data.totalPages}`);
    } catch (err) {
        console.error('loadScans failed:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text" style="color:var(--red);">Failed to load scans.</td></tr>`;
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
    const search = document.getElementById('scanSearch');
    if (search) {
        let timer;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadScans(1), 300);
        });
    }

    ['scanStatusFilter', 'scanDiagnosisFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadScans(1));
    });
}

// ============================================================
// PAGINATION
// ============================================================
function overridePagination() {
    window.prevPage = function () {
        if (currentPage > 1) loadScans(currentPage - 1);
    };
    window.nextPage = function () {
        if (currentPage < lastPage) loadScans(currentPage + 1);
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
window.filterScans = function () { loadScans(1); };
