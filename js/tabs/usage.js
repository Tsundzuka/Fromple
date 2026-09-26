// ============================================================
// tabs/usage.js - Usage & Analytics Tab
// ============================================================
// Handles the Usage & Analytics tab: feature adoption stats, usage timeline, export.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Usage & Analytics tab initialized');

    await loadUsageStats();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Usage & Analytics tab');
    await loadUsageStats();
}

// ============================================================
// LOAD USAGE STATS
// ============================================================

async function loadUsageStats() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
            showEmptyUsageState();
            return;
        }

        const response = await fetch('/api/usage', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.warn('Failed to fetch usage stats, using fallback');
            showEmptyUsageState();
            return;
        }

        const stats = await response.json();

        // Update stats cards
        const statValues = document.querySelectorAll('#tab-usage .stat-value');
        if (statValues.length >= 4) {
            statValues[0].textContent = stats.total_features || 28;
            statValues[1].textContent = stats.features_used_count || 0;
            statValues[2].textContent = stats.adoption_rate ? stats.adoption_rate + '%' : '0%';
            statValues[3].textContent = stats.total_generations || 0;
        }

        // Update most used features
        if (stats.most_used_features) {
            updateMostUsedFeatures(stats.most_used_features);
        }

        // Update least used features
        if (stats.least_used_features) {
            updateLeastUsedFeatures(stats.least_used_features);
        }

        // Update adoption by module
        if (stats.module_adoption) {
            updateModuleAdoption(stats.module_adoption);
        }

        // Update usage timeline
        if (stats.usage_timeline) {
            updateUsageTimeline(stats.usage_timeline);
        }

        // Update unused features
        if (stats.unused_features) {
            updateUnusedFeatures(stats.unused_features);
        }

        console.log('✅ Usage stats loaded');

    } catch (error) {
        console.error('Error loading usage stats:', error);
        showEmptyUsageState();
    }
}

// ============================================================
// UPDATE MOST USED FEATURES
// ============================================================

function updateMostUsedFeatures(features) {
    const container = document.querySelector('#tab-usage .feature-usage-list');
    if (!container) return;

    if (!features || features.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No features used yet.
            </div>
        `;
        return;
    }

    const colors = ['#14B8A6', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444'];

    container.innerHTML = features.slice(0, 5).map((item, index) => {
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
}

// ============================================================
// UPDATE LEAST USED FEATURES
// ============================================================

function updateLeastUsedFeatures(features) {
    const container = document.querySelector('#tab-usage .least-used-features .feature-usage-list');
    if (!container) {
        // If the container doesn't exist, skip
        return;
    }

    if (!features || features.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                All features have been used! 🎉
            </div>
        `;
        return;
    }

    container.innerHTML = features.slice(0, 5).map((item, index) => {
        const displayName = item.feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        return `
            <div class="feature-usage-item">
                <div class="feature-usage-info">
                    <span class="feature-usage-name">${displayName}</span>
                    <span class="feature-usage-count">${item.count} uses</span>
                </div>
                <div class="feature-usage-bar">
                    <div class="feature-usage-fill" style="width: ${Math.min((item.count / 1) * 100, 100)}%; background: var(--gray-300);"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// UPDATE MODULE ADOPTION
// ============================================================

function updateModuleAdoption(modules) {
    const container = document.querySelector('.adoption-list-full');
    if (!container) return;

    if (!modules || modules.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No module data available.
            </div>
        `;
        return;
    }

    container.innerHTML = modules.map(module => {
        const percentage = module.total > 0 ? Math.round((module.used / module.total) * 100) : 0;
        const barColor = percentage >= 75 ? 'var(--green)' : percentage >= 50 ? 'var(--warning)' : 'var(--red)';

        return `
            <div class="adoption-item-full">
                <div class="adoption-info-full">
                    <span class="adoption-module">${module.name}</span>
                    <span class="adoption-count">${module.used}/${module.total}</span>
                    <span class="adoption-percent">${percentage}%</span>
                </div>
                <div class="adoption-bar">
                    <div class="adoption-fill" style="width: ${percentage}%; background: ${barColor};"></div>
                </div>
                <div class="adoption-features">
                    ${module.features ? module.features.map(f => `<span style="font-size:12px;color:var(--gray-500);">${f}</span>`).join(', ') : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// UPDATE USAGE TIMELINE
// ============================================================

function updateUsageTimeline(timeline) {
    const container = document.querySelector('.usage-timeline');
    if (!container) return;

    if (!timeline || timeline.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No usage data available.
            </div>
        `;
        return;
    }

    // Find the max value for scaling
    const maxValue = Math.max(...timeline.map(week => week.total || 0), 1);

    container.innerHTML = timeline.map((week, weekIndex) => {
        const bars = week.days || [];
        const barHeight = (week.total / maxValue) * 60 + 5;

        return `
            <div class="usage-week">
                <span class="usage-week-label">Week ${weekIndex + 1}</span>
                <div class="usage-week-bars">
                    ${bars.map(day => `
                        <div class="usage-day-bar" style="height: ${Math.max((day / maxValue) * 60, 2)}px; background: ${day > 0 ? 'var(--primary)' : 'var(--gray-300)'};"></div>
                    `).join('')}
                </div>
                <span class="usage-week-total">${week.total} uses</span>
            </div>
        `;
    }).join('');
}

// ============================================================
// UPDATE UNUSED FEATURES
// ============================================================

function updateUnusedFeatures(features) {
    const container = document.querySelector('.unused-features');
    if (!container) return;

    if (!features || features.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--green);">
                🎉 You've tried all features!
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;">
            ${features.map(f => `
                <span style="background:var(--gray-100);padding:4px 12px;border-radius:12px;font-size:13px;color:var(--gray-600);">
                    ${f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
            `).join('')}
        </div>
        <p style="font-size:13px;color:var(--gray-500);margin-top:8px;">
            ${features.length} features you haven't tried yet. Start generating content to discover them!
        </p>
    `;
}

// ============================================================
// EXPORT USAGE DATA
// ============================================================

function exportUsageData() {
    showToast('Exporting usage data...', 'info');

    // Collect data from the UI
    const stats = {
        total_features: document.querySelector('#tab-usage .stat-value')?.textContent || '0',
        features_used: document.querySelectorAll('#tab-usage .stat-value')[1]?.textContent || '0',
        adoption_rate: document.querySelectorAll('#tab-usage .stat-value')[2]?.textContent || '0%',
        total_generations: document.querySelectorAll('#tab-usage .stat-value')[3]?.textContent || '0',
        exported_at: new Date().toISOString()
    };

    // Create CSV
    let csv = 'Metric,Value\n';
    csv += `Total Features,${stats.total_features}\n`;
    csv += `Features Used,${stats.features_used}\n`;
    csv += `Adoption Rate,${stats.adoption_rate}\n`;
    csv += `Total Generations,${stats.total_generations}\n`;
    csv += `Exported At,${stats.exported_at}\n`;

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `usage_data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Usage data exported successfully! 📊', 'success');
}

// ============================================================
// SHOW EMPTY STATE
// ============================================================

function showEmptyUsageState() {
    const statValues = document.querySelectorAll('#tab-usage .stat-value');
    if (statValues.length >= 4) {
        statValues[0].textContent = '28';
        statValues[1].textContent = '0';
        statValues[2].textContent = '0%';
        statValues[3].textContent = '0';
    }

    // Most used features
    const container = document.querySelector('#tab-usage .feature-usage-list');
    if (container) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No features used yet.
            </div>
        `;
    }

    // Usage timeline
    const timelineContainer = document.querySelector('.usage-timeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                No usage data available yet. Start generating content!
            </div>
        `;
    }

    // Unused features
    const unusedContainer = document.querySelector('.unused-features');
    if (unusedContainer) {
        unusedContainer.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                Start generating content to see unused features.
            </div>
        `;
    }
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW
// ============================================================

window.exportUsageData = exportUsageData;

// For backwards compatibility, also expose if called from inline onclick
window.exportUsageData = exportUsageData;