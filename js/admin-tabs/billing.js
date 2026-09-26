// ============================================================
// admin-tabs/billing.js
// ============================================================
let supabase = null;
let user = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 billing tab initialized');

    attachEventListeners();
    await loadInvoices();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing billing tab');
    await loadInvoices();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadInvoices() {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">Loading invoices...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'billing');

        const search = document.getElementById('invoiceSearch')?.value?.trim();
        const status = document.getElementById('invoiceStatusFilter')?.value;
        const dateFrom = document.getElementById('invoiceDateFrom')?.value;
        const dateTo = document.getElementById('invoiceDateTo')?.value;

        if (search) params.set('search', search);
        if (status && status !== 'all') params.set('status', status);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        renderStats(data.stats || {});
        renderTable(data.invoices || [], data.total || 0);

    } catch (err) {
        console.error('loadInvoices failed:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text" style="color:var(--red);">Failed to load invoices.</td></tr>`;
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
// RENDER STATS
// ============================================================
function renderStats(s) {
    setText('totalRevenue', '$' + (s.totalRevenue || 0).toLocaleString());
    setText('monthlyRevenue', '$' + (s.monthlyRevenue || 0).toLocaleString());
    setText('totalInvoices', s.totalInvoices ?? 0);
    setText('totalRefunds', '$' + (s.totalRefunds || 0).toLocaleString());
}

// ============================================================
// RENDER TABLE
// ============================================================
function renderTable(invoices, total) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    if (invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text">No invoices found.</td></tr>`;
        setText('invoiceTableInfo', 'Showing 0 invoices');
        return;
    }

    tbody.innerHTML = invoices.map(inv => {
        const statusClass = {
            paid: 'success',
            open: 'info',
            draft: 'warning',
            void: 'muted',
            uncollectible: 'error',
        }[inv.status] || 'info';

        const amount = '$' + ((inv.amount_paid || inv.amount_due || 0) / 100).toFixed(2);

        const date = inv.created_at
            ? new Date(inv.created_at).toLocaleDateString()
            : '—';

        const dueDate = inv.due_date
            ? new Date(inv.due_date).toLocaleDateString()
            : '—';

        const pdf = inv.pdf_url
            ? `<a href="${escapeHtml(inv.pdf_url)}" target="_blank" class="action-btn-icon" title="Download PDF">📄</a>`
            : '—';

        return `
            <tr>
                <td><strong>#${escapeHtml(inv.invoice_number)}</strong></td>
                <td>
                    <strong>${escapeHtml(inv.user_name)}</strong><br>
                    <span style="font-size:11px;color:var(--gray-500);">${escapeHtml(inv.org_name)}</span>
                </td>
                <td>${amount}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(inv.status)}</span></td>
                <td style="font-size:12px;">${date}</td>
                <td style="font-size:12px;">${dueDate}</td>
                <td>${pdf}</td>
            </tr>
        `;
    }).join('');

    setText('invoiceTableInfo', `Showing ${invoices.length} of ${total} invoices`);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const search = document.getElementById('invoiceSearch');
    if (search) {
        let timer;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadInvoices, 300);
        });
    }

    const statusFilter = document.getElementById('invoiceStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', loadInvoices);
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

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.filterInvoices = loadInvoices;

window.applyDateFilter = function () {
    loadInvoices();
};

window.generateInvoice = function () {
    if (typeof window.showToast === 'function') {
        window.showToast('Invoice generation — not yet implemented', 'info');
    }
};

window.downloadInvoice = function (id) {
    if (id) {
        window.open(`/api/admin/administrator?resource=invoices&id=${id}&format=pdf`, '_blank');
    }
};
