// ============================================================
// tabs/review.js - Review Tab
// ============================================================
// Setups that need attention before being surfaced as signals,
// plus configurable review thresholds stored in localStorage.

let supabase = null;
let user = null;

// ============================================================
// THRESHOLD DEFAULTS
// ============================================================

const THRESHOLD_DEFAULTS = {
    minObs: 100,
    ratioFloor: 1.5,
    similarity: 0.75,
    holdWindow: 48, // hours
};

const LS_KEY = 'fromple.reviewThresholds';

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔵 Review tab initialized');

    hydrateThresholds();
    attachThresholdControls();

    await loadReviewSetups();
}

export async function refresh(supabaseClient, profileUser) {
    supabase = supabaseClient;
    user = profileUser;

    console.log('🔄 Refreshing Review tab');

    hydrateThresholds();
    await loadReviewSetups();
}

// ============================================================
// THRESHOLDS
// ============================================================

function getThresholds() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { ...THRESHOLD_DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...THRESHOLD_DEFAULTS, ...parsed };
    } catch {
        return { ...THRESHOLD_DEFAULTS };
    }
}

function saveThresholds(t) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(t));
    } catch (err) {
        console.warn('Could not save thresholds:', err.message);
    }
}

function hydrateThresholds() {
    const t = getThresholds();

    const minObs     = document.getElementById('reviewMinObs');
    const ratioFloor = document.getElementById('reviewRatioFloor');
    const similarity = document.getElementById('reviewSimilarity');
    const holdWindow = document.getElementById('reviewHoldWindow');

    if (minObs)     minObs.value     = t.minObs;
    if (ratioFloor) ratioFloor.value = t.ratioFloor;
    if (similarity) similarity.value = t.similarity;
    if (holdWindow) holdWindow.value = String(t.holdWindow);
}

function readThresholdsFromUI() {
    return {
        minObs:     Number(document.getElementById('reviewMinObs')?.value)     || THRESHOLD_DEFAULTS.minObs,
        ratioFloor: Number(document.getElementById('reviewRatioFloor')?.value) || THRESHOLD_DEFAULTS.ratioFloor,
        similarity: Number(document.getElementById('reviewSimilarity')?.value) || THRESHOLD_DEFAULTS.similarity,
        holdWindow: Number(document.getElementById('reviewHoldWindow')?.value) || THRESHOLD_DEFAULTS.holdWindow,
    };
}

function attachThresholdControls() {
    const btn = document.getElementById('saveReviewThresholds');
    if (!btn || btn.dataset.bound) return;

    btn.addEventListener('click', async () => {
        const t = readThresholdsFromUI();
        saveThresholds(t);
        showToast('Review thresholds saved.', 'success');
        await loadReviewSetups();
    });

    btn.dataset.bound = 'true';
}

// ============================================================
// REVIEW SETUPS
// ============================================================

async function loadReviewSetups() {
    const tbody = document.querySelector('#tab-review .table-wrap tbody');
    if (!tbody) return;

    const thresholds = getThresholds();
    let rows = [];

    try {
        // Fetch candidate signals that may need review
        const { data, error } = await supabase
            .from('signals')
            .select(`
                id,
                signal_code,
                recurrences,
                wins,
                losses,
                avg_favorable,
                avg_adverse,
                status,
                last_fired,
                classes:class_id ( class_code )
            `)
            .order('last_fired', { ascending: false })
            .limit(50);

        if (error) throw error;
        rows = data || [];
    } catch (err) {
        console.warn('Could not load review setups:', err.message);
    }

    // Filter in-memory using thresholds
    const needsReview = rows.filter(r => {
        if (r.status === 'filtered') return true;
        if ((r.recurrences || 0) < thresholds.minObs) return true;
        const ratio = computeRatio(r);
        if (ratio != null && ratio < thresholds.ratioFloor) return true;
        return false;
    }).slice(0, 20);

    // Update the badge
    const badge = document.querySelector('#tab-review .badge.warning');
    if (badge) {
        badge.textContent = `${needsReview.length} pending`;
    }

    if (needsReview.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:40px;color:var(--gray-500);">
                    Nothing to review — all setups are within thresholds.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = needsReview.map(r => {
        const classCode = r.classes?.class_code || '—';
        const signalCode = r.signal_code || '—';
        const reason = describeReason(r, thresholds);
        const reasonBadge = reason.badge;

        return `
            <tr>
                <td>
                    <div class="class-cell">
                        <div class="class-badge">${escapeHtml(classCode)}</div>
                        <div class="class-cell-info">
                            <strong>Class ${escapeHtml(classCode)} · ${escapeHtml(signalCode)}</strong>
                            <span>${escapeHtml(describeClassLine(r))}</span>
                        </div>
                    </div>
                </td>
                <td><span class="status-badge ${reasonBadge.cls}">${escapeHtml(reasonBadge.label)}</span></td>
                <td>${formatNumber(r.recurrences || 0)}</td>
                <td class="activity-time">${timeAgo(r.last_fired)}</td>
            </tr>
        `;
    }).join('');
}

function describeReason(r, thresholds) {
    const recurrences = r.recurrences || 0;
    const ratio = computeRatio(r);

    if (r.status === 'filtered' || (ratio != null && ratio < thresholds.ratioFloor)) {
        return {
            badge: { cls: 'pending', label: 'Low ratio' },
        };
    }
    if (recurrences < thresholds.minObs) {
        return {
            badge: { cls: 'pending', label: 'Insufficient history' },
        };
    }
    if (recurrences < 100) {
        return {
            badge: { cls: 'in-progress', label: 'New setup' },
        };
    }
    return {
        badge: { cls: 'pending', label: 'Needs review' },
    };
}

function describeClassLine(r) {
    const wins = r.wins || 0;
    const losses = r.losses || 0;
    if (wins + losses === 0) return 'No closed outcomes yet';
    const ratio = computeRatio(r);
    if (ratio != null) return `${formatNumber(wins)}W / ${formatNumber(losses)}L · ratio ${ratio.toFixed(2)}×`;
    return `${formatNumber(wins)}W / ${formatNumber(losses)}L`;
}

function computeRatio(r) {
    const fav = Number(r.avg_favorable);
    const adv = Number(r.avg_adverse);
    if (!isFinite(fav) || !isFinite(adv) || adv === 0) return null;
    return fav / Math.abs(adv);
}

// ============================================================
// HELPERS
// ============================================================

function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString();
}

function timeAgo(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
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

function showToast(msg, type) {
    if (window.showToast) window.showToast(msg, type);
    else console.log(`[${type}] ${msg}`);
}
