// ============================================================
// admin-tabs/subscriptions.js
// ============================================================
let supabase = null;
let user = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 subscriptions tab initialized');

    attachEventListeners();
    await loadSubscriptions();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing subscriptions tab');
    await loadSubscriptions();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadSubscriptions() {
    const tbody = document.getElementById('subscriptionsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">Loading subscriptions...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'subscriptions');

        const search = document.getElementById('subSearch')?.value?.trim();
        const plan = document.getElementById('subPlanFilter')?.value;
        const status = document.getElementById('subStatusFilter')?.value;

        if (search) params.set('search', search);
        if (plan && plan !== 'all') params.set('plan', plan);
        if (status && status !== 'all') params.set('status', status);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        renderStats(data.stats || {});
        renderMRR(data.mrr || 0);
        renderTable(data.subscriptions || [], data.total || 0);

    } catch (err) {
        console.error('loadSubscriptions failed:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text" style="color:var(--red);">Failed to load subscriptions.</td></tr>`;
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
function renderStats(stats) {
    setText('subActive', stats.active ?? 0);
    setText('subTrial', stats.trial ?? 0);
    setText('subCancelled', stats.cancelled ?? 0);
    setText('subExpired', stats.expired ?? 0);
}

function renderMRR(mrr) {
    setText('totalMRR', '$' + (mrr || 0).toLocaleString());
}

function renderTable(subscriptions, total) {
    const tbody = document.getElementById('subscriptionsTableBody');
    if (!tbody) return;

    if (subscriptions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-text">No subscriptions found.</td></tr>`;
        setText('subTableInfo', 'Showing 0 subscriptions');
        return;
    }

    tbody.innerHTML = subscriptions.map(s => {
        const statusClass = {
            active: 'success',
            trialing: 'info',
            canceled: 'warning',
            past_due: 'error',
            incomplete: 'warning',
        }[s.status] || 'info';

        const planClass = {
            starter: 'warning',
            pro_agency: 'info',
            growth: 'success',
            enterprise: 'success',
        }[s.plan] || 'info';

        const price = s.price_monthly_usd > 0
            ? '$' + (s.price_monthly_usd / 100).toFixed(2)
            : 'Free';

        const started = s.current_period_start
            ? new Date(s.current_period_start).toLocaleDateString()
            : new Date(s.created_at).toLocaleDateString();

        const renews = s.current_period_end
            ? new Date(s.current_period_end).toLocaleDateString()
            : '—';

        const renewsSuffix = s.cancel_at_period_end ? ' <span style="font-size:10px;color:var(--red);">(cancels)</span>' : '';

        const isActive = s.status === 'active' || s.status === 'trialing';

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(s.user_name)}</strong><br>
                    <span style="font-size:11px;color:var(--gray-500);">${escapeHtml(s.org_name)}</span>
                </td>
                <td><span class="badge ${planClass}">${escapeHtml(s.plan_name)}</span></td>
                <td><span class="badge ${statusClass}">${escapeHtml(s.status)}</span></td>
                <td>${price}</td>
                <td style="font-size:12px;">${started}</td>
                <td style="font-size:12px;">${renews}${renewsSuffix}</td>
                <td>
                    <button class="action-btn-icon" onclick="editSubscription('${s.id}')" title="Edit">✏️</button>
                    ${isActive ? `<button class="action-btn-icon" onclick="cancelSubscription('${s.id}')" title="Cancel">⛔</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    setText('subTableInfo', `Showing ${subscriptions.length} of ${total} subscriptions`);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    const search = document.getElementById('subSearch');
    if (search) {
        let timer;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadSubscriptions, 300);
        });
    }

    ['subPlanFilter', 'subStatusFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', loadSubscriptions);
    });
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
window.filterSubscriptions = loadSubscriptions;

window.editSubscription = function (id) {
    if (typeof window.showToast === 'function') {
        window.showToast('Edit subscription — not yet implemented', 'info');
    }
};

window.cancelSubscription = async function (id) {
    if (!confirm('Cancel this subscription? The user will retain access until the end of the current period.')) return;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch('/api/admin/administrator?resource=subscriptions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({ action: 'cancel', id }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (typeof window.showToast === 'function') {
            window.showToast('Subscription cancelled', 'warning');
        }
        await loadSubscriptions();
    } catch (err) {
        console.error('cancelSubscription failed:', err);
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to cancel subscription', 'error');
        }
    }
};
