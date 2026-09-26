// ============================================================
// tabs/overview.js - Overview Tab
// ============================================================
// Handles dashboard stats, most-used features, and recent activity.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Overview tab initialized');

    await loadDashboardStats();
    await loadRecentActivity();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Overview tab');
    await loadDashboardStats();
    await loadRecentActivity();
}

// ============================================================
// LOAD DASHBOARD STATS
// ============================================================

async function loadDashboardStats() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) return;

        const response = await fetch('/api/usage', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.warn('Failed to fetch usage stats');
            return;
        }

        const stats = await response.json();

        // Update the four stat cards
        const statValues = document.querySelectorAll('.stat-value');
        if (statValues.length >= 4) {
            statValues[0].textContent = stats.total_generations || 0;
            statValues[1].textContent = stats.features_used_count || 0;
            statValues[2].textContent = stats.adoption_rate ? stats.adoption_rate + '%' : '0%';
            statValues[3].textContent = stats.total_generations || 0;
        }

        // Update most-used features
        if (stats.most_used_features) {
            updateMostUsedFeatures(stats.most_used_features);
        }

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// ============================================================
// UPDATE MOST USED FEATURES
// ============================================================

function updateMostUsedFeatures(features) {
    const featureList = document.querySelector('.feature-usage-list');
    if (!featureList) return;

    if (!features || features.length === 0) {
        featureList.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No features used yet. Start generating content!
            </div>
        `;
        return;
    }

    const colors = ['#14B8A6', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444'];

    featureList.innerHTML = features.slice(0, 5).map((item, index) => {
        const percentage = Math.min((item.count / features[0].count) * 100, 100);
        const color = colors[index % colors.length];
        const displayName = item.feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        return `
            <div class="feature-usage-item">
                <div class="feature-usage-info">
                    <span class="feature-usage-name">${displayName}</span>
                    <span class="feature-usage-count">${item.count} uses</span>
                </div>
                <div class="feature-usage-bar">
                    <div class="feature-usage-fill" style="width: ${percentage}%; background: ${color};"></div>
                </div>
            </div>
        `;
    }).join('');

    // Also update the hint text below the list
    const hint = document.querySelector('.feature-usage-hint');
    if (hint) {
        const totalFeatures = document.querySelector('.stat-value')?.textContent || '0';
        const usedFeatures = document.querySelector('.stat-value:nth-child(2)')?.textContent || '0';
        hint.innerHTML = `You've used <strong>${usedFeatures} of ${totalFeatures}</strong> features this month.`;
    }
}

// ============================================================
// LOAD RECENT ACTIVITY
// ============================================================

async function loadRecentActivity() {
    // This is a placeholder – you can fetch real activity data from your API
    // Currently the HTML table has a static "Loading activity..." message.
    // We can update it with real data if you have an endpoint.
    // For now, we'll just hide the loading message and show nothing.

    const tbody = document.querySelector('.activity-container .activity-table tbody');
    if (!tbody) return;

    // Optionally fetch activity from an API:
    // const response = await fetch('/api/activity');
    // const activities = await response.json();
    // and render rows.

    // For now, let's just remove the loading message if no data
    const loadingRow = tbody.querySelector('tr td[colspan="4"]');
    if (loadingRow) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:40px;color:var(--gray-500);">
                    No recent activity to show.
                </td>
            </tr>
        `;
    }
}

// ============================================================
// EXPOSE ANY FUNCTIONS TO WINDOW (if needed)
// ============================================================

// No window functions needed for this tab.