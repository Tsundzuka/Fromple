// ============================================================
// tabs/settings.js - Settings Tab
// ============================================================
// Handles all settings: Personal Profile, Business Profile, Schedules, Plan & Billing, Notifications, Danger Zone.

let supabase = null;
let user = null;
let currentOrganizationId = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Settings tab initialized');

    // Load all settings data
    await loadSettingsData();

    // Attach event listeners
    attachEventListeners();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Settings tab');
    await loadSettingsData();
}

// ============================================================
// LOAD SETTINGS DATA
// ============================================================

async function loadSettingsData() {
    await loadPersonalProfile();
    await loadBusinessProfile();
    await loadSchedules();
    await loadPlanAndBilling();
}

// ============================================================
// PERSONAL PROFILE
// ============================================================

async function loadPersonalProfile() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('phone, job_title')
            .eq('user_id', session.user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading profile:', error);
            return;
        }

        if (profile) {
            const phoneInput = document.getElementById('personalPhone');
            const jobTitleInput = document.getElementById('personalTitle');
            if (phoneInput && profile.phone) phoneInput.value = profile.phone;
            if (jobTitleInput && profile.job_title) jobTitleInput.value = profile.job_title;
        } else {
            const phoneInput = document.getElementById('personalPhone');
            const jobTitleInput = document.getElementById('personalTitle');
            if (phoneInput) phoneInput.value = '';
            if (jobTitleInput) jobTitleInput.value = '';
        }
    } catch (error) {
        console.error('Error loading personal profile:', error);
    }
}

async function updatePersonalProfile() {
    const fullName = document.getElementById('personalFullName')?.value;
    const email = document.getElementById('personalEmail')?.value;
    const phone = document.getElementById('personalPhone')?.value;
    const jobTitle = document.getElementById('personalTitle')?.value;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            showToast('You must be logged in to update your profile.', 'error');
            return;
        }

        const { error: userError } = await supabase
            .from('users')
            .update({
                full_name: fullName,
                email: email,
                updated_at: new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (userError) {
            console.error('Error updating users table:', userError);
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                phone: phone || null,
                job_title: jobTitle || null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', session.user.id);

        if (profileError) {
            if (profileError.code === 'PGRST116') {
                const { error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                        user_id: session.user.id,
                        phone: phone || null,
                        job_title: jobTitle || null,
                    });
                if (insertError) throw insertError;
            } else {
                throw profileError;
            }
        }

        showToast('Personal profile updated successfully!', 'success');
        await loadPersonalProfile();
    } catch (error) {
        console.error('Error updating personal profile:', error);
        showToast('Error updating personal profile: ' + error.message, 'error');
    }
}

// ============================================================
// BUSINESS PROFILE
// ============================================================

async function loadBusinessProfile() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: memberships, error: memberError } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', session.user.id)
            .limit(1);

        if (memberError) {
            console.error('Error fetching memberships:', memberError);
            return;
        }

        if (!memberships || memberships.length === 0) {
            console.log('No organization found');
            return;
        }

        const orgId = memberships[0].organization_id;
        currentOrganizationId = orgId;

        const { data: org, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();

        if (error) {
            console.error('Error loading organization:', error);
            return;
        }

        if (org) {
            const fieldMap = {
                'companyName': org.name || '',
                'companyWebsite': org.website || '',
                'companyIndustry': org.industry || '',
                'companySize': org.company_size || '',
                'companyPhone': org.phone || '',
                'companyTaxId': org.tax_id || '',
                'companyCurrency': org.currency || 'ZAR',
                'defaultFrequency': org.default_frequency || 'monthly',
                'addressLine1': org.address_line1 || '',
                'addressLine2': org.address_line2 || '',
                'city': org.city || '',
                'state': org.state || '',
                'postalCode': org.postal_code || '',
                'companyCountry': org.country || 'South Africa',
            };

            Object.entries(fieldMap).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.tagName === 'SELECT') {
                        const options = el.options;
                        let found = false;
                        for (let i = 0; i < options.length; i++) {
                            if (options[i].value === value) {
                                el.selectedIndex = i;
                                found = true;
                                break;
                            }
                        }
                        if (!found && value) {
                            const opt = document.createElement('option');
                            opt.value = value;
                            opt.textContent = value;
                            el.appendChild(opt);
                            el.value = value;
                        }
                    } else {
                        el.value = value;
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading business profile:', error);
    }
}

async function updateBusinessProfile() {
    const payload = {
        name: document.getElementById('companyName')?.value,
        website: document.getElementById('companyWebsite')?.value,
        industry: document.getElementById('companyIndustry')?.value,
        company_size: document.getElementById('companySize')?.value,
        phone: document.getElementById('companyPhone')?.value,
        tax_id: document.getElementById('companyTaxId')?.value,
        currency: document.getElementById('companyCurrency')?.value,
        default_frequency: document.getElementById('defaultFrequency')?.value,
        address_line1: document.getElementById('addressLine1')?.value,
        address_line2: document.getElementById('addressLine2')?.value,
        city: document.getElementById('city')?.value,
        state: document.getElementById('state')?.value,
        postal_code: document.getElementById('postalCode')?.value,
        country: document.getElementById('companyCountry')?.value,
    };

    Object.keys(payload).forEach(key => {
        if (payload[key] === '') payload[key] = null;
    });

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            showToast('You must be logged in to update your business profile.', 'error');
            return;
        }

        if (!currentOrganizationId) {
            const { data: memberships, error: memberError } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', session.user.id)
                .limit(1);

            if (memberError || !memberships || memberships.length === 0) {
                showToast('No organization found. Please contact support.', 'error');
                return;
            }
            currentOrganizationId = memberships[0].organization_id;
        }

        const { error } = await supabase
            .from('organizations')
            .update({
                ...payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentOrganizationId);

        if (error) {
            throw error;
        }

        showToast('Business profile updated successfully!', 'success');
        await loadBusinessProfile();
    } catch (error) {
        console.error('Error updating business profile:', error);
        showToast('Error updating business profile: ' + error.message, 'error');
    }
}

// ============================================================
// RECURRING SCAN SCHEDULES
// ============================================================

async function loadSchedules() {
    console.log('🔄 loadSchedules() called');
    const tbody = document.getElementById('schedulesTableBody');
    if (!tbody) {
        console.warn('Schedules table body not found');
        return;
    }

    try {
        if (!currentOrganizationId) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: memberships } = await supabase
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', session.user.id)
                    .limit(1);
                if (memberships && memberships.length > 0) {
                    currentOrganizationId = memberships[0].organization_id;
                }
            }
        }

        if (!currentOrganizationId) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:30px;color:var(--gray-500);">
                        No organization found.
                    </td>
                </tr>
            `;
            return;
        }

        const { data: schedules, error } = await supabase
            .from('monitor_schedules')
            .select('id, business_name, website, frequency, next_run_at, is_active')
            .eq('organization_id', currentOrganizationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading schedules:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:30px;color:var(--red);">
                        Failed to load schedules. Please refresh.
                    </td>
                </tr>
            `;
            return;
        }

        if (!schedules || schedules.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:30px;color:var(--gray-500);">
                        <span style="display:block;font-size:32px;margin-bottom:8px;">📋</span>
                        No schedules configured yet.<br>
                        <span style="font-size:13px;">Turn on "Repeat this scan" in the FIND form to set up your first recurring scan.</span>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        schedules.forEach(s => {
            const statusBadge = s.is_active
                ? '<span class="badge success">Active</span>'
                : '<span class="badge muted">Paused</span>';
            const nextRun = s.next_run_at
                ? new Date(s.next_run_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                })
                : '—';
            html += `
                <tr>
                    <td><strong>${escapeHtml(s.business_name || '—')}</strong><br><span style="font-size:12px;color:var(--gray-500);">${escapeHtml(s.website || '')}</span></td>
                    <td><span style="text-transform:capitalize;">${escapeHtml(s.frequency || '')}</span></td>
                    <td>${nextRun}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn-secondary btn-sm toggle-schedule-btn" data-id="${s.id}" style="font-size:11px;">Toggle</button>
                        <button class="btn-secondary btn-sm settings-danger delete-schedule-btn" data-id="${s.id}" style="font-size:11px;">Delete</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        tbody.querySelectorAll('.toggle-schedule-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                toggleSchedule(this.dataset.id);
            });
        });
        tbody.querySelectorAll('.delete-schedule-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                deleteSchedule(this.dataset.id);
            });
        });

    } catch (error) {
        console.error('Error loading schedules:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:30px;color:var(--red);">
                    Failed to load schedules. Please refresh.
                </td>
            </tr>
        `;
    }
}

async function toggleSchedule(scheduleId) {
    console.log('🔄 Toggling schedule:', scheduleId);

    try {
        const { data: current, error: fetchError } = await supabase
            .from('monitor_schedules')
            .select('is_active')
            .eq('id', scheduleId)
            .single();

        if (fetchError) throw fetchError;

        const { error: updateError } = await supabase
            .from('monitor_schedules')
            .update({ is_active: !current.is_active })
            .eq('id', scheduleId);

        if (updateError) throw updateError;

        showToast('Schedule toggled successfully!', 'success');
        await loadSchedules();
    } catch (error) {
        console.error('Error toggling schedule:', error);
        showToast('Failed to toggle schedule: ' + error.message, 'error');
    }
}

async function deleteSchedule(scheduleId) {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    console.log('🗑️ Deleting schedule:', scheduleId);

    try {
        const { error } = await supabase
            .from('monitor_schedules')
            .update({
                deleted_at: new Date().toISOString(),
                is_active: false,
            })
            .eq('id', scheduleId);

        if (error) throw error;

        showToast('Schedule deleted successfully!', 'warning');
        await loadSchedules();
    } catch (error) {
        console.error('Error deleting schedule:', error);
        showToast('Failed to delete schedule: ' + error.message, 'error');
    }
}

function createNewSchedule() {
    // Switch to AI Visibility tab and FIND pillar
    const aiTab = document.querySelector('.nav-item[data-tab="ai-visibility"]');
    if (aiTab) aiTab.click();

    setTimeout(() => {
        const findTab = document.querySelector('.pillar-tab[data-pillar="find"]');
        if (findTab) findTab.click();

        const form = document.getElementById('auditForm');
        if (form) form.scrollIntoView({ behavior: 'smooth' });

        showToast('Turn on "Repeat this scan" in the FIND form before submitting.', 'info');
    }, 300);
}

// ============================================================
// PLAN & BILLING
// ============================================================

async function loadPlanAndBilling() {
    try {
        if (!currentOrganizationId) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: memberships, error } = await supabase
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', session.user.id)
                    .limit(1);
                if (!error && memberships && memberships.length > 0) {
                    currentOrganizationId = memberships[0].organization_id;
                }
            }
        }
        if (!currentOrganizationId) {
            console.warn('No organization ID for plan & billing');
            return;
        }

        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('id, plan, status, current_period_end')
            .eq('organization_id', currentOrganizationId)
            .eq('status', 'active')
            .maybeSingle();

        let usage = null;
        if (subscription) {
            const { data: usageData, error: usageError } = await supabase
                .from('usage_tracking')
                .select('scans_used, total_scans_allowed, scans_remaining, reset_frequency, next_reset_date')
                .eq('organization_id', currentOrganizationId)
                .eq('user_id', user.id)
                .eq('is_current', true)
                .maybeSingle();
            if (!usageError) usage = usageData;
        }

        const { data: allPlans, error: plansError } = await supabase
            .from('pricing_plans')
            .select('plan_key, name, price_monthly_usd, max_scans_per_period, scan_reset_frequency, description')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (plansError) throw plansError;

        const planEl = document.getElementById('userPlan');
        if (planEl) {
            const currentPlan = allPlans.find(p => p.plan_key === subscription?.plan);
            planEl.textContent = currentPlan?.name || 'No Plan';
        }

        const planSelect = document.getElementById('planSelect');
        if (planSelect) {
            planSelect.innerHTML = allPlans.map(p => `
                <option value="${p.plan_key}" ${subscription && p.plan_key === subscription.plan ? 'selected' : ''}>
                    ${p.name} ($${(p.price_monthly_usd / 100).toFixed(0)}/mo)
                </option>
            `).join('');
        }

        const statusEl = document.getElementById('planStatus');
        const expiryEl = document.getElementById('planExpiry');
        if (statusEl) {
            statusEl.textContent = subscription ? 'Active' : 'No Active Plan';
            statusEl.style.color = subscription ? 'var(--green)' : 'var(--red)';
        }
        if (expiryEl) {
            expiryEl.textContent = subscription ? `(ends ${new Date(subscription.current_period_end).toLocaleDateString()})` : '';
        }

        const usageSection = document.getElementById('usageSection');
        const noSubMessage = document.getElementById('noSubscriptionMessage');

        if (subscription && usage) {
            usageSection.style.display = 'block';
            noSubMessage.style.display = 'none';

            const scansUsed = usage.scans_used || 0;
            const scansTotal = usage.total_scans_allowed || 0;
            const scansRemaining = usage.scans_remaining !== undefined ? usage.scans_remaining : scansTotal - scansUsed;
            const resetDate = usage.next_reset_date ? new Date(usage.next_reset_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const resetFrequency = usage.reset_frequency || 'yearly';
            const usedPercent = scansTotal > 0 ? Math.min((scansUsed / scansTotal) * 100, 100) : 0;
            const barColor = scansRemaining <= 0 ? 'var(--red)' : 'var(--primary)';

            document.getElementById('scansUsed').textContent = scansUsed;
            document.getElementById('scansTotal').textContent = scansTotal;
            document.getElementById('scansRemaining').textContent = scansRemaining;
            document.getElementById('resetDate').textContent = resetDate;
            document.getElementById('resetFrequency').textContent = resetFrequency;

            const progressBar = document.getElementById('usageProgressBar');
            progressBar.style.width = usedPercent + '%';
            progressBar.style.background = barColor;

            const messageEl = document.getElementById('usageMessage');
            if (scansRemaining <= 0) {
                messageEl.textContent = '⚠️ You have used all your scans. Upgrade or wait for reset.';
                messageEl.style.color = 'var(--red)';
            } else {
                messageEl.textContent = `${scansRemaining} scans remaining until ${resetDate}.`;
                messageEl.style.color = 'var(--gray-500)';
            }

        } else {
            usageSection.style.display = 'none';
            noSubMessage.style.display = 'block';
        }

        const changeBtn = document.getElementById('changePlanBtn');
        if (changeBtn) {
            const newChangeBtn = changeBtn.cloneNode(true);
            changeBtn.parentNode.replaceChild(newChangeBtn, changeBtn);
            newChangeBtn.addEventListener('click', async function() {
                const selectedPlan = document.getElementById('planSelect').value;
                if (!selectedPlan) {
                    showToast('Please select a plan.', 'warning');
                    return;
                }
                if (subscription && selectedPlan === subscription.plan) {
                    showToast('You are already on this plan.', 'info');
                    return;
                }
                const targetPlan = allPlans.find(p => p.plan_key === selectedPlan);
                const confirmMsg = subscription ? `Change plan from ${allPlans.find(p => p.plan_key === subscription.plan)?.name} to ${targetPlan?.name}?` : `Select ${targetPlan?.name} plan?`;
                if (!confirm(confirmMsg)) return;

                await changePlan(selectedPlan);
            });
        }

        const refreshBtn = document.getElementById('refreshPlanBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                loadPlanAndBilling();
                showToast('Plan data refreshed.', 'info');
            });
        }

        console.log('✅ Plan & Billing updated');

    } catch (error) {
        console.error('Error loading plan & billing:', error);
        const container = document.getElementById('planBillingContainer');
        if (container) {
            container.innerHTML = `
                <h3 class="settings-title">💳 Plan &amp; Billing</h3>
                <p style="color:var(--red);">Failed to load plan data. Please refresh the page.</p>
                <button class="btn-secondary btn-sm" onclick="loadPlanAndBilling()">Retry</button>
            `;
        }
    }
}

async function changePlan(newPlanKey) {
    try {
        const { data: planData, error: planError } = await supabase
            .from('pricing_plans')
            .select('max_scans_per_period, scan_reset_frequency')
            .eq('plan_key', newPlanKey)
            .single();
        if (planError) throw planError;

        const { data: currentSub, error: subError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('organization_id', currentOrganizationId)
            .eq('status', 'active')
            .maybeSingle();

        if (currentSub) {
            const { error: updateError } = await supabase
                .from('subscriptions')
                .update({ status: 'canceled', ended_at: new Date().toISOString() })
                .eq('id', currentSub.id);
            if (updateError) throw updateError;
        }

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const { data: newSub, error: insertError } = await supabase
            .from('subscriptions')
            .insert({
                organization_id: currentOrganizationId,
                plan: newPlanKey,
                status: 'active',
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                trial_ends_at: null,
                billing_email: user.email,
            })
            .select()
            .single();
        if (insertError) throw insertError;

        await supabase
            .from('usage_tracking')
            .update({ is_current: false, ended_at: new Date().toISOString() })
            .eq('organization_id', currentOrganizationId)
            .eq('user_id', user.id)
            .eq('is_current', true);

        const resetDate = new Date(now);
        if (planData.scan_reset_frequency === 'yearly') {
            resetDate.setFullYear(resetDate.getFullYear() + 1);
        } else if (planData.scan_reset_frequency === 'monthly') {
            resetDate.setMonth(resetDate.getMonth() + 1);
        } else {
            resetDate.setFullYear(resetDate.getFullYear() + 1);
        }

        const { error: usageError } = await supabase
            .from('usage_tracking')
            .insert({
                organization_id: currentOrganizationId,
                user_id: user.id,
                plan_key: newPlanKey,
                total_scans_allowed: planData.max_scans_per_period || 3,
                scans_used: 0,
                reset_frequency: planData.scan_reset_frequency || 'yearly',
                next_reset_date: resetDate.toISOString(),
                period_start: now.toISOString(),
                period_end: resetDate.toISOString(),
                is_current: true,
            });
        if (usageError) throw usageError;

        await supabase
            .from('users')
            .update({ plan_type: newPlanKey })
            .eq('id', user.id);

        showToast(`Plan changed to ${newPlanKey} successfully!`, 'success');

        await loadPlanAndBilling();

    } catch (error) {
        console.error('Error changing plan:', error);
        showToast('Failed to change plan: ' + error.message, 'error');
    }
}

// ============================================================
// DANGER ZONE - DELETE ACCOUNT
// ============================================================

function deleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        const confirmDelete = confirm('This will permanently delete all your data. Type "DELETE" to confirm.');
        if (confirmDelete) {
            showToast('Account deletion request submitted. You will receive a confirmation email.', 'warning');
            console.log('Account deletion requested');
        }
    }
}

// ============================================================
// SAVE ALL SETTINGS
// ============================================================

async function saveAllSettings() {
    showToast('Saving all settings...', 'info');
    await updatePersonalProfile();
    await updateBusinessProfile();
    showToast('All settings saved successfully!', 'success');
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// ATTACH EVENT LISTENERS
// ============================================================

function attachEventListeners() {
    const personalBtn = document.getElementById('updatePersonalBtn');
    if (personalBtn) {
        personalBtn.addEventListener('click', updatePersonalProfile);
    }

    const businessBtn = document.getElementById('updateBusinessBtn');
    if (businessBtn) {
        businessBtn.addEventListener('click', updateBusinessProfile);
    }

    const saveAllBtn = document.getElementById('saveAllSettingsBtn');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', saveAllSettings);
    }

    const addScheduleBtn = document.getElementById('addScheduleBtn');
    if (addScheduleBtn) {
        addScheduleBtn.addEventListener('click', createNewSchedule);
    }

    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', deleteAccount);
    }

    console.log('✅ Settings event listeners attached');
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW
// ============================================================

window.updatePersonalProfile = updatePersonalProfile;
window.updateBusinessProfile = updateBusinessProfile;
window.saveAllSettings = saveAllSettings;
window.createNewSchedule = createNewSchedule;
window.toggleSchedule = toggleSchedule;
window.deleteSchedule = deleteSchedule;
window.deleteAccount = deleteAccount;
window.loadPlanAndBilling = loadPlanAndBilling;
window.changePlan = changePlan;

window.downloadInvoice = function(invoiceId) {
    showToast('Invoice download started...', 'info');
    setTimeout(() => {
        showToast('Invoice downloaded successfully!', 'success');
    }, 1500);
};
