// ============================================================
// SERVICE DETAIL - Supabase Database Driven (v10)
// - Service content from service_pillars
// - Pricing packages from pricing_plans (single source of truth)
// Plan Keys: starter, growth, pro_agency, enterprise
// ============================================================

let supabase = null;
let currentModuleId = null;
let isInitialized = false;
let moduleData = null;

// ============================================================
// MAIN FUNCTION - Called once when DOM is ready
// ============================================================

async function loadServiceDetail() {
    // Prevent double initialization
    if (isInitialized) {
        console.log('⏭️ Service detail already initialized, skipping...');
        return;
    }
    isInitialized = true;
    
    console.log('🔵 loadServiceDetail() called - DATABASE DRIVEN v10');
    
    try {
        // Load Supabase client
        const { supabase: supabaseClient } = await import('./supabase-client.js');
        supabase = supabaseClient;
        console.log('✅ Supabase client loaded');
        
        // Get module ID from URL
        const params = new URLSearchParams(window.location.search);
        let moduleId = params.get('module') || 'find-pillar';
        
        // Alias mapping for backward compatibility
        const aliasMap = {
            'geo-outbound': 'find-pillar',
            'algorithm-protection': 'optimize-pillar',
            'enterprise-ops': 'monitor-pillar',
            'bundle': 'find-pillar'
        };
        
        if (aliasMap[moduleId]) {
            console.log(`🔄 Alias mapping: ${moduleId} → ${aliasMap[moduleId]}`);
            moduleId = aliasMap[moduleId];
        }
        
        currentModuleId = moduleId;
        console.log('🔍 Module ID from URL:', moduleId);
        
        // Query Supabase for the service data
        await fetchModuleFromDB(moduleId);
        
    } catch (error) {
        console.error('❌ Error in loadServiceDetail:', error);
        showToast('Failed to load service details. Please refresh the page.', 'error');
        showFallbackContent();
    }
}

// ============================================================
// FETCH MODULE FROM SUPABASE
// ============================================================

async function fetchModuleFromDB(moduleId) {
    console.log('🔵 fetchModuleFromDB() called for:', moduleId);
    
    try {
        // Query Supabase - using the service_pillars table
        const { data: module, error } = await supabase
            .from('service_pillars')
            .select('*')
            .eq('id', moduleId)
            .single();
        
        if (error) {
            console.warn('⚠️ Supabase error (no data):', error.message);
            console.log('ℹ️ Displaying fallback content');
            showFallbackContent();
            return;
        }
        
        if (!module) {
            console.warn('⚠️ Module not found:', moduleId);
            console.log('ℹ️ Displaying fallback content');
            showFallbackContent();
            return;
        }
        
        console.log('📦 Module data loaded from DB:', module.title);
        console.log('📦 Features count:', module.features ? module.features.length : 0);
        
        moduleData = module;
        
        // Now render the module (including packages fetched from pricing_plans)
        await renderModule(module);
        
    } catch (error) {
        console.warn('⚠️ Error loading module:', error);
        console.log('ℹ️ Displaying fallback content');
        showFallbackContent();
    }
}

// ============================================================
// SHOW FALLBACK CONTENT - Displayed when no data is available
// ============================================================

function showFallbackContent() {
    console.log('🔵 showFallbackContent() called - displaying fallback data');
    
    // Hide loading state
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
    
    // Set fallback data
    const fallbackData = {
        title: 'Service Not Available',
        tag: '—',
        icon: '📄',
        use_case: 'Service Unavailable',
        description: 'The service details could not be loaded. Please try again later.',
        overview: 'We are currently unable to load the service details. Please refresh the page or try again later.',
        feature_count: 0,
        features: [],
        value_badges: [
            { icon: '🔄', text: 'Try Again' }
        ],
        platforms: ['Please refresh'],
        steps: [
            { step: 1, title: 'Refresh the Page', description: 'Try refreshing your browser.' },
            { step: 2, title: 'Check Connection', description: 'Ensure you are connected to the internet.' },
            { step: 3, title: 'Contact Support', description: 'If the issue persists, contact support.' }
        ],
        free_tools: [
            { name: 'Refresh Page', description: 'Try refreshing to load the data.', link: '#' }
        ],
        guarantees: [
            { icon: '🔄', title: 'Data Loading', description: 'We are having trouble loading the data. Please refresh.' }
        ]
    };
    
    renderModule(fallbackData);
}

// ============================================================
// RENDER MODULE - Renders all data to the page
// ============================================================

async function renderModule(module) {
    console.log('🔵 renderModule() called for:', module.title);
    
    // Hide loading state
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
    
    // ============================================================
    // 1. HERO SECTION
    // ============================================================
    const titleEl = document.getElementById('moduleTitle');
    const countEl = document.getElementById('moduleCount');
    const tagEl = document.getElementById('moduleTag');
    const descEl = document.getElementById('moduleDescription');
    const pillarTag = document.getElementById('pillarTag');
    
    if (titleEl) titleEl.textContent = module.title || 'Service Not Available';
    if (countEl) countEl.textContent = (module.feature_count || 0) + ' features';
    if (tagEl) tagEl.textContent = (module.icon || '📄') + ' ' + (module.use_case || 'Service');
    if (descEl) descEl.textContent = module.description || 'Loading service details...';
    if (pillarTag) pillarTag.textContent = module.tag || '—';
    
    // Update Page Title
    document.title = 'Fromple - ' + (module.title || 'Service Detail');
    
    // ============================================================
    // 2. HERO STATS
    // ============================================================
    const statFeatures = document.getElementById('statFeatures');
    const statPlatforms = document.getElementById('statPlatforms');
    const statUseCase = document.getElementById('statUseCase');
    const platformPills = document.getElementById('platformPills');
    
    if (statFeatures) statFeatures.textContent = module.feature_count || 0;
    
    if (statPlatforms) {
        const platforms = typeof module.platforms === 'string' 
            ? JSON.parse(module.platforms) 
            : module.platforms;
        statPlatforms.textContent = platforms ? platforms.length : 0;
    }
    
    if (statUseCase) statUseCase.textContent = module.use_case || 'Various';
    
    // Update hero rating
    const heroRating = document.querySelector('.hero-stat:last-child .hero-stat-number');
    if (heroRating) {
        const ratings = {
            'find-pillar': '4.8',
            'diagnose-pillar': '4.7',
            'optimize-pillar': '4.9',
            'monitor-pillar': '4.8'
        };
        heroRating.textContent = '⭐ ' + (ratings[currentModuleId] || '4.9');
    }
    
    if (platformPills && module.platforms) {
        const platforms = typeof module.platforms === 'string' 
            ? JSON.parse(module.platforms) 
            : module.platforms;
        if (platforms && platforms.length > 0) {
            platformPills.innerHTML = platforms.map(p => `<span>${p}</span>`).join('');
        } else {
            platformPills.innerHTML = '<span>No platforms</span>';
        }
    }
    
    // ============================================================
    // 3. VALUE BADGES
    // ============================================================
    const badgesContainer = document.getElementById('valueBadges');
    if (badgesContainer) {
        const badges = typeof module.value_badges === 'string' 
            ? JSON.parse(module.value_badges) 
            : module.value_badges;
        if (badges && badges.length > 0) {
            badgesContainer.innerHTML = badges.map(badge => `
                <div class="badge-item">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-label">${badge.text}</span>
                </div>
            `).join('');
        } else {
            badgesContainer.innerHTML = `
                <div class="badge-item">
                    <span class="badge-icon">🔄</span>
                    <span class="badge-label">Loading...</span>
                </div>
            `;
        }
    }
    
    // ============================================================
    // 4. OVERVIEW TEXT
    // ============================================================
    const overviewText = document.getElementById('overviewText');
    if (overviewText) overviewText.textContent = module.overview || 'Loading service overview...';
    
    // ============================================================
    // 4.5 OVERVIEW CARDS & KEY POINTS
    // ============================================================
    const overviewCards = document.querySelectorAll('.overview-card');
    const keyPoints = document.querySelectorAll('.key-point');
    
    if (overviewCards.length > 0) {
        const features = typeof module.features === 'string' 
            ? JSON.parse(module.features) 
            : module.features;
        
        if (features && features.length > 0) {
            features.slice(0, 3).forEach((feature, index) => {
                if (overviewCards[index]) {
                    const icon = overviewCards[index].querySelector('.overview-card-icon');
                    const title = overviewCards[index].querySelector('h3');
                    const desc = overviewCards[index].querySelector('p');
                    
                    if (icon) icon.textContent = feature.icon || '📄';
                    if (title) title.textContent = feature.label || 'Feature';
                    if (desc) desc.textContent = feature.description || 'Loading...';
                }
            });
        }
    }
    
    if (keyPoints.length > 0) {
        const features = typeof module.features === 'string' 
            ? JSON.parse(module.features) 
            : module.features;
        
        if (features && features.length > 0) {
            features.slice(0, 3).forEach((feature, index) => {
                if (keyPoints[index]) {
                    const icon = keyPoints[index].querySelector('.key-icon');
                    const text = keyPoints[index].querySelector('span:last-child');
                    
                    if (icon) icon.textContent = feature.icon || '✅';
                    if (text) text.textContent = feature.label || 'Feature';
                }
            });
        }
    }
    
    // ============================================================
    // 5. FEATURES
    // ============================================================
    const grid = document.getElementById('featureGrid');
    if (grid) {
        const features = typeof module.features === 'string' 
            ? JSON.parse(module.features) 
            : module.features;
        if (features && features.length > 0) {
            grid.innerHTML = features.map(feature => `
                <div class="feature-card-modern" data-feature-id="${feature.id}">
                    <div class="feature-card-icon">${feature.icon || '📄'}</div>
                    <h4>${feature.label}</h4>
                    <p>${feature.description || 'Feature description not available.'}</p>
                </div>
            `).join('');
        } else {
            grid.innerHTML = `
                <div class="feature-card-modern" style="grid-column: 1/-1; text-align:center; padding:40px;">
                    <div style="font-size:40px;margin-bottom:12px;">📄</div>
                    <h4>No Features Available</h4>
                    <p>Please check back later for updated information.</p>
                </div>
            `;
        }
    }
    
    // ============================================================
    // 6. STEPS
    // ============================================================
    const stepsGrid = document.getElementById('stepsGrid');
    if (stepsGrid) {
        const steps = typeof module.steps === 'string' 
            ? JSON.parse(module.steps) 
            : module.steps;
        if (steps && steps.length > 0) {
            stepsGrid.innerHTML = steps.map((step) => {
                return `
                    <div class="step-item">
                        <div class="step-number">${step.step}</div>
                        <div class="step-content">
                            <h4>${step.title}</h4>
                            <p>${step.description}</p>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            stepsGrid.innerHTML = `
                <div class="step-item" style="grid-column: 1/-1; text-align:center; padding:20px;">
                    <p>No steps available.</p>
                </div>
            `;
        }
    }
    
    // ============================================================
    // 7. PACKAGES - FETCH FROM PRICING_PLANS TABLE
    // ============================================================
    const packagesGrid = document.getElementById('packagesGrid');
    if (packagesGrid) {
        try {
            // Fetch all active pricing plans from the pricing_plans table
            const { data: pricingPlans, error: pricingError } = await supabase
                .from('pricing_plans')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (pricingError) {
                console.error('Error fetching pricing plans:', pricingError);
                packagesGrid.innerHTML = `
                    <div class="package-card" style="grid-column: 1/-1; text-align:center; padding:40px;">
                        <h3>Unable to load pricing</h3>
                        <p>Please refresh the page or try again later.</p>
                    </div>
                `;
            } else if (!pricingPlans || pricingPlans.length === 0) {
                packagesGrid.innerHTML = `
                    <div class="package-card" style="grid-column: 1/-1; text-align:center; padding:40px;">
                        <h3>No Plans Available</h3>
                        <p>Please check back later for pricing information.</p>
                    </div>
                `;
            } else {
                // Map pricing_plans data to the expected package card format
                packagesGrid.innerHTML = pricingPlans.map(plan => {
                    // Format price display
                    const priceDisplay = plan.price_monthly_usd === 0 
                        ? 'Free' 
                        : `$${(plan.price_monthly_usd / 100).toFixed(0)}`;
                    
                    // Determine if this plan should show "Most Popular" badge
                    // We'll use the plan's own badge if present, else fallback
                    const isPopular = plan.plan_key === 'growth' || plan.badge === 'Most Popular';
                    
                    // Map plan features (from the features array or generate from attributes)
                    let featureList = plan.features || [];
                    
                    // If features array is empty, generate from attributes
                    if (!featureList || featureList.length === 0) {
                        featureList = [
                            `${plan.max_scans_per_period} scans per year (${plan.audit_frequency})`,
                            `${plan.max_queries_per_audit} queries per scan`,
                            plan.max_competitors_per_audit >= 999 
                                ? 'Unlimited competitors' 
                                : `${plan.max_competitors_per_audit} competitors per scan`,
                            `${plan.platforms_allowed?.length || 0} AI platforms`,
                            plan.has_auto_scan ? '✅ Automatic scans' : 'Manual scans only',
                            plan.has_diagnosis ? '✅ Diagnosis' : '❌ No diagnosis',
                            plan.has_optimization ? '✅ Optimization' : '❌ No optimization',
                            plan.has_full_drafts ? '✅ Full content drafts' : '❌ No drafts',
                            plan.monitor_history_months >= 999 
                                ? 'Unlimited history' 
                                : `${plan.monitor_history_months} months history`,
                            `${plan.team_seats} user${plan.team_seats > 1 ? 's' : ''}`,
                            plan.has_api_access ? '✅ API Access' : '❌ No API access',
                            plan.priority_support ? '✅ 24/7 Priority Support' : 'Standard support'
                        ];
                    }
                    
                    // Determine CTA text and link
                    let ctaText = 'Start Free Trial';
                    let ctaLink = `get-started.html?plan=${plan.plan_key}`;
                    
                    // Updated plan key references: 'starter' instead of 'free'
                    if (plan.plan_key === 'starter') {
                        ctaText = 'Get Started Free';
                        ctaLink = 'get-started.html';
                    } else if (plan.plan_key === 'enterprise') {
                        ctaText = 'Contact Sales';
                        ctaLink = 'contact.html';
                    }
                    
                    // Determine CSS class
                    const btnClass = isPopular ? 'btn-primary' : 'btn-secondary';
                    
                    return `
                        <div class="package-card ${isPopular ? 'popular' : ''}">
                            ${isPopular ? '<div class="popular-badge">⭐ Most Popular</div>' : ''}
                            ${plan.badge && plan.plan_key !== 'starter' && plan.badge !== 'Most Popular' ? `<div class="plan-badge">${plan.badge}</div>` : ''}
                            <div class="package-header">
                                <h3>${plan.name}</h3>
                                <div class="package-price">
                                    <span class="price">${priceDisplay}</span>
                                    ${plan.price_monthly_usd > 0 ? '<span class="period">/ month</span>' : ''}
                                </div>
                                ${plan.description ? `<p class="plan-description">${plan.description}</p>` : ''}
                            </div>
                            <ul class="package-features">
                                ${featureList.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                            <a href="${ctaLink}" class="btn-package ${btnClass}">
                                ${ctaText}
                            </a>
                        </div>
                    `;
                }).join('');
                console.log('✅ Packages rendered from pricing_plans:', pricingPlans.length);
            }
        } catch (error) {
            console.error('❌ Error loading pricing plans:', error);
            packagesGrid.innerHTML = `
                <div class="package-card" style="grid-column: 1/-1; text-align:center; padding:40px;">
                    <h3>Error Loading Pricing</h3>
                    <p>Please refresh the page or try again later.</p>
                </div>
            `;
        }
    }
    
    // ============================================================
    // 8. FREE TOOLS
    // ============================================================
    const freeToolsGrid = document.getElementById('freeToolsGrid');
    if (freeToolsGrid) {
        const freeTools = typeof module.free_tools === 'string' 
            ? JSON.parse(module.free_tools) 
            : module.free_tools;
        if (freeTools && freeTools.length > 0) {
            freeToolsGrid.innerHTML = freeTools.map(tool => `
                <div class="value-guarantee-card free-tool">
                    <div class="vg-header">
                        <span class="vg-icon">🔓</span>
                        <span class="vg-badge">Free</span>
                    </div>
                    <h3>${tool.name}</h3>
                    <p>${tool.description}</p>
                    <a href="${tool.link}" class="vg-link">Try Now →</a>
                </div>
            `).join('');
        } else {
            freeToolsGrid.innerHTML = `
                <div class="value-guarantee-card free-tool" style="grid-column: 1/-1;">
                    <div class="vg-header">
                        <span class="vg-icon">🔓</span>
                        <span class="vg-badge">Free</span>
                    </div>
                    <h3>No Free Tools Available</h3>
                    <p>Check back later for free tools.</p>
                </div>
            `;
        }
    }
    
    // ============================================================
    // 9. GUARANTEES
    // ============================================================
    const guaranteesGrid = document.getElementById('guaranteesGrid');
    if (guaranteesGrid) {
        const guarantees = typeof module.guarantees === 'string' 
            ? JSON.parse(module.guarantees) 
            : module.guarantees;
        if (guarantees && guarantees.length > 0) {
            guaranteesGrid.innerHTML = guarantees.map((guarantee, index) => {
                const isPremium = index === guarantees.length - 1;
                return `
                    <div class="value-guarantee-card guarantee ${isPremium ? 'premium-guarantee' : ''}">
                        <div class="vg-header">
                            <span class="vg-icon">${guarantee.icon}</span>
                            <span class="vg-badge ${isPremium ? 'premium-badge' : 'guarantee-badge'}">
                                ${isPremium ? '🏆 Premium' : 'Guaranteed'}
                            </span>
                        </div>
                        <h3>${guarantee.title}</h3>
                        <p>${guarantee.description}</p>
                        ${isPremium ? '<span class="guarantee-seal">✅ Cancel anytime · No questions asked</span>' : ''}
                    </div>
                `;
            }).join('');
        } else {
            guaranteesGrid.innerHTML = `
                <div class="value-guarantee-card guarantee" style="grid-column: 1/-1; text-align:center; padding:20px;">
                    <h3>No Guarantees Listed</h3>
                    <p>We stand behind our product. Contact us for more information.</p>
                </div>
            `;
        }
    }
    
    console.log('✅ Module fully rendered:', module.title);
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

// ============================================================
// INITIALIZE ON DOM READY
// ============================================================

console.log('🔵 service-detail.js loaded (Database Driven v10)');

// Only run once when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🔵 DOM ready - loading service detail');
        loadServiceDetail();
    });
} else {
    console.log('🔵 DOM already ready - loading service detail immediately');
    loadServiceDetail();
}
