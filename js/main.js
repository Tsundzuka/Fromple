// ========================================
// FROMPLE - MAIN APPLICATION
// ========================================

console.log('🔵 MAIN.JS LOADED');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 DOMContentLoaded fired - initializing modules...');
    // Mobile menu is now handled by header.js
    initContactForm();
    // initServiceDetail(); // REMOVED - service-detail.js handles this now
    initLoginForm();
    initNavActive();
    initSidebarToggle(); // Initialize sidebar toggle for admin pages
    console.log('✅ All modules initialized');
});

// ========================================
// NAV ACTIVE STATE
// ========================================
function initNavActive() {
    console.log('🔵 initNavActive() called');
    
    // Get current page dynamically
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    console.log('📄 Current page for nav:', currentPage);
    
    const links = document.querySelectorAll('.nav-menu a');
    console.log(`🔵 Found ${links.length} nav links`);
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
            console.log(`✅ Active link: ${href}`);
        } else {
            link.classList.remove('active');
        }
    });
}

// ========================================
// CONTACT FORM
// ========================================
function initContactForm() {
    console.log('🔵 initContactForm() called');
    
    const form = document.getElementById('contactForm');
    if (form) {
        console.log('✅ Contact form found');
        form.addEventListener('submit', (e) => {
            console.log('🟡 Contact form submitted');
            e.preventDefault();
            
            const btn = form.querySelector('.btn-primary');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Check your email!';
            btn.style.background = '#10B981';
            
            console.log('🟡 Showing success message...');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                form.reset();
                showToast('🎉 Free trial started! Check your email.', 'success');
                console.log('✅ Contact form reset');
            }, 3000);
        });
    } else {
        console.log('ℹ️ Contact form not found on this page');
    }
}

// ========================================
// LOGIN FORM
// ========================================
function initLoginForm() {
    console.log('🔵 initLoginForm() called');
    
    const form = document.getElementById('loginForm');
    if (form) {
        console.log('✅ Login form found');
        form.addEventListener('submit', (e) => {
            console.log('🟡 Login form submitted');
            e.preventDefault();
            
            const btn = form.querySelector('.btn-primary');
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳ Logging in...';
            
            console.log('🟡 Processing login...');
            setTimeout(() => {
                btn.innerHTML = '✅ Logged in!';
                btn.style.background = '#10B981';
                console.log('✅ Login successful');
                
                setTimeout(() => {
                    console.log('🔵 Redirecting to dashboard...');
                    window.location.href = 'dashboard.html';
                }, 1000);
            }, 1500);
        });
    } else {
        console.log('ℹ️ Login form not found on this page');
    }
}

// ========================================
// ADMIN SIDEBAR TOGGLE (Mobile)
// ========================================
function initSidebarToggle() {
    console.log('🔵 initSidebarToggle() called');
    
    const sidebarToggle = document.getElementById('adminSidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);
        console.log('✅ Sidebar overlay created');
    }

    if (sidebarToggle && sidebar) {
        console.log('✅ Sidebar toggle and sidebar found - attaching events');
        
        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            sidebarToggle.classList.toggle('open');
            overlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
            console.log(`🟡 Sidebar toggled: ${sidebar.classList.contains('open') ? 'open' : 'closed'}`);
        });

        overlay.addEventListener('click', function() {
            sidebar.classList.remove('open');
            sidebarToggle.classList.remove('open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('🟡 Sidebar closed via overlay');
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarToggle.classList.remove('open');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
                console.log('🟡 Sidebar closed via Escape key');
            }
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarToggle.classList.remove('open');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        // Close sidebar when a nav link is clicked (mobile only)
        document.querySelectorAll('.sidebar-nav a, .admin-nav a').forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    sidebarToggle.classList.remove('open');
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });
        
        console.log('✅ Sidebar toggle fully initialized');
    } else {
        if (!sidebarToggle) console.log('ℹ️ adminSidebarToggle not found on this page');
        if (!sidebar) console.log('ℹ️ sidebar not found on this page');
    }
}

// ========================================
// TOAST NOTIFICATIONS
// ========================================
function showToast(message, type = 'info') {
    console.log(`🔵 showToast() called: "${message}" (${type})`);
    
    const existing = document.querySelector('.toast-container');
    if (existing) {
        console.log('🟡 Removing existing toast');
        existing.remove();
    }

    const container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #fff;
        border: 1px solid var(--gray-200);
        border-radius: 8px;
        padding: 14px 20px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
        max-width: 400px;
        animation: slideUp 0.3s ease;
        font-size: 14px;
        color: var(--gray-800);
        font-family: 'Inter', sans-serif;
    `;

    const colors = {
        success: '#10B981',
        info: '#3B82F6',
        warning: '#F59E0B',
        error: '#EF4444'
    };

    container.style.borderLeft = `4px solid ${colors[type] || colors.info}`;

    const iconMap = {
        success: '✅',
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌'
    };

    container.innerHTML = `
        <span>${iconMap[type] || 'ℹ️'}</span>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: var(--gray-400);
            padding: 0 4px;
            font-family: inherit;
        ">×</button>
    `;

    document.body.appendChild(container);
    console.log('✅ Toast displayed');

    setTimeout(() => {
        if (container.parentElement) {
            container.remove();
            console.log('🟡 Toast auto-removed');
        }
    }, 4000);

    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
        console.log('✅ Toast styles added');
    }
}

// Make showToast globally accessible
window.showToast = showToast;
console.log('✅ showToast() available globally');

// ========================================
// SMOOTH SCROLL
// ========================================
console.log('🔵 Setting up smooth scroll...');
const smoothScrollLinks = document.querySelectorAll('a[href^="#"]:not([href="#"])');
console.log(`🔵 Found ${smoothScrollLinks.length} smooth scroll links`);

smoothScrollLinks.forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        // Skip if href is just "#" or empty
        if (!href || href === '#') {
            return;
        }
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            console.log(`🟡 Smooth scrolling to: ${href}`);
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});
console.log('✅ Smooth scroll setup complete');

// ========================================
// CONSOLE WELCOME
// ========================================
console.log('%c Fromple ', 'background:#14B8A6;color:#fff;font-size:24px;font-weight:bold;padding:10px 20px;border-radius:6px;');
console.log('%c Record Once. Publish Everywhere. ', 'color:#14B8A6;font-size:16px;');
console.log('🚀 Built with ❤️ by the Fromple team');
console.log('📧 hello@fromple.ai');
console.log('✅ MAIN.JS LOADING COMPLETE');
