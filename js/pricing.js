// ============================================================
// PRICING PAGE - Database Driven
// Fetches pricing plans from pricing_plans table
// Plan Keys: free, starter, pro_agency, enterprise
// ============================================================

let supabase = null;
let isInitialized = false;

async function loadPricingPlans() {
    if (isInitialized) return;
    isInitialized = true;

    try {
        const { supabase: supabaseClient } = await import('./supabase-client.js');
        supabase = supabaseClient;
        console.log('✅ Supabase client loaded for pricing');

        const container = document.getElementById('pricingGrid');
        if (!container) {
            console.error('❌ #pricingGrid container not found');
            return;
        }

        const { data: plans, error } = await supabase
            .from('pricing_plans')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching plans:', error);
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px;">
                    <h3 style="color:#ef4444;">Unable to load pricing</h3>
                    <p style="color:#6b7280;">Please refresh the page.</p>
                </div>
            `;
            return;
        }

        if (!plans || plans.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px;">
                    <h3 style="color:#6b7280;">No plans available</h3>
                    <p style="color:#6b7280;">Please check back later.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = plans.map(plan => {
            const isFree = plan.price_monthly_usd === 0;
            const priceDisplay = isFree
                ? 'Free'
                : `$${(plan.price_monthly_usd / 100).toFixed(0)}`;

            const isPopular = plan.plan_key === 'starter';

            let featureList = plan.features || [];
            if (!featureList || featureList.length === 0) {
                featureList = [
                    `${plan.max_scans_per_period} scans per ${plan.scan_reset_frequency}`,
                    `${plan.max_queries_per_audit} queries per scan`,
                    plan.max_competitors_per_audit >= 999
                        ? 'Unlimited competitors'
                        : `${plan.max_competitors_per_audit} competitor${plan.max_competitors_per_audit > 1 ? 's' : ''}`,
                    `${plan.platforms_allowed?.length || 0} AI platforms`,
                    plan.has_auto_scan ? 'Automatic scans' : 'Manual scans only',
                    plan.has_diagnosis ? 'Full diagnosis' : 'Basic diagnosis',
                    plan.has_optimization ? 'Optimization plan' : 'Tracking only',
                    `${plan.monitor_history_months} month${plan.monitor_history_months > 1 ? 's' : ''} history`,
                    plan.priority_support ? 'Priority support' : 'Community support'
                ];
            }

            let ctaText = 'Get Started';
            let ctaLink = `payment.html?plan=${plan.plan_key}`;

            if (plan.plan_key === 'free') {
                ctaText = 'Start Free';
                ctaLink = 'get-started.html';
            } else if (plan.plan_key === 'enterprise') {
                ctaText = 'Contact Sales';
                ctaLink = 'contact.html';
            }

            const btnClass = isPopular ? 'btn-primary' : 'btn-secondary';

            return `
                <div class="pricing-card ${isPopular ? 'popular' : ''}">
                    ${isPopular ? '<div class="popular-badge">⭐ Most Popular</div>' : ''}
                    ${plan.badge ? `<div class="plan-badge">${escapeHtml(plan.badge)}</div>` : ''}
                    <div class="pricing-header">
                        <h3>${escapeHtml(plan.name)}</h3>
                        <div class="pricing-price">
                            <span class="currency">${priceDisplay}</span>
                            ${plan.price_monthly_usd > 0 ? '<span class="period">/ month</span>' : ''}
                        </div>
                        ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ''}
                    </div>
                    <ul class="pricing-features">
                        ${featureList.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
                    </ul>
                    <a href="${ctaLink}" class="btn-pricing ${btnClass}">
                        ${ctaText}
                    </a>
                </div>
            `;
        }).join('');

        console.log('✅ Pricing plans rendered:', plans.length);

    } catch (error) {
        console.error('❌ Error loading pricing:', error);
        const container = document.getElementById('pricingGrid');
        if (container) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px;">
                    <h3 style="color:#ef4444;">Error loading pricing</h3>
                    <p style="color:#6b7280;">Please refresh the page.</p>
                </div>
            `;
        }
    }
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPricingPlans);
} else {
    loadPricingPlans();
}
