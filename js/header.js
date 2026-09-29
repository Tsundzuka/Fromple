// ============================================================
// HEADER COMPONENT - WITH SUPABASE AUTH
// ============================================================

console.log('🔥 HEADER.JS LOADED');

// ============================================================
// Get current page
// ============================================================
const currentPage = window.location.pathname.split('/').pop() || 'index.html';

// Helper function
const isActive = (page) => currentPage === page ? 'active' : '';

// Helper to get asset path
function getAssetPath() {
    const path = window.location.pathname;
    if (path.includes('/admin/') || path.includes('/admin')) {
        return '../';
    }
    return '';
}

const assetPath = getAssetPath();

// ============================================================
// Get Auth State from Supabase
// ============================================================

let currentUser = null;
let isLoggedIn = false;

async function getAuthState() {
    try {
        // Dynamically import the supabase client
        const { supabase } = await import('./supabase-client.js');
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('❌ Error getting session:', error);
            return { user: null, isLoggedIn: false };
        }
        
        if (session && session.user) {
            return {
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                    avatar_url: session.user.user_metadata?.avatar_url || null,
                },
                isLoggedIn: true
            };
        }
        
        return { user: null, isLoggedIn: false };
    } catch (error) {
        console.error('❌ Auth check failed:', error);
        return { user: null, isLoggedIn: false };
    }
}

// ============================================================
// Generate Header HTML
// ============================================================

function generateHeaderHTML(user, isLoggedIn) {
    const initials = user?.full_name 
        ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';
    
    const displayName = user?.full_name || 'User';
    const displayEmail = user?.email || 'user@example.com';
    
    return `
<header class="site-header">
    <div class="nav-container">
        <!-- Brand / Logo -->
        <a href="${assetPath}index.html" class="brand-link">
            <span class="brand-logo-wrapper">
                <img src="${assetPath}assets/icons/logo.png" alt="Fromple" class="brand-logo" />
                <img src="${assetPath}assets/icons/brand.png" alt="Fromple" class="brand-text-image" />
            </span>
        </a>

        <!-- Desktop Navigation -->
        <ul class="desktop-nav">
            <li><a href="${assetPath}index.html" class="${isActive('index.html')}">Home</a></li>
            <li><a href="${assetPath}services.html" class="${isActive('services.html')}">Services</a></li>
            <li><a href="${assetPath}blog.html" class="${isActive('blog.html')}">Blog</a></li>
            <li><a href="${assetPath}get-started.html" class="nav-cta">Get Started</a></li>
            
            ${isLoggedIn ? `
                <!-- PROFILE DROPDOWN - Only shown when logged in -->
                <li class="profile-dropdown-container">
                    <button class="profile-trigger" id="profileTrigger" aria-label="User menu">
                        <div class="profile-avatar">
                            <span class="avatar-initials">${initials}</span>
                        </div>
                        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    
                    <!-- Dropdown Menu -->
                    <div class="profile-dropdown" id="profileDropdown">
                        <div class="dropdown-header">
                            <div class="dropdown-avatar">
                                <span class="avatar-initials">${initials}</span>
                            </div>
                            <div class="dropdown-user-info">
                                <span class="dropdown-name">${displayName}</span>
                                <span class="dropdown-email">${displayEmail}</span>
                            </div>
                        </div>
                        <div class="dropdown-divider"></div>
                        <ul class="dropdown-menu">
                            <li><a href="${assetPath}dashboard.html" class="dropdown-item">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                                    <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                                    <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                                    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                                </svg>
                                Dashboard
                            </a></li>
                            <li><a href="${assetPath}settings.html" class="dropdown-item">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/>
                                    <path d="M12.5 5.5L13.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M12.5 10.5L13.5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M8 3V1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M8 13V14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M3.5 5.5L2.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M3.5 10.5L2.5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                Settings
                            </a></li>
                            <li><a href="${assetPath}dashboard.html?tab=brand-voice" class="dropdown-item">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 1V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M8 13V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M3 8H1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M15 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/>
                                </svg>
                                Brand Voice
                            </a></li>
                        </ul>
                        <div class="dropdown-divider"></div>
                        <ul class="dropdown-menu">
                            <li><a href="#" class="dropdown-item dropdown-signout" id="signOutBtn">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M10.5 11L14 8L10.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                Sign Out
                            </a></li>
                        </ul>
                    </div>
                </li>
            ` : `
                <!-- LOGIN BUTTON - Only shown when NOT logged in -->
                <li><a href="${assetPath}login.html" class="nav-login">Log In</a></li>
            `}
        </ul>

        <!-- Mobile Hamburger -->
        <button class="menu-trigger" popovertarget="premium-nav" aria-label="Open Navigation Menu">
            <span class="trigger-box">
                <span class="trigger-line"></span>
            </span>
        </button>

        <!-- Mobile Drawer -->
        <nav id="premium-nav" popover class="mobile-drawer">
            <div class="drawer-inner">
                <div class="drawer-header">
                    <span class="drawer-brand">
                        <img src="${assetPath}assets/icons/logo.png" alt="Fromple" class="drawer-logo" />
                        <span>Fromple</span>
                    </span>
                    <button class="menu-close" popovertarget="premium-nav" popovertargetaction="hide" aria-label="Close Navigation Menu">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                ${isLoggedIn ? `
                    <div class="drawer-user">
                        <div class="drawer-avatar">${initials}</div>
                        <div class="drawer-user-info">
                            <span class="drawer-user-name">${displayName}</span>
                            <span class="drawer-user-email">${displayEmail}</span>
                        </div>
                    </div>
                    <div class="drawer-divider"></div>
                ` : ''}

                <ul class="drawer-links">
                    <li><a href="${assetPath}index.html" class="drawer-link ${isActive('index.html')}">Home</a></li>
                    <li><a href="${assetPath}services.html" class="drawer-link ${isActive('services.html')}">Services</a></li>
                    <li><a href="${assetPath}pricing.html" class="drawer-link ${isActive('pricing.html')}">Pricing</a></li>
                    <li><a href="${assetPath}team.html" class="drawer-link ${isActive('team.html')}">Team</a></li>
                    <li><a href="${assetPath}blog.html" class="drawer-link ${isActive('blog.html')}">Blog</a></li>
                </ul>

                <div class="drawer-actions">
                    <a href="${assetPath}get-started.html" class="drawer-cta">Get Started</a>
                    ${isLoggedIn ? `
                        <a href="#" class="drawer-login" id="drawerSignOutBtn">Sign Out</a>
                    ` : `
                        <a href="${assetPath}login.html" class="drawer-login">Log In</a>
                    `}
                </div>
            </div>
        </nav>
    </div>
</header>
`;
}

// ============================================================
// Inject Header
// ============================================================

async function injectHeader() {
    console.log('🔵 injectHeader() called');
    
    const headerContainer = document.getElementById('header');
    
    if (!headerContainer) {
        console.error('❌ Header container not found!');
        return;
    }
    
    // Get auth state
    const auth = await getAuthState();
    currentUser = auth.user;
    isLoggedIn = auth.isLoggedIn;
    
    console.log('👤 Auth state:', isLoggedIn ? `Logged in as ${currentUser?.email}` : 'Not logged in');
    
    // Generate and inject header
    const headerHTML = generateHeaderHTML(currentUser, isLoggedIn);
    headerContainer.innerHTML = headerHTML;
    console.log('✅ Header injected!');
    
    // Initialize dropdown if logged in
    if (isLoggedIn) {
        initProfileDropdown();
        initSignOutHandlers();
    }
}

// ============================================================
// PROFILE DROPDOWN - Toggle on click
// ============================================================

function initProfileDropdown() {
    const trigger = document.getElementById('profileTrigger');
    const dropdown = document.getElementById('profileDropdown');
    
    if (!trigger || !dropdown) {
        console.log('ℹ️ Profile dropdown elements not found');
        return;
    }
    
    console.log('✅ Profile dropdown initialized');
    
    // Toggle dropdown on click
    trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        trigger.setAttribute('aria-expanded', dropdown.classList.contains('open'));
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const container = document.querySelector('.profile-dropdown-container');
        if (container && !container.contains(e.target)) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
    
    // Close dropdown on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
        }
    });
    
    // Close dropdown when clicking a link
    dropdown.querySelectorAll('a:not(#signOutBtn)').forEach(link => {
        link.addEventListener('click', function() {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        });
    });
}

// ============================================================
// SIGN OUT HANDLERS
// ============================================================

function initSignOutHandlers() {
    // Sign out button in dropdown
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleSignOut();
        });
    }
    
    // Sign out button in mobile drawer
    const drawerSignOutBtn = document.getElementById('drawerSignOutBtn');
    if (drawerSignOutBtn) {
        drawerSignOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleSignOut();
        });
    }
}

async function handleSignOut() {
    try {
        const { supabase } = await import('./supabase-client.js');
        await supabase.auth.signOut();
        console.log('✅ Signed out successfully');
        
        // Force page reload to reflect new auth state
        window.location.href = window.location.pathname;
    } catch (error) {
        console.error('❌ Sign out error:', error);
    }
}

// ============================================================
// AUTH STATE CHANGE LISTENER - Re-render header on auth change
// ============================================================

function initAuthListener() {
    // Try to set up listener after import
    import('./supabase-client.js').then(({ supabase }) => {
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('🔄 Auth state changed:', event);
            
            // Check if user logged in or out
            const wasLoggedIn = isLoggedIn;
            const isNowLoggedIn = !!session;
            
            if (wasLoggedIn !== isNowLoggedIn) {
                // Auth state changed, re-render header
                console.log('🔄 Re-rendering header due to auth change');
                injectHeader();
            }
        });
    }).catch(err => {
        console.warn('⚠️ Could not set up auth listener:', err);
    });
}

// ============================================================
// RUN
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async function() {
        await injectHeader();
        initAuthListener();
    });
} else {
    // DOM already loaded
    (async function() {
        await injectHeader();
        initAuthListener();
    })();
}
