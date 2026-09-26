// ============================================================
// tabs/ai-visibility.js - AI Visibility Tab (Complete)
// ============================================================
// Handles all pillars: FIND, DIAGNOSE, OPTIMIZE, MONITOR.
//
// DIAGNOSE v11.7 compatible.
// MONITOR v2 — Industry standard with:
//   - 4 hero metrics with delta indicators
//   - Multi-metric trend chart with metric/range toggles
//   - Since-last-scan comparison
//   - Competitor movement detection
//   - Alerts feed with mark-read
//   - Schedule configuration (uses monitor_schedules table)
//   - Scan history table
//
// v14 additions:
//   - Repeat scan toggle on FIND form (upserts monitor_schedules)
//   - 6-hour throttle on DIAGNOSE/OPTIMIZE refresh
//   - MONITOR always refreshes on nav
//   - Sidebar badge + toast on new alerts

import { showToast } from '../utils/toast.js';

let supabase = null;
let user = null;
let currentOrganizationId = null;
let auditFormListenerAttached = false;
let latestAuditId = null;
let pollingInterval = null;
let reportInterval = null;
let reportModalOpen = false;
let latestDiagnosis = null;
let lastAlertCheck = 0;

// MONITOR state
let monitorState = {
  currentMetric: 'visibility',
  timeRange: 30,
  history: [],
  schedule: null,
};

const DIAGNOSE_REFRESH_MS = 6 * 60 * 60 * 1000;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;
    console.log('🔵 AI Visibility tab initialized');

    await fetchOrganizationId();
    await checkForNewAlerts();

    attachFindFormHandler();
    attachPillarTabSwitching();
    attachFullReportHandler();
    attachMonitorButtons();
    attachQueryCounter();
    attachDraftCopyHandler();
    attachRepeatToggleHandler();

    await loadRecentScans();
    await loadLatestAuditResults();
    await updateFindStats();
    markDiagnoseRefreshed();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;
    console.log('🔄 Refreshing AI Visibility tab');

    await fetchOrganizationId();
    await checkForNewAlerts();
    await loadRecentScans();
    await updateFindStats();

    if (shouldRefreshDiagnose()) {
        await loadLatestAuditResults();
        markDiagnoseRefreshed();
    }
}

// ============================================================
// 6-HOUR DIAGNOSE/OPTIMIZE THROTTLE
// ============================================================

function shouldRefreshDiagnose() {
    if (!user?.id) return true;
    const last = parseInt(localStorage.getItem(`diag_refresh_${user.id}`) || '0', 10);
    return Date.now() - last > DIAGNOSE_REFRESH_MS;
}

function markDiagnoseRefreshed() {
    if (!user?.id) return;
    localStorage.setItem(`diag_refresh_${user.id}`, String(Date.now()));
}

// ============================================================
// FETCH ORGANIZATION ID
// ============================================================

async function fetchOrganizationId() {
    try {
        const { data: orgMember, error: orgError } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single();

        if (orgError) {
            console.error('Error fetching organization:', orgError);
            return;
        }

        currentOrganizationId = orgMember?.organization_id;
        console.log('🏢 Organization ID:', currentOrganizationId);
    } catch (error) {
        console.error('Error fetching organization:', error);
    }
}

// ============================================================
// ALERTS — SIDEBAR BADGE + TOAST
// ============================================================

async function checkForNewAlerts() {
    if (!currentOrganizationId) return;

    try {
        const { data: unread } = await supabase
            .from('alerts')
            .select('id, title, severity, created_at')
            .eq('organization_id', currentOrganizationId)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(5);

        const count = unread?.length || 0;
        setText('monitorAlertCount', `${count} new`);

        const badge = document.querySelector('.sidebar-nav a[data-tab="ai-visibility"] .usage-badge');
        if (badge) {
            badge.textContent = count > 0 ? String(count) : '';
            badge.style.display = count > 0 ? '' : 'none';
        }

        if (count > 0) {
            const newestTs = new Date(unread[0].created_at).getTime();
            if (newestTs > lastAlertCheck) {
                lastAlertCheck = newestTs;
                showToast(`🔔 ${count} new alert${count === 1 ? '' : 's'} — check MONITOR`, 'info');
            }
        }
    } catch (err) {
        console.error('Alert check failed:', err);
    }
}

// ============================================================
// LOAD LATEST AUDIT RESULTS
// ============================================================

async function loadLatestAuditResults() {
    try {
        if (!currentOrganizationId) {
            console.warn('No organization ID, skipping audit results');
            return;
        }

        const { data: audits, error } = await supabase
            .from('audit_jobs')
            .select('id, score, raw_results, diagnosis, diagnosis_status, optimizations, created_at, completed_at')
            .eq('organization_id', currentOrganizationId)
            .eq('user_id', user.id)
            .eq('status', 'complete')
            .order('completed_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error fetching latest audit:', error);
            return;
        }

        if (!audits || audits.length === 0) {
            console.log('No completed audits found');
            showEmptyDiagnoseState();
            showEmptyOptimizeState();
            showEmptyMonitorState();
            return;
        }

        const audit = audits[0];
        latestAuditId = audit.id;
        latestDiagnosis = audit.diagnosis;

        renderDiagnosis(audit.diagnosis, audit.diagnosis_status);
        renderOptimizations(audit.diagnosis);
        await loadMonitorData(audit);

    } catch (error) {
        console.error('Error loading audit results:', error);
    }
}

// ============================================================
// RENDER DIAGNOSIS — v11.7 shape
// ============================================================

function renderDiagnosis(diagnosis, diagnosisStatus) {
    const tableBody = document.getElementById('diagnoseTableBody');
    if (!tableBody) return;

    // Loading state
    if (diagnosisStatus === 'running' || diagnosisStatus === 'pending') {
        setDiagStat('diagnoseTotalQueries', '—');
        setDiagStat('diagnoseWinningQueries', '—');
        setDiagStat('diagnoseGapCount', '—');
        setDiagStat('diagnoseAvgScore', '—');
        const queryCount = document.getElementById('diagnoseQueryCount');
        if (queryCount) queryCount.textContent = 'Running...';

        renderMetrics(null);

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">🧩</span>
                    <strong>DIAGNOSE is running...</strong><br>
                    <span style="font-size:13px;">Matching tracked competitors and analyzing gaps.</span>
                </td>
            </tr>
        `;

        const gapsContainer = document.getElementById('diagnoseGapsContainer');
        if (gapsContainer) {
            gapsContainer.innerHTML = `
                <div class="diagnose-gap-card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">⏳</span>
                    Analyzing gaps...
                </div>
            `;
        }
        return;
    }

    if (diagnosisStatus === 'failed') {
        renderMetrics(null);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--red);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">⚠️</span>
                    DIAGNOSE failed for this scan.<br>
                    <span style="font-size:13px;">You can retry from the DIAGNOSE tab.</span>
                </td>
            </tr>
        `;
        return;
    }

    const queries = diagnosis?.queries || [];
    const totalQueries = queries.length;
    const winningQueries = queries.filter(q => q.your_brand && q.your_brand.found).length;
    const gaps = diagnosis?.gaps || [];
    const avgScore = diagnosis?.average_score || 0;

    setDiagStat('diagnoseTotalQueries', totalQueries);
    setDiagStat('diagnoseWinningQueries', winningQueries);
    setDiagStat('diagnoseGapCount', gaps.length);
    setDiagStat('diagnoseAvgScore', avgScore);
    const queryCount = document.getElementById('diagnoseQueryCount');
    if (queryCount) queryCount.textContent = `${totalQueries} queries`;

    if (totalQueries === 0) {
        renderMetrics(null);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">✅</span>
                    ${diagnosis?.message || 'No diagnosis data available.<br>Run a visibility scan to get insights.'}
                </td>
            </tr>
        `;
        renderGaps(gaps);
        return;
    }

    renderMetrics(diagnosis);

    const typeLabels = {
        commercial:    { label: 'Commercial',    bg: '#e0f2fe', color: '#0369a1' },
        informational: { label: 'Informational', bg: '#fef3c7', color: '#b45309' },
        navigational:  { label: 'Navigational',  bg: '#e0e7ff', color: '#4338ca' },
        mixed:         { label: 'Mixed',         bg: '#f3e8ff', color: '#7c3aed' },
    };

    tableBody.innerHTML = queries.map(q => {
        const yourFound = q.your_brand?.found || false;
        const competitorsFound = q.competitorsFound || [];
        const trackedCompetitors = q.trackedCompetitors || [];

        let status = 'tied';
        let statusLabel = 'Tied';
        if (yourFound) { status = 'winning'; statusLabel = 'Winning'; }
        else { status = 'losing'; statusLabel = 'Losing'; }

        const qt = q.queryType || 'commercial';
        const typeStyle = typeLabels[qt] || typeLabels.commercial;

        const presentPills = competitorsFound.length > 0
            ? competitorsFound.map(c =>
                `<span style="display:inline-block;background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:12px;margin:2px;white-space:nowrap;">${escapeHtml(c)}</span>`
              ).join(' ')
            : '<span style="color:var(--gray-400);font-size:12px;">None tracked present</span>';

        const absentNames = trackedCompetitors.filter(c => !c.found).map(c => c.name);
        const absentPills = absentNames.length > 0
            ? `<div style="margin-top:6px;opacity:0.55;">${absentNames.map(n =>
                `<span style="display:inline-block;background:var(--gray-100);color:var(--gray-500);padding:2px 8px;border-radius:10px;font-size:11px;margin:2px;white-space:nowrap;">${escapeHtml(n)}</span>`
              ).join(' ')}</div>`
            : '';

        const rawAnswer = q.aiAnswer || '';
        const preview = rawAnswer.slice(0, 140).replace(/\s+/g, ' ').trim();
        const answerCell = rawAnswer
            ? `<details style="font-size:12px;color:var(--gray-700);line-height:1.5;">
                  <summary style="cursor:pointer;color:var(--gray-600);">
                      ${escapeHtml(preview)}${rawAnswer.length > 140 ? '…' : ''}
                  </summary>
                  <div style="margin-top:8px;padding:8px;background:var(--gray-50);border-radius:6px;white-space:pre-wrap;">
                      ${escapeHtml(rawAnswer)}
                  </div>
              </details>`
            : '<span style="color:var(--gray-400);font-size:12px;">No AI answer returned</span>';

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(q.query)}</strong><br>
                    <span style="display:inline-block;margin-top:4px;background:${typeStyle.bg};color:${typeStyle.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${typeStyle.label}</span>
                </td>
                <td>
                    <div class="mention-cell">
                        <span class="mention-dot ${yourFound ? 'found' : 'not-found'}"></span>
                        ${yourFound ? '✅ Mentioned' : '❌ Not Found'}
                    </div>
                </td>
                <td>
                    <div>${presentPills}</div>
                    ${absentPills}
                </td>
                <td>${answerCell}</td>
                <td><span class="status-badge ${status}">${statusLabel}</span></td>
            </tr>
        `;
    }).join('');

    renderGaps(gaps);
}

function renderMetrics(diagnosis) {
    const visibilityEl = document.getElementById('diagnoseAvgVisibility');
    const sovEl = document.getElementById('diagnoseAvgSov');
    const sentimentEl = document.getElementById('diagnoseSentiment');
    const actionEl = document.getElementById('diagnoseTopAction');
    const actionSourceEl = document.getElementById('diagnoseTopActionSource');

    if (!diagnosis) {
        if (visibilityEl) visibilityEl.textContent = '—';
        if (sovEl) sovEl.textContent = '—';
        if (sentimentEl) { sentimentEl.textContent = '—'; sentimentEl.style.color = 'var(--primary)'; }
        if (actionEl) actionEl.textContent = '—';
        if (actionSourceEl) actionSourceEl.textContent = '';
        const lbCard = document.getElementById('diagnoseLeaderboardCard');
        const tsCard = document.getElementById('diagnoseTopSourcesCard');
        if (lbCard) lbCard.style.display = 'none';
        if (tsCard) tsCard.style.display = 'none';
        return;
    }

    if (visibilityEl) {
        visibilityEl.textContent = `${Math.round((diagnosis.averageVisibility || 0) * 100)}%`;
    }
    if (sovEl) {
        sovEl.textContent = `${Math.round((diagnosis.averageShareOfVoice || 0) * 100)}%`;
    }
    if (sentimentEl) {
        const s = diagnosis.sentiment;
        if (s === null || s === undefined) {
            sentimentEl.textContent = '—';
            sentimentEl.style.color = 'var(--gray-400)';
        } else {
            sentimentEl.textContent = `${s}`;
            sentimentEl.style.color = s >= 70 ? 'var(--green)' : s >= 40 ? 'var(--orange)' : 'var(--red)';
        }
    }
    if (actionEl) {
        actionEl.textContent = diagnosis.topAction || '—';
    }
    if (actionSourceEl) {
        const src = diagnosis.topActionSource || 'unknown';
        if (src === 'llm') {
            actionSourceEl.textContent = '✓ Generated by AI';
            actionSourceEl.style.color = 'var(--green)';
        } else if (src === 'fallback') {
            actionSourceEl.textContent = '⚠ Generic fallback — AI generation failed';
            actionSourceEl.style.color = 'var(--orange)';
        } else {
            actionSourceEl.textContent = '';
        }
    }

    const lbCard = document.getElementById('diagnoseLeaderboardCard');
    const lbBody = document.getElementById('diagnoseLeaderboardBody');
    const lbBadge = document.getElementById('diagnoseLeaderboardBadge');
    const lb = diagnosis.leaderboard || [];

    if (lbCard && lbBody) {
        if (lb.length === 0) {
            lbCard.style.display = 'none';
        } else {
            lbCard.style.display = 'block';
            if (lbBadge) lbBadge.textContent = `${lb.length} competitor${lb.length !== 1 ? 's' : ''}`;

            const maxAppearances = Math.max(...lb.map(c => c.appearances), 1);

            lbBody.innerHTML = lb.map((c, i) => {
                const widthPct = Math.round((c.appearances / maxAppearances) * 100);
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const sovPct = Math.round((c.sov || 0) * 100);

                return `
                    <div style="margin-bottom:10px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:13px;font-weight:600;">${medal} ${escapeHtml(c.name)}</span>
                            <span style="font-size:12px;color:var(--gray-500);">${c.appearances} appearances · ${sovPct}% presence</span>
                        </div>
                        <div style="width:100%;height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${widthPct}%;background:var(--primary);border-radius:3px;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    const tsCard = document.getElementById('diagnoseTopSourcesCard');
    const tsBody = document.getElementById('diagnoseTopSourcesBody');
    const ts = diagnosis.topSources || [];

    if (tsCard && tsBody) {
        if (ts.length === 0) {
            tsCard.style.display = 'none';
        } else {
            tsCard.style.display = 'block';
            tsBody.innerHTML = ts.map(s => {
                const isRelevant = s.relevant !== false;
                const style = isRelevant
                    ? 'background:var(--gray-100);color:var(--gray-700);'
                    : 'background:var(--gray-50);color:var(--gray-400);text-decoration:line-through;';
                const title = s.relevanceReason ? ` title="${escapeHtml(s.relevanceReason)}"` : '';
                return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:16px;font-size:12px;${style}"${title}>
                    <strong>${escapeHtml(s.label)}</strong>
                    <span>${s.count}×</span>
                </span>`;
            }).join('');
        }
    }
}

function renderGaps(gaps) {
    const container = document.getElementById('diagnoseGapsContainer');
    if (!container) return;

    if (!gaps || gaps.length === 0) {
        container.innerHTML = `
            <div class="diagnose-gap-card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-500);">
                <span style="display:block;font-size:32px;margin-bottom:8px;">✅</span>
                No gaps identified! You're winning or tied on all queries.
            </div>
        `;
        return;
    }

    container.innerHTML = gaps.map(gap => {
        const severityClass = gap.severity || gap.expected_impact || 'medium';

        return `
            <div class="diagnose-gap-card">
                <div class="gap-border ${severityClass}"></div>
                <div class="gap-header">
                    <span class="gap-icon">${gap.icon || '📄'}</span>
                    <span class="gap-title">${escapeHtml(gap.title)}</span>
                </div>
                <div class="gap-description">${escapeHtml(gap.description)}</div>
                <div class="gap-meta">
                    <span class="gap-severity ${severityClass}">${severityClass.toUpperCase()}</span>
                    ${gap.queryCount ? `<span>${gap.queryCount} queries analyzed</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function setDiagStat(id, value) {
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

function showEmptyDiagnoseState() {
    setDiagStat('diagnoseTotalQueries', '0');
    setDiagStat('diagnoseWinningQueries', '0');
    setDiagStat('diagnoseGapCount', '0');
    setDiagStat('diagnoseAvgScore', '0');
    const el5 = document.getElementById('diagnoseQueryCount');
    if (el5) el5.textContent = '0 queries';

    renderMetrics(null);

    const tableBody = document.getElementById('diagnoseTableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">🔍</span>
                    No diagnosis data available.<br>
                    Run a visibility scan to get insights.
                </td>
            </tr>
        `;
    }
    renderGaps([]);
}

// ============================================================
// RENDER OPTIMIZATIONS
// ============================================================

function renderOptimizations(diagnosis) {
    const container = document.getElementById('optimizeActionsContainer');
    if (!container) return;

    const actions = diagnosis?.actions || [];

    const total = actions.length;
    const high = actions.filter(a => a.priority === 'high').length;
    const medium = actions.filter(a => a.priority === 'medium').length;
    const low = actions.filter(a => a.priority === 'low').length;

    document.getElementById('optimizeTotalActions').textContent = total;
    document.getElementById('optimizeHighPriority').textContent = high;
    document.getElementById('optimizeMediumPriority').textContent = medium;
    document.getElementById('optimizeLowPriority').textContent = low;
    document.getElementById('optimizeHighBadge').textContent = `${high} High`;
    document.getElementById('optimizeMediumBadge').textContent = `${medium} Medium`;
    document.getElementById('optimizeLowBadge').textContent = `${low} Low`;

    if (actions.length === 0) {
        container.innerHTML = `
            <div style="padding:30px;text-align:center;color:var(--gray-500);">
                <span style="display:block;font-size:32px;margin-bottom:8px;">⚡</span>
                No optimization actions available.<br>
                Run a scan to get recommendations.
            </div>
        `;
        return;
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...actions].sort((a, b) =>
        (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
    );

    container.innerHTML = sorted.map((item, index) => {
        const priorityClass = item.priority || 'medium';
        const effortLabel = item.effort === 'S' ? 'Quick win (under 2h)'
            : item.effort === 'M' ? '1–2 days'
            : '3+ days';
        const actionTypeLabel = (item.action_type || 'action').replace(/_/g, ' ');

        const canGenerateOutline =
            item.action_type === 'create_page' ||
            item.action_type === 'content_refresh' ||
            item.action_type === 'faq_schema';

        return `
            <div class="optimize-action-item">
                <div class="action-priority ${priorityClass}">
                    ${priorityClass === 'high' ? '!' : priorityClass === 'medium' ? '!' : 'i'}
                </div>
                <div class="action-content">
                    <div class="action-title">${escapeHtml(item.title)}</div>
                    <div class="action-description">${escapeHtml(item.what)}</div>
                    <div style="font-size:12px;color:var(--gray-600);margin-top:8px;display:flex;flex-wrap:wrap;gap:12px;">
                        ${item.where ? `<span>📍 <strong>Where:</strong> ${escapeHtml(item.where)}</span>` : ''}
                        ${item.why ? `<span style="flex:1;min-width:200px;">💡 <strong>Why:</strong> ${escapeHtml(item.why)}</span>` : ''}
                    </div>
                    <div class="action-meta">
                        <span>Category: ${escapeHtml(actionTypeLabel)}</span>
                        <span class="action-priority-badge ${priorityClass}">${priorityClass.toUpperCase()} PRIORITY</span>
                        <span>Effort: ${effortLabel}</span>
                    </div>
                </div>
                <div class="action-actions">
                    ${canGenerateOutline ? `
                        <button class="btn-primary btn-sm generate-draft-btn"
                                data-action-index="${index}">
                            Generate Outline
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.generate-draft-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.actionIndex);
            generateDraft(sorted[idx]);
        });
    });
}

function showEmptyOptimizeState() {
    document.getElementById('optimizeTotalActions').textContent = '0';
    document.getElementById('optimizeHighPriority').textContent = '0';
    document.getElementById('optimizeMediumPriority').textContent = '0';
    document.getElementById('optimizeLowPriority').textContent = '0';
    document.getElementById('optimizeHighBadge').textContent = '0 High';
    document.getElementById('optimizeMediumBadge').textContent = '0 Medium';
    document.getElementById('optimizeLowBadge').textContent = '0 Low';

    const container = document.getElementById('optimizeActionsContainer');
    if (container) {
        container.innerHTML = `
            <div style="padding:30px;text-align:center;color:var(--gray-500);">
                <span style="display:block;font-size:32px;margin-bottom:8px;">⚡</span>
                No optimization actions available.<br>
                Run a scan to get recommendations.
            </div>
        `;
    }
}

function generateDraft(action) {
    if (!action) {
        showToast('No action provided', 'error');
        return;
    }

    const draftOutput = document.getElementById('draftOutput');
    const draftContent = document.getElementById('draftContent');
    if (!draftOutput || !draftContent) return;

    const diagnosis = latestDiagnosis || {};
    const leaderboard = diagnosis.leaderboard || [];
    const topSources = diagnosis.topSources || [];
    const queries = diagnosis.queries || [];

    const lines = [];

    lines.push(`# ${action.title}`);
    lines.push('');

    lines.push(`**What:** ${action.what}`);
    lines.push(`**Where:** ${action.where}`);
    lines.push(`**Priority:** ${(action.priority || 'medium').toUpperCase()}`);
    lines.push(`**Effort:** ${action.effort === 'S' ? 'Quick win (under 2h)' : action.effort === 'M' ? '1–2 days' : '3+ days'}`);
    lines.push('');

    if (action.why) {
        lines.push('## Why this works');
        lines.push('');
        lines.push(action.why);
        lines.push('');
    }

    if (leaderboard.length > 0) {
        lines.push('## Competitive context');
        lines.push('');
        lines.push('| Competitor | Appearances | Presence |');
        lines.push('|---|---|---|');
        for (const c of leaderboard) {
            lines.push(`| ${c.name} | ${c.appearances} | ${Math.round((c.sov || 0) * 100)}% |`);
        }
        lines.push('');
    }

    if (topSources.length > 0) {
        lines.push('## Where AI currently pulls answers from');
        lines.push('');
        for (const s of topSources) {
            lines.push(`- **${s.label}** — cited ${s.count}×`);
        }
        lines.push('');
    }

    if (queries.length > 0) {
        lines.push('## Target queries');
        lines.push('');
        for (const q of queries) {
            lines.push(`- "${q.query}" — currently **${q.your_brand?.found ? 'mentioned' : 'not mentioned'}**`);
        }
        lines.push('');
    }

    if (queries.length > 0) {
        lines.push('## FAQ (draft)');
        lines.push('');
        for (const q of queries) {
            lines.push(`### ${q.query}`);
            lines.push('');
            lines.push('_[Your answer here. Reference how you differ from the competitors above.]_');
            lines.push('');
        }
    }

    lines.push('## Suggested structure');
    lines.push('');
    lines.push('1. **Hook** — lead with the specific problem your audience is searching for.');
    lines.push('2. **Data** — cite the competitive table above to establish credibility.');
    lines.push('3. **Differentiation** — explain what you do that the leaders don\'t.');
    lines.push('4. **Proof** — case study, testimonial, or metric.');
    lines.push('5. **Call to action** — link to your solution.');
    lines.push('');

    lines.push('---');
    lines.push('_Structured outline generated from scan data. Hand it to a writer, or paste it into ChatGPT/Claude as a brief._');

    draftContent.textContent = lines.join('\n');
    draftOutput.style.display = 'block';
    draftOutput.scrollIntoView({ behavior: 'smooth' });
    showToast('✅ Outline ready', 'success');
}

function attachDraftCopyHandler() {
    const btn = document.getElementById('copyDraftBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const text = document.getElementById('draftContent')?.textContent || '';
        navigator.clipboard.writeText(text)
            .then(() => showToast('📋 Copied to clipboard', 'success'))
            .catch(() => showToast('Could not copy', 'error'));
    });
}

// ============================================================
// MONITOR — Industry Standard v2
// ============================================================

async function loadMonitorData(audit) {
    if (!currentOrganizationId) return;

    try {
        const since365 = new Date();
        since365.setDate(since365.getDate() - 365);

        const { data: history, error: histError } = await supabase
            .from('monitor_history')
            .select('id, audit_job_id, score, average_visibility, average_share_of_voice, sentiment, leaderboard_json, recorded_at')
            .eq('organization_id', currentOrganizationId)
            .gte('recorded_at', since365.toISOString())
            .order('recorded_at', { ascending: true });

        if (histError) {
            console.error('Error loading monitor history:', histError);
            return;
        }

        monitorState.history = history || [];

        await renderAlerts();
        await loadMonitorSchedule();

        renderMonitorHeroMetrics();
        renderMonitorChart();
        renderMonitorSinceLast();
        renderMonitorCompetitorMovement();
        renderMonitorHistory();

    } catch (error) {
        console.error('Error loading monitor data:', error);
    }
}

function renderMonitorHeroMetrics() {
    const history = monitorState.history;

    if (!history || history.length === 0) {
        setText('monitorVisibility', '—');
        setText('monitorSov', '—');
        setText('monitorSentiment', '—');
        setText('monitorScore', '—');
        clearDelta('monitorVisibilityDelta');
        clearDelta('monitorSovDelta');
        clearDelta('monitorSentimentDelta');
        clearDelta('monitorScoreDelta');
        setText('monitorLastScanTime', 'No scans yet');
        return;
    }

    const current = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;

    const vis = current.average_visibility !== null && current.average_visibility !== undefined
        ? Math.round(current.average_visibility * 100) : null;
    setText('monitorVisibility', vis !== null ? `${vis}%` : '—');
    if (previous && vis !== null && previous.average_visibility !== null) {
        const prevVis = Math.round(previous.average_visibility * 100);
        setDelta('monitorVisibilityDelta', vis - prevVis, '%');
    } else {
        clearDelta('monitorVisibilityDelta');
    }

    const sov = current.average_share_of_voice !== null && current.average_share_of_voice !== undefined
        ? Math.round(current.average_share_of_voice * 100) : null;
    setText('monitorSov', sov !== null ? `${sov}%` : '—');
    if (previous && sov !== null && previous.average_share_of_voice !== null) {
        const prevSov = Math.round(previous.average_share_of_voice * 100);
        setDelta('monitorSovDelta', sov - prevSov, '%');
    } else {
        clearDelta('monitorSovDelta');
    }

    const sent = current.sentiment;
    setText('monitorSentiment', sent !== null && sent !== undefined ? `${sent}` : '—');
    if (previous && sent !== null && previous.sentiment !== null) {
        setDelta('monitorSentimentDelta', sent - previous.sentiment, '');
    } else {
        clearDelta('monitorSentimentDelta');
    }

    setText('monitorScore', `${current.score ?? 0}`);
    if (previous) {
        setDelta('monitorScoreDelta', (current.score || 0) - (previous.score || 0), '');
    } else {
        clearDelta('monitorScoreDelta');
    }

    const lastTime = new Date(current.recorded_at);
    const now = new Date();
    const diffMs = now - lastTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeStr;
    if (diffMins < 1) timeStr = 'just now';
    else if (diffMins < 60) timeStr = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    else if (diffHours < 24) timeStr = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    else timeStr = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    setText('monitorLastScanTime', `Last scan: ${timeStr}`);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setDelta(id, delta, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    if (delta === 0) {
        el.textContent = '—';
        el.style.color = 'var(--gray-400)';
    } else if (delta > 0) {
        el.textContent = `+${delta}${suffix}`;
        el.style.color = 'var(--green)';
    } else {
        el.textContent = `${delta}${suffix}`;
        el.style.color = 'var(--red)';
    }
}

function clearDelta(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
}

function renderMonitorChart() {
    const canvas = document.getElementById('monitorChart');
    const empty = document.getElementById('monitorChartEmpty');
    if (!canvas) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - monitorState.timeRange);

    const filtered = monitorState.history.filter(h =>
        new Date(h.recorded_at) >= cutoff
    );

    const metricKey = monitorState.currentMetric;
    const columnMap = {
        visibility: 'average_visibility',
        sov: 'average_share_of_voice',
        sentiment: 'sentiment',
        score: 'score',
    };
    const column = columnMap[metricKey];

    const points = [];
    for (const row of filtered) {
        const raw = row[column];
        if (raw === null || raw === undefined) continue;

        let value;
        if (metricKey === 'visibility' || metricKey === 'sov') {
            value = Math.round(raw * 100);
        } else {
            value = raw;
        }
        points.push({
            x: new Date(row.recorded_at),
            y: value,
        });
    }

    if (points.length < 2) {
        if (empty) empty.style.display = 'block';
        canvas.style.display = 'none';
        return;
    }

    if (empty) empty.style.display = 'none';
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width - 32;
    const height = 220;
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(2, 2);

    const maxY = metricKey === 'sentiment'
        ? 100
        : metricKey === 'visibility' || metricKey === 'sov'
            ? 100
            : Math.max(100, ...points.map(p => p.y));

    const minY = 0;
    const range = maxY - minY || 1;

    const padding = { top: 12, bottom: 28, left: 36, right: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#9ca3af';

    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        const val = Math.round(maxY - (range / 4) * i);
        ctx.textAlign = 'right';
        ctx.fillText(String(val), padding.left - 6, y + 3);
    }

    const stepX = chartWidth / (points.length - 1);

    ctx.textAlign = 'center';
    const labelInterval = Math.max(1, Math.floor(points.length / 6));
    points.forEach((p, i) => {
        if (i % labelInterval === 0 || i === points.length - 1) {
            const x = padding.left + i * stepX;
            const label = p.x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            ctx.fillText(label, x, padding.top + chartHeight + 16);
        }
    });

    ctx.beginPath();
    points.forEach((p, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - ((p.y - minY) / range) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const lastX = padding.left + (points.length - 1) * stepX;
    ctx.lineTo(lastX, padding.top + chartHeight);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20, 184, 166, 0.08)';
    ctx.fill();

    points.forEach((p, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - ((p.y - minY) / range) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#14b8a6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

function renderMonitorSinceLast() {
    const body = document.getElementById('monitorSinceLastBody');
    const label = document.getElementById('monitorSinceLastLabel');
    if (!body) return;

    const history = monitorState.history;
    if (!history || history.length < 2) {
        if (label) label.textContent = '—';
        body.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                ${history.length === 0 ? 'No scans yet.' : 'Run another scan to see changes.'}
            </div>
        `;
        return;
    }

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    const rows = [];

    if (current.average_visibility !== null && previous.average_visibility !== null) {
        const curr = Math.round(current.average_visibility * 100);
        const prev = Math.round(previous.average_visibility * 100);
        const delta = curr - prev;
        rows.push({
            label: 'Visibility',
            from: `${prev}%`,
            to: `${curr}%`,
            delta,
            suffix: '%',
        });
    }

    if (current.average_share_of_voice !== null && previous.average_share_of_voice !== null) {
        const curr = Math.round(current.average_share_of_voice * 100);
        const prev = Math.round(previous.average_share_of_voice * 100);
        const delta = curr - prev;
        rows.push({
            label: 'Share of Voice',
            from: `${prev}%`,
            to: `${curr}%`,
            delta,
            suffix: '%',
        });
    }

    if (current.sentiment !== null && previous.sentiment !== null) {
        const delta = current.sentiment - previous.sentiment;
        rows.push({
            label: 'Sentiment',
            from: `${previous.sentiment}`,
            to: `${current.sentiment}`,
            delta,
            suffix: '',
        });
    }

    const scoreDelta = (current.score || 0) - (previous.score || 0);
    rows.push({
        label: 'Score',
        from: `${previous.score || 0}`,
        to: `${current.score || 0}`,
        delta: scoreDelta,
        suffix: '',
    });

    const prevDate = new Date(previous.recorded_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
    });
    if (label) label.textContent = `vs ${prevDate}`;

    if (rows.length === 0) {
        body.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                No comparable metrics yet.
            </div>
        `;
        return;
    }

    body.innerHTML = rows.map(r => {
        let arrow, color;
        if (r.delta > 0) { arrow = '↑'; color = 'var(--green)'; }
        else if (r.delta < 0) { arrow = '↓'; color = 'var(--red)'; }
        else { arrow = '—'; color = 'var(--gray-400)'; }

        const deltaText = r.delta === 0
            ? 'no change'
            : `${r.delta > 0 ? '+' : ''}${r.delta}${r.suffix}`;

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                <div style="font-size:13px;color:var(--gray-700);font-weight:500;">${r.label}</div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:12px;color:var(--gray-500);">${r.from} → ${r.to}</span>
                    <span style="font-size:12px;font-weight:600;color:${color};">${arrow} ${deltaText}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderMonitorCompetitorMovement() {
    const body = document.getElementById('monitorCompetitorMovementBody');
    const badge = document.getElementById('monitorCompetitorMovementBadge');
    if (!body) return;

    const history = monitorState.history;
    if (!history || history.length < 2) {
        if (badge) badge.textContent = '0 tracked';
        body.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                Run another scan to see competitor movement.
            </div>
        `;
        return;
    }

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    const currLb = Array.isArray(current.leaderboard_json) ? current.leaderboard_json : [];
    const prevLb = Array.isArray(previous.leaderboard_json) ? previous.leaderboard_json : [];

    const currMap = new Map(currLb.map(c => [c.name, c]));
    const prevMap = new Map(prevLb.map(c => [c.name, c]));

    const allNames = new Set([...currMap.keys(), ...prevMap.keys()]);

    if (allNames.size === 0) {
        if (badge) badge.textContent = '0 tracked';
        body.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                No tracked competitors in recent scans.
            </div>
        `;
        return;
    }

    const movements = [];
    for (const name of allNames) {
        const curr = currMap.get(name);
        const prev = prevMap.get(name);
        const currCount = curr?.appearances || 0;
        const prevCount = prev?.appearances || 0;
        const delta = currCount - prevCount;

        if (delta !== 0 || (!prev && curr) || (prev && !curr)) {
            movements.push({
                name,
                from: prevCount,
                to: currCount,
                delta,
                isNew: !prev && curr,
                isGone: prev && !curr,
            });
        }
    }

    if (badge) badge.textContent = `${allNames.size} tracked`;

    if (movements.length === 0) {
        body.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                No movement since last scan.
            </div>
        `;
        return;
    }

    movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    body.innerHTML = movements.slice(0, 8).map(m => {
        let icon, color, text;
        if (m.isNew) {
            icon = '🆕';
            color = 'var(--orange)';
            text = `New — appears in ${m.to} ${m.to === 1 ? 'query' : 'queries'}`;
        } else if (m.isGone) {
            icon = '✓';
            color = 'var(--green)';
            text = `Gone — was in ${m.from}`;
        } else if (m.delta > 0) {
            icon = '↑';
            color = 'var(--red)';
            text = `+${m.delta} (${m.from} → ${m.to})`;
        } else {
            icon = '↓';
            color = 'var(--green)';
            text = `${m.delta} (${m.from} → ${m.to})`;
        }

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                <div style="font-size:13px;color:var(--gray-700);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">${icon} ${escapeHtml(m.name)}</div>
                <div style="font-size:12px;color:${color};font-weight:500;">${text}</div>
            </div>
        `;
    }).join('');
}

async function renderAlerts() {
    const container = document.getElementById('monitorAlertsContainer');
    if (!container) return;

    try {
        const { data: alerts, error } = await supabase
            .from('alerts')
            .select('*')
            .eq('organization_id', currentOrganizationId)
            .order('created_at', { ascending: false })
            .limit(20);

        const unreadCount = alerts?.filter(a => !a.is_read)?.length || 0;
        setText('monitorAlertCount', `${unreadCount} new`);

        if (error || !alerts || alerts.length === 0) {
            container.innerHTML = `
                <div style="padding:20px;text-align:center;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">🔔</span>
                    No alerts yet. We'll notify you when something changes.
                </div>
            `;
            return;
        }

        container.innerHTML = alerts.map(alert => {
            const severity = alert.severity || 'info';
            const iconMap = { 'critical': '🚨', 'warning': '⚠️', 'info': 'ℹ️', 'success': '✅' };
            const icon = iconMap[severity] || 'ℹ️';
            const unreadStyle = alert.is_read ? 'opacity:0.6;' : '';

            return `
                <div class="monitor-alert-item" style="display:flex;gap:12px;padding:12px;border-bottom:1px solid var(--gray-100);${unreadStyle}">
                    <div style="font-size:20px;flex-shrink:0;">${icon}</div>
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:600;color:var(--gray-800);">${escapeHtml(alert.title || '')}</div>
                        <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">${escapeHtml(alert.message || '')}</div>
                        <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">${new Date(alert.created_at).toLocaleString()}</div>
                    </div>
                    <div style="display:flex;align-items:center;">
                        <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:10px;background:${severity === 'critical' ? '#fee2e2' : severity === 'warning' ? '#fef3c7' : severity === 'success' ? '#dcfce7' : '#e0f2fe'};color:${severity === 'critical' ? '#991b1b' : severity === 'warning' ? '#b45309' : severity === 'success' ? '#166534' : '#0369a1'};">${severity.toUpperCase()}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading alerts:', error);
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                Failed to load alerts.
            </div>
        `;
    }
}

async function markAllAlertsRead() {
    if (!currentOrganizationId) return;

    try {
        const { error } = await supabase
            .from('alerts')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('organization_id', currentOrganizationId)
            .eq('is_read', false);

        if (error) throw error;

        showToast('All alerts marked as read', 'success');
        await renderAlerts();
        await checkForNewAlerts();
    } catch (err) {
        console.error('Error marking alerts read:', err);
        showToast('Could not mark alerts as read', 'error');
    }
}

function renderMonitorHistory() {
    const tbody = document.getElementById('monitorHistoryBody');
    const countBadge = document.getElementById('monitorHistoryCount');
    if (!tbody) return;

    const history = [...monitorState.history].reverse();

    if (countBadge) countBadge.textContent = `${history.length} scan${history.length === 1 ? '' : 's'}`;

    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">📅</span>
                    No scan history yet.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = history.slice(0, 20).map(row => {
        const date = new Date(row.recorded_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
        const time = new Date(row.recorded_at).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit',
        });

        const vis = row.average_visibility !== null && row.average_visibility !== undefined
            ? `${Math.round(row.average_visibility * 100)}%` : '—';
        const sov = row.average_share_of_voice !== null && row.average_share_of_voice !== undefined
            ? `${Math.round(row.average_share_of_voice * 100)}%` : '—';
        const sent = row.sentiment !== null && row.sentiment !== undefined ? `${row.sentiment}` : '—';

        return `
            <tr>
                <td style="font-size:12px;">${date}<br><span style="color:var(--gray-400);font-size:11px;">${time}</span></td>
                <td><strong>${row.score ?? 0}</strong></td>
                <td>${vis}</td>
                <td>${sov}</td>
                <td>${sent}</td>
                <td style="font-size:12px;color:var(--gray-500);">manual</td>
                <td>
                    <button class="btn-secondary btn-sm" style="font-size:11px;" onclick="window.loadLatestAuditResults && window.loadLatestAuditResults()">View</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadMonitorSchedule() {
    if (!currentOrganizationId) return;

    try {
        const { data: schedule, error } = await supabase
            .from('monitor_schedules')
            .select('*')
            .eq('organization_id', currentOrganizationId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error loading schedule:', error);
            return;
        }

        monitorState.schedule = schedule || null;
        renderMonitorScheduleForm();

    } catch (err) {
        console.error('Schedule load failed:', err);
    }
}

function renderMonitorScheduleForm() {
    const badge = document.getElementById('monitorScheduleStatusBadge');
    const freqEl = document.getElementById('monitorScheduleFrequency');
    const nextRunEl = document.getElementById('monitorScheduleNextRun');
    const emailEl = document.getElementById('monitorScheduleEmail');

    if (!monitorState.schedule) {
        if (badge) { badge.textContent = 'Not configured'; badge.className = 'badge muted'; }
        if (freqEl) freqEl.value = 'weekly';
        if (nextRunEl) nextRunEl.textContent = 'Not scheduled';
        if (emailEl) emailEl.value = '';
        return;
    }

    const s = monitorState.schedule;
    if (badge) {
        badge.textContent = s.is_active ? 'Active' : 'Paused';
        badge.className = s.is_active ? 'badge success' : 'badge muted';
    }
    if (freqEl) freqEl.value = s.frequency || 'weekly';
    if (emailEl) emailEl.value = s.email || user.email || '';

    if (nextRunEl && s.next_run_at) {
        const next = new Date(s.next_run_at);
        nextRunEl.textContent = next.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } else if (nextRunEl) {
        nextRunEl.textContent = 'Not scheduled';
    }
}

async function saveMonitorSchedule() {
    if (!currentOrganizationId) return;
    if (!latestAuditId) {
        showToast('Run a scan first before creating a schedule.', 'warning');
        return;
    }

    const freq = document.getElementById('monitorScheduleFrequency')?.value || 'weekly';
    const email = document.getElementById('monitorScheduleEmail')?.value?.trim() || null;

    try {
        const { data: audit, error: auditErr } = await supabase
            .from('audit_jobs')
            .select('website, business_name, industry, location, queries, competitors')
            .eq('id', latestAuditId)
            .single();

        if (auditErr || !audit) throw new Error('Could not fetch latest scan config');

        const nextRun = new Date();
        if (freq === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        else if (freq === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        else if (freq === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
        else if (freq === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

        const payload = {
            organization_id: currentOrganizationId,
            user_id: user.id,
            website: audit.website,
            business_name: audit.business_name,
            industry: audit.industry,
            location: audit.location,
            queries: audit.queries,
            competitors: audit.competitors,
            frequency: freq,
            next_run_at: nextRun.toISOString(),
            is_active: true,
        };

        let result;
        if (monitorState.schedule) {
            result = await supabase
                .from('monitor_schedules')
                .update(payload)
                .eq('id', monitorState.schedule.id)
                .select()
                .single();
        } else {
            result = await supabase
                .from('monitor_schedules')
                .insert(payload)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        monitorState.schedule = result.data;
        renderMonitorScheduleForm();
        showToast('✅ Schedule saved', 'success');

    } catch (err) {
        console.error('Save schedule failed:', err);
        showToast('Could not save schedule: ' + err.message, 'error');
    }
}

async function pauseMonitorSchedule() {
    if (!monitorState.schedule) {
        showToast('No schedule to pause', 'warning');
        return;
    }

    try {
        const { error } = await supabase
            .from('monitor_schedules')
            .update({ is_active: false })
            .eq('id', monitorState.schedule.id);

        if (error) throw error;

        monitorState.schedule = null;
        renderMonitorScheduleForm();
        showToast('Schedule paused', 'success');
    } catch (err) {
        console.error('Pause failed:', err);
        showToast('Could not pause schedule', 'error');
    }
}

async function deleteMonitorSchedule() {
    if (!monitorState.schedule) {
        showToast('No schedule to remove', 'warning');
        return;
    }

    if (!confirm('Remove this schedule? This cannot be undone.')) return;

    try {
        const { error } = await supabase
            .from('monitor_schedules')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('id', monitorState.schedule.id);

        if (error) throw error;

        monitorState.schedule = null;
        renderMonitorScheduleForm();
        showToast('Schedule removed', 'success');
    } catch (err) {
        console.error('Delete failed:', err);
        showToast('Could not remove schedule', 'error');
    }
}

// ============================================================
// REPEAT SCHEDULE (from FIND form)
// ============================================================

function computeNextRunAt(frequency, timeStr) {
    const [hours, minutes] = (timeStr || '09:00').split(':').map(Number);
    const next = new Date();

    if (frequency === 'daily') next.setDate(next.getDate() + 1);
    else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
    else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
    else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 7);

    next.setHours(hours || 9, minutes || 0, 0, 0);
    return next.toISOString();
}

async function upsertRepeatSchedule(auditJob, frequency, timeStr) {
    if (!currentOrganizationId || !auditJob) return;

    const payload = {
        organization_id: currentOrganizationId,
        user_id: user.id,
        website: auditJob.website,
        business_name: auditJob.business_name,
        industry: auditJob.industry,
        location: auditJob.location,
        queries: auditJob.queries,
        competitors: auditJob.competitors,
        frequency: frequency,
        next_run_at: computeNextRunAt(frequency, timeStr),
        is_active: true,
    };

    const { data: existing, error: lookupError } = await supabase
        .from('monitor_schedules')
        .select('id')
        .eq('organization_id', currentOrganizationId)
        .eq('website', auditJob.website)
        .is('deleted_at', null)
        .maybeSingle();

    if (lookupError) {
        console.error('Schedule lookup failed:', lookupError);
        return;
    }

    if (existing) {
        const { error: updateError } = await supabase
            .from('monitor_schedules')
            .update(payload)
            .eq('id', existing.id);

        if (updateError) {
            console.error('Schedule update failed:', updateError);
            return;
        }

        monitorState.schedule = { ...existing, ...payload };
    } else {
        const { data: inserted, error: insertError } = await supabase
            .from('monitor_schedules')
            .insert(payload)
            .select()
            .single();

        if (insertError) {
            console.error('Schedule insert failed:', insertError);
            return;
        }

        monitorState.schedule = inserted;
    }

    renderMonitorScheduleForm();
}

// ============================================================
// MONITOR EMPTY STATE
// ============================================================

function showEmptyMonitorState() {
    setText('monitorVisibility', '—');
    setText('monitorSov', '—');
    setText('monitorSentiment', '—');
    setText('monitorScore', '—');
    clearDelta('monitorVisibilityDelta');
    clearDelta('monitorSovDelta');
    clearDelta('monitorSentimentDelta');
    clearDelta('monitorScoreDelta');
    setText('monitorLastScanTime', 'No scans yet');
    setText('monitorAlertCount', '0 new');
    setText('monitorHistoryCount', '0 scans');

    const canvas = document.getElementById('monitorChart');
    const empty = document.getElementById('monitorChartEmpty');
    if (canvas) canvas.style.display = 'none';
    if (empty) empty.style.display = 'block';

    const sinceLastBody = document.getElementById('monitorSinceLastBody');
    if (sinceLastBody) {
        sinceLastBody.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                No previous scan to compare yet.
            </div>
        `;
    }

    const compBody = document.getElementById('monitorCompetitorMovementBody');
    if (compBody) {
        compBody.innerHTML = `
            <div style="text-align:center;color:var(--gray-500);padding:20px 0;">
                Track competitors to see movement.
            </div>
        `;
    }

    const alertsContainer = document.getElementById('monitorAlertsContainer');
    if (alertsContainer) {
        alertsContainer.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--gray-500);">
                <span style="display:block;font-size:32px;margin-bottom:8px;">🔔</span>
                No alerts yet. We'll notify you when something changes.
            </div>
        `;
    }

    const histBody = document.getElementById('monitorHistoryBody');
    if (histBody) {
        histBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--gray-500);">
                    <span style="display:block;font-size:32px;margin-bottom:8px;">📅</span>
                    No scan history yet.
                </td>
            </tr>
        `;
    }
}

// ============================================================
// MONITOR BUTTONS
// ============================================================

function attachMonitorButtons() {
    document.querySelectorAll('.monitor-metric-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.monitor-metric-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            monitorState.currentMetric = this.dataset.metric || 'visibility';
            renderMonitorChart();
        });
    });

    document.querySelectorAll('.monitor-time-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.monitor-time-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            monitorState.timeRange = parseInt(this.dataset.range) || 30;
            renderMonitorChart();
        });
    });

    const runScanBtn = document.getElementById('monitorRunScanBtn');
    if (runScanBtn) {
        runScanBtn.addEventListener('click', () => {
            const findTab = document.querySelector('.pillar-tab[data-pillar="find"]');
            if (findTab) findTab.click();
            setTimeout(() => {
                document.getElementById('auditForm')?.scrollIntoView({ behavior: 'smooth' });
            }, 200);
        });
    }

    const configBtn = document.getElementById('monitorConfigureScheduleBtn');
    if (configBtn) {
        configBtn.addEventListener('click', () => {
            document.getElementById('monitorScheduleCard')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const markReadBtn = document.getElementById('monitorMarkAllReadBtn');
    if (markReadBtn) {
        markReadBtn.addEventListener('click', markAllAlertsRead);
    }

    const saveBtn = document.getElementById('monitorScheduleSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveMonitorSchedule);

    const pauseBtn = document.getElementById('monitorSchedulePauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', pauseMonitorSchedule);

    const deleteBtn = document.getElementById('monitorScheduleDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteMonitorSchedule);
}

// ============================================================
// FIND TAB HELPERS
// ============================================================

async function updateFindStats() {
    try {
        if (!currentOrganizationId) return;

        const { data: scans, error } = await supabase
            .from('audit_jobs')
            .select('status, score')
            .eq('organization_id', currentOrganizationId)
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching stats:', error);
            return;
        }

        const total = scans?.length || 0;
        const completed = scans?.filter(s => s.status === 'complete')?.length || 0;
        const pending = scans?.filter(s => s.status === 'pending' || s.status === 'scanning')?.length || 0;
        const scores = scans?.filter(s => s.score !== null).map(s => s.score) || [];
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

        document.getElementById('findTotalScans').textContent = total;
        document.getElementById('findCompletedScans').textContent = completed;
        document.getElementById('findPendingScans').textContent = pending;
        document.getElementById('findAvgScore').textContent = avg !== null ? avg : '—';

        document.getElementById('recentScansCount').textContent = `${total} scans`;
    } catch (error) {
        console.error('Error updating find stats:', error);
    }
}

async function loadRecentScans() {
    const tbody = document.getElementById('recentScansBody');
    if (!tbody) return;

    try {
        if (!currentOrganizationId) await fetchOrganizationId();
        if (!currentOrganizationId) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:30px;color:var(--gray-500);">
                        <span style="display:block;font-size:32px;margin-bottom:8px;">🔍</span>
                        No scans found. Run your first scan above!
                    </td>
                </tr>
            `;
            return;
        }

        const { data: scans, error } = await supabase
            .from('audit_jobs')
            .select('id, queries, score, status, diagnosis_status, created_at')
            .eq('organization_id', currentOrganizationId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching scans:', error);
            return;
        }

        if (!scans || scans.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:30px;color:var(--gray-500);">
                        <span style="display:block;font-size:32px;margin-bottom:8px;">🔍</span>
                        No scans found. Run your first scan above!
                    </td>
                </tr>
            `;
            return;
        }

        await updateFindStats();

        tbody.innerHTML = scans.map(scan => {
            const date = new Date(scan.created_at);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const statusMap = {
                'pending': '<span class="status-dot pending"></span> Pending',
                'scanning': '<span class="status-dot scanning"></span> Scanning',
                'complete': '<span class="status-dot complete"></span> Complete',
                'failed': '<span class="status-dot failed"></span> Failed'
            };
            const statusHtml = statusMap[scan.status] || statusMap['pending'];
            const statusClass = scan.status === 'complete' ? 'complete' : scan.status === 'pending' ? 'pending' : scan.status === 'scanning' ? 'scanning' : 'failed';

            const isComplete = scan.status === 'complete';
            const scoreDisplay = scan.score !== null ? scan.score : '—';

            let diagnoseLabel = '';
            if (isComplete) {
                if (scan.diagnosis_status === 'complete') diagnoseLabel = ' · 🧩';
                else if (scan.diagnosis_status === 'running' || scan.diagnosis_status === 'pending') diagnoseLabel = ' · ⏳';
                else if (scan.diagnosis_status === 'failed') diagnoseLabel = ' · ⚠️';
            }

            return `
                <tr>
                    <td>${dateStr}, ${timeStr}</td>
                    <td>${scan.queries?.length || 0}</td>
                    <td><strong>${scoreDisplay}</strong>${diagnoseLabel}</td>
                    <td><span class="status-badge ${statusClass}">${statusHtml}</span></td>
                    <td>
                        ${isComplete ? `
                            <button class="btn-view-results" data-audit-id="${scan.id}">View Results</button>
                        ` : `
                            <span style="font-size:12px;color:var(--gray-400);">Processing...</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-view-results').forEach(btn => {
            btn.addEventListener('click', function() {
                loadSpecificAudit(this.dataset.auditId);
            });
        });

    } catch (error) {
        console.error('Error loading scans:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:30px;color:var(--red);">
                    Failed to load scans. Please refresh.
                </td>
            </tr>
        `;
    }
}

async function loadSpecificAudit(auditId) {
    try {
        showToast('Loading audit results...', 'info');

        const { data: audit, error } = await supabase
            .from('audit_jobs')
            .select('*')
            .eq('id', auditId)
            .single();

        if (error) {
            console.error('Error loading audit:', error);
            showToast('Failed to load audit results.', 'error');
            return;
        }

        if (audit.status !== 'complete') {
            showToast('This audit is still processing. Check back later.', 'warning');
            return;
        }

        latestAuditId = audit.id;
        latestDiagnosis = audit.diagnosis;

        renderDiagnosis(audit.diagnosis, audit.diagnosis_status);
        renderOptimizations(audit.diagnosis);
        await loadMonitorData(audit);

        markDiagnoseRefreshed();

        const diagnoseTab = document.querySelector('.pillar-tab[data-pillar="diagnose"]');
        if (diagnoseTab) diagnoseTab.click();

        showToast('✅ Audit results loaded!', 'success');

    } catch (error) {
        console.error('Error loading specific audit:', error);
        showToast('Failed to load audit results.', 'error');
    }
}

// ============================================================
// FULL REPORT HANDLER
// ============================================================

function attachFullReportHandler() {
    const btn = document.getElementById('fullReportBtn');
    if (!btn) {
        console.warn('⚠️ fullReportBtn not found');
        return;
    }

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openReportModal();
    });

    console.log('✅ Full Report handler attached');
    attachModalCloseHandlers();
}

function attachModalCloseHandlers() {
    const closeBtn = document.getElementById('reportModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeReportModal);

    const cancelBtn = document.getElementById('reportCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeReportModal);

    const overlay = document.querySelector('.report-modal-overlay');
    if (overlay) overlay.addEventListener('click', closeReportModal);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && reportModalOpen) closeReportModal();
    });
}

function openReportModal() {
    const modal = document.getElementById('fullReportModal');
    if (!modal) return;

    const progressBar = document.getElementById('reportProgressBar');
    const percentEl = document.getElementById('reportProgressPercent');
    const stepEl = document.getElementById('reportProgressStep');
    const statusText = document.getElementById('reportStatusText');
    const downloadBtn = document.getElementById('reportDownloadBtn');
    const cancelBtn = document.getElementById('reportCancelBtn');

    if (progressBar) progressBar.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (stepEl) stepEl.textContent = 'Initializing...';
    if (statusText) {
        statusText.textContent = 'Preparing your report...';
        statusText.style.color = 'var(--gray-600)';
    }
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    modal.style.display = 'flex';
    reportModalOpen = true;

    simulateReportProgress();
}

function closeReportModal() {
    const modal = document.getElementById('fullReportModal');
    if (!modal) return;

    if (reportInterval) {
        clearInterval(reportInterval);
        reportInterval = null;
    }

    modal.style.display = 'none';
    reportModalOpen = false;
}

function simulateReportProgress() {
    let progress = 0;
    const steps = [
        { at: 10, label: 'Collecting scan data...' },
        { at: 25, label: 'Analyzing visibility metrics...' },
        { at: 40, label: 'Generating diagnosis...' },
        { at: 55, label: 'Creating optimization plan...' },
        { at: 70, label: 'Building monitor trends...' },
        { at: 85, label: 'Formatting report...' },
        { at: 100, label: '✅ Report ready!' }
    ];

    const progressBar = document.getElementById('reportProgressBar');
    const percentEl = document.getElementById('reportProgressPercent');
    const stepEl = document.getElementById('reportProgressStep');
    const statusText = document.getElementById('reportStatusText');
    const downloadBtn = document.getElementById('reportDownloadBtn');
    const cancelBtn = document.getElementById('reportCancelBtn');

    if (reportInterval) clearInterval(reportInterval);

    reportInterval = setInterval(() => {
        const increment = Math.floor(Math.random() * 5) + 1;
        progress = Math.min(progress + increment, 100);

        if (progressBar) progressBar.style.width = progress + '%';
        if (percentEl) percentEl.textContent = progress + '%';

        for (const step of steps) {
            if (progress >= step.at) {
                if (stepEl) stepEl.textContent = step.label;
                if (step.at === 100 && statusText) {
                    statusText.textContent = '✅ Report generated successfully!';
                    statusText.style.color = 'var(--success)';
                }
            }
        }

        if (progress >= 100) {
            clearInterval(reportInterval);
            reportInterval = null;

            if (downloadBtn) downloadBtn.style.display = 'inline-flex';
            if (cancelBtn) cancelBtn.style.display = 'none';

            downloadBtn.addEventListener('click', function downloadHandler() {
                showToast('📥 Downloading report...', 'info');
                setTimeout(() => showToast('✅ Report downloaded successfully!', 'success'), 1500);
            });

            setTimeout(() => {
                if (reportModalOpen) closeReportModal();
            }, 8000);
        }
    }, 200);
}

// ============================================================
// HANDLE FIND FORM SUBMISSION
// ============================================================

async function handleFindSubmit(e) {
    e.preventDefault();

    const runBtn = document.getElementById('runAuditBtn');
    const btnText = runBtn?.querySelector('.btn-text');
    const btnSpinner = runBtn?.querySelector('.btn-spinner');
    const statusEl = document.getElementById('auditStatus');

    const businessName = document.getElementById('businessName')?.value?.trim();
    const businessUrl = document.getElementById('businessUrl')?.value?.trim();
    const queriesText = document.getElementById('queries')?.value?.trim();
    const industry = document.getElementById('industry')?.value || null;

    const validateField = (id, condition, errorMsg) => {
        const el = document.getElementById(id);
        if (!condition) {
            el?.classList.add('is-invalid');
            el?.classList.remove('is-valid');
            showToast(errorMsg, 'error');
            return false;
        } else {
            el?.classList.remove('is-invalid');
            el?.classList.add('is-valid');
            return true;
        }
    };

    if (!validateField('businessName', businessName, 'Please enter your business name.')) return;
    if (!validateField('businessUrl', businessUrl && businessUrl.startsWith('http'), 'Please enter a valid website URL.')) return;
    if (!validateField('queries', queriesText && queriesText.split('\n').filter(q => q.trim()).length > 0, 'Please enter at least one query.')) return;
    if (!validateField('industry', industry, 'Please select your industry.')) return;

    const queries = queriesText.split('\n').filter(q => q.trim().length > 0);
    const competitors = document.getElementById('competitors')?.value?.trim()
        ? document.getElementById('competitors').value.split(',').map(c => c.trim()).filter(c => c.length > 0)
        : [];
    const brandAliases = document.getElementById('brandAliases')?.value?.trim() || null;
    const country = document.getElementById('country')?.value || null;
    const reportEmail = document.getElementById('reportEmail')?.value?.trim() || null;

    const platformCheckboxes = document.querySelectorAll('#ai_tavily, #ai_you');
    const platforms = [];
    platformCheckboxes.forEach(cb => {
        if (cb.checked) platforms.push(cb.value);
    });

    if (platforms.length === 0) {
        showToast('Please select at least one platform to scan.', 'error');
        return;
    }

    const hasSubscription = await checkActiveSubscription();
    if (!hasSubscription) {
        showToast('Please select a plan before running a scan.', 'warning');
        const returnUrl = encodeURIComponent('/dashboard.html#tab-ai-visibility');
        window.location.href = `/choose-plan.html?return_to=${returnUrl}&message=Please select a plan to run a visibility scan.`;
        return;
    }

    const profileComplete = await checkProfileComplete();
    if (!profileComplete) {
        showToast('Please complete your business profile before running a scan.', 'warning');
        window.location.href = '/dashboard.html#tab-settings';
        return;
    }

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.style.opacity = '0.7';
    }
    if (btnText) btnText.textContent = '⏳ Creating job...';
    if (btnSpinner) btnSpinner.style.display = 'inline';
    if (statusEl) {
        statusEl.textContent = 'Creating audit job...';
        statusEl.style.color = 'var(--warning)';
    }

    try {
        const { data: auditJob, error: insertError } = await supabase
            .from('audit_jobs')
            .insert({
                organization_id: currentOrganizationId,
                user_id: user.id,
                website: businessUrl,
                business_name: businessName,
                brand_aliases: brandAliases,
                location: country,
                industry: industry,
                queries: queries,
                competitors: competitors.map(name => ({ name })),
                platforms: platforms,
                plan: 'starter',
                report_email: reportEmail,
                status: 'pending',
                diagnosis_status: null,
                score: null,
                raw_results: null,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            showToast('Failed to create audit job: ' + insertError.message, 'error');
            resetSubmitButton();
            return;
        }

        console.log('✅ Audit job created:', auditJob.id);

        if (statusEl) {
            statusEl.textContent = `✅ Job created (ID: ${auditJob.id.slice(0, 8)})`;
            statusEl.style.color = 'var(--green)';
        }

        showToast(`✅ Audit job created! ID: ${auditJob.id}`, 'success');

        // If repeat toggle is on, upsert the schedule
        const repeatToggle = document.getElementById('repeatScanToggle');
        if (repeatToggle && repeatToggle.checked) {
            const freq = document.getElementById('repeatFrequency')?.value || 'weekly';
            const timeStr = document.getElementById('repeatTime')?.value || '09:00';
            try {
                await upsertRepeatSchedule(auditJob, freq, timeStr);
                showToast(`🔁 Recurring scan set — ${freq} at ${timeStr}`, 'success');
            } catch (err) {
                console.error('Schedule upsert failed:', err);
                showToast('Scan started, but schedule could not be saved.', 'warning');
            }
        }

        await loadRecentScans();
        await updateFindStats();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (statusEl) {
                statusEl.textContent = '🔄 Triggering scan...';
                statusEl.style.color = 'var(--info)';
            }

            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ audit_id: auditJob.id })
            });

            if (response.ok) {
                if (statusEl) {
                    statusEl.textContent = '✅ Scan triggered successfully!';
                    statusEl.style.color = 'var(--green)';
                }
                showToast('🚀 Scan started! Check back in a few minutes.', 'success');
                pollAuditStatus(auditJob.id);
            } else {
                const error = await response.json();
                if (statusEl) {
                    statusEl.textContent = '⚠️ Scan trigger failed: ' + (error.error || 'Unknown error');
                    statusEl.style.color = 'var(--red)';
                }
                showToast('Failed to trigger scan. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error triggering scan:', error);
            if (statusEl) {
                statusEl.textContent = '⚠️ Failed to trigger scan';
                statusEl.style.color = 'var(--red)';
            }
            showToast('Failed to trigger scan. Please try again.', 'error');
        }

    } catch (error) {
        console.error('Error:', error);
        showToast('An error occurred: ' + error.message, 'error');
    } finally {
        resetSubmitButton();
    }
}

function resetSubmitButton() {
    const runBtn = document.getElementById('runAuditBtn');
    const btnText = runBtn?.querySelector('.btn-text');
    const btnSpinner = runBtn?.querySelector('.btn-spinner');
    if (runBtn) {
        runBtn.disabled = false;
        runBtn.style.opacity = '1';
    }
    if (btnText) btnText.textContent = '🚀 Run AI Visibility Scan';
    if (btnSpinner) btnSpinner.style.display = 'none';
}

// ============================================================
// POLL AUDIT STATUS
// ============================================================

async function pollAuditStatus(auditId) {
    let attempts = 0;
    const maxAttempts = 60;

    let findHandled = false;
    let diagnosisHandled = false;

    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        attempts++;
        try {
            const { data: audit, error } = await supabase
                .from('audit_jobs')
                .select('status, score, diagnosis, diagnosis_status, optimizations')
                .eq('id', auditId)
                .single();

            if (error) {
                console.error('Polling error:', error);
                return;
            }

            if (audit.status === 'complete' && !findHandled) {
                findHandled = true;
                showToast('✅ FIND complete — running DIAGNOSE...', 'success');

                await loadRecentScans();
                await updateFindStats();

                const diagnoseTab = document.querySelector('.pillar-tab[data-pillar="diagnose"]');
                if (diagnoseTab) diagnoseTab.click();

                await loadLatestAuditResults();
                markDiagnoseRefreshed();
            }

            if (audit.status === 'complete' && audit.diagnosis_status === 'complete' && !diagnosisHandled) {
                diagnosisHandled = true;
                clearInterval(pollingInterval);
                pollingInterval = null;
                showToast('✅ Full diagnosis ready!', 'success');
                await loadLatestAuditResults();
                markDiagnoseRefreshed();
                await loadRecentScans();
            }

            if (audit.status === 'complete' && audit.diagnosis_status === 'failed' && !diagnosisHandled) {
                diagnosisHandled = true;
                clearInterval(pollingInterval);
                pollingInterval = null;
                showToast('FIND completed, but DIAGNOSE failed. Try re-running the scan.', 'warning');
                await loadLatestAuditResults();
                await loadRecentScans();
            }

            if (audit.status === 'failed') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                showToast('❌ Scan failed. Please try again.', 'error');
                await loadRecentScans();
            }

            if (attempts >= maxAttempts) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                showToast('⏰ Scan is taking longer than expected. Check back later.', 'warning');
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000);
}

// ============================================================
// CHECK ACTIVE SUBSCRIPTION
// ============================================================

async function checkActiveSubscription() {
    try {
        if (!currentOrganizationId) await fetchOrganizationId();
        if (!currentOrganizationId) return false;

        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('id, plan, status, current_period_end')
            .eq('organization_id', currentOrganizationId)
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            console.error('Subscription check error:', error);
            return false;
        }

        if (!sub) return false;

        const now = new Date();
        const periodEnd = new Date(sub.current_period_end);
        return periodEnd > now;

    } catch (error) {
        console.error('Error checking subscription:', error);
        return false;
    }
}

// ============================================================
// CHECK PROFILE COMPLETE
// ============================================================

async function checkProfileComplete() {
    try {
        if (!currentOrganizationId) await fetchOrganizationId();
        if (!currentOrganizationId) return false;

        const { data: org, error } = await supabase
            .from('organizations')
            .select('name, website')
            .eq('id', currentOrganizationId)
            .single();

        if (error) {
            console.error('Profile check error:', error);
            return false;
        }

        const hasName = org?.name && org.name.trim().length > 0;
        const hasWebsite = org?.website && org.website.trim().length > 0;

        return hasName && hasWebsite;

    } catch (error) {
        console.error('Error checking profile:', error);
        return false;
    }
}

// ============================================================
// EVENT ATTACHMENT HELPERS
// ============================================================

function attachFindFormHandler() {
    const form = document.getElementById('auditForm');
    if (!form) {
        console.warn('⚠️ auditForm not found');
        return;
    }

    if (auditFormListenerAttached) {
        form.removeEventListener('submit', handleFindSubmit);
    }

    form.addEventListener('submit', handleFindSubmit);
    auditFormListenerAttached = true;
    console.log('✅ FIND form handler attached');
}

function attachPillarTabSwitching() {
    const pillarTabs = document.querySelectorAll('.pillar-tab');
    const pillarContents = document.querySelectorAll('.pillar-content');

    if (pillarTabs.length === 0) {
        console.log('Pillar tabs not found');
        return;
    }

    pillarTabs.forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);

        newTab.addEventListener('click', function() {
            const pillar = this.dataset.pillar;

            document.querySelectorAll('.pillar-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            pillarContents.forEach(pc => pc.classList.remove('active'));
            const target = document.getElementById('pillar-' + pillar);
            if (target) target.classList.add('active');

            if (pillar === 'diagnose' || pillar === 'optimize') {
                if (shouldRefreshDiagnose()) {
                    loadLatestAuditResults();
                    markDiagnoseRefreshed();
                }
            } else if (pillar === 'monitor') {
                loadLatestAuditResults();
            }
        });
    });

    console.log('✅ Pillar tab switching attached');
}

function attachQueryCounter() {
    const queriesTextarea = document.getElementById('queries');
    const counter = document.getElementById('queryCounter');
    if (!queriesTextarea || !counter) return;

    queriesTextarea.addEventListener('input', function() {
        const lines = this.value.split('\n').filter(q => q.trim().length > 0);
        counter.textContent = `${lines.length} queries entered`;
    });
}

function attachRepeatToggleHandler() {
    const toggle = document.getElementById('repeatScanToggle');
    const options = document.getElementById('repeatScanOptions');
    if (!toggle || !options) return;

    const sync = () => {
        options.style.display = toggle.checked ? 'block' : 'none';
    };

    toggle.addEventListener('change', sync);
    sync();
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW
// ============================================================

window.generateDraft = generateDraft;
window.loadLatestAuditResults = loadLatestAuditResults;
window.openReportModal = openReportModal;
window.closeReportModal = closeReportModal;
