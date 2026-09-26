// ============================================================
// admin-tabs/users.js
// ============================================================
let supabase = null;
let user = null;
let currentPage = 1;
let lastPage = 1;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 users tab initialized');

    attachEventListeners();
    overridePagination();
    await loadUsers(1);
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing users tab');
    await loadUsers(currentPage);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadUsers(page) {
    currentPage = page;
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">Loading users...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'users');
        params.set('page', page);
        params.set('limit', '20');

        const search = document.getElementById('userSearch')?.value?.trim();
        const role = document.getElementById('userRoleFilter')?.value;
        const plan = document.getElementById('userPlanFilter')?.value;

        if (search) params.set('search', search);
        if (role && role !== 'all') params.set('role', role);
        if (plan && plan !== 'all') params.set('plan', plan);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const users = data.users || [];

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-text">No users found.</td></tr>`;
            setText('userTableInfo', 'Showing 0 users');
            setText('userCount', data.total || 0);
            setText('pageInfo', 'Page 1');
            return;
        }

        tbody.innerHTML = users.map(u => {
            const isAdmin = u.source === 'admin';
            const planLabel = isAdmin ? 'Platform Admin' : u.plan;
            const planBadgeClass = isAdmin ? 'error' : planClass(u.plan);
            const roleLabel = isAdmin
                ? (u.role || 'admin').replace(/_/g, ' ')
                : u.role;
            const rowStyle = isAdmin ? 'style="background:rgba(239,68,68,0.04);"' : '';

            return `
                <tr ${rowStyle}>
                    <td>
                        <strong>${escapeHtml(u.full_name || '—')}</strong>
                        ${isAdmin ? ' <span style="font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:8px;font-weight:600;">ADMIN</span>' : ''}
                    </td>
                    <td>${escapeHtml(u.email)}</td>
                    <td><span class="badge ${planBadgeClass}">${escapeHtml(planLabel)}</span></td>
                    <td>${escapeHtml(roleLabel)}</td>
                    <td>${u.scan_count}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                        <button class="action-btn-icon" onclick="editUser('${u.id}')">✏️</button>
                        <button class="action-btn-icon" onclick="deleteUser('${u.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        lastPage = data.totalPages || 1;
        setText('userTableInfo', `Showing ${users.length} of ${data.total} users`);
        setText('userCount', data.total);
        setText('pageInfo', `Page ${data.page} of ${data.totalPages}`);
    } catch (err) {
        console.error('loadUsers failed:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text" style="color:var(--red);">Failed to load users.</td></tr>`;
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
    const search = document.getElementById('userSearch');
    if (search) {
        let timer;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadUsers(1), 300);
        });
    }

    ['userRoleFilter', 'userPlanFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadUsers(1));
    });
}

// ============================================================
// PAGINATION
// ============================================================
function overridePagination() {
    window.prevPage = function () {
        if (currentPage > 1) loadUsers(currentPage - 1);
    };
    window.nextPage = function () {
        if (currentPage < lastPage) loadUsers(currentPage + 1);
    };
}

// ============================================================
// HELPERS
// ============================================================
function planClass(plan) {
    return {
        starter: 'warning',
        pro_agency: 'info',
        growth: 'success',
        enterprise: 'success',
        platform_admin: 'error',
    }[plan] || 'info';
}

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
window.filterUsers = function () { loadUsers(1); };
window.exportUsers = function () {
    if (typeof window.showToast === 'function') {
        window.showToast('Export — not yet implemented', 'info');
    }
};
window.editUser = function (id) {
    if (typeof window.showToast === 'function') {
        window.showToast('Edit user — not yet implemented', 'info');
    }
};
window.deleteUser = function (id) {
    if (!confirm('Delete this user? Not yet implemented.')) return;
};
