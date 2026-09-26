// ============================================================
// FOOTER COMPONENT
// ============================================================

(function() {
    // Helper to get correct asset path
    function getAssetPath() {
        if (window.location.pathname.includes('/admin/')) {
            return '../';
        }
        return '';
    }

    const assetPath = getAssetPath();

    const footerHTML = `
    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="${assetPath}index.html" class="nav-brand">
                        <span class="brand-logo-wrapper">
                            <img src="${assetPath}assets/icons/logo.png" alt="Fromple" class="brand-logo" />
                            <img src="${assetPath}assets/icons/brand.png" alt="Fromple" class="brand-text-image" />
                        </span>
                    </a>
                    <hr class="footer-divider" />
                    <p class="brand-description">Record Once. Publish Everywhere.<br />AI-powered content strategy for modern professionals.</p>
                    <div class="footer-social">
                        <a href="https://linkedin.com/company/fromple" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                            <img src="${assetPath}assets/icons/linkedin.svg" alt="" role="presentation" />
                        </a>
                        <a href="https://twitter.com/fromple" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)">
                            <img src="${assetPath}assets/icons/twitter.svg" alt="" role="presentation" />
                        </a>
                        <a href="https://facebook.com/fromple" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                            <img src="${assetPath}assets/icons/facebook.svg" alt="" role="presentation" />
                        </a>
                        <a href="https://youtube.com/@fromple" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                            <img src="${assetPath}assets/icons/youtube.svg" alt="" role="presentation" />
                        </a>
                        <a href="https://github.com/fromple" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                            <img src="${assetPath}assets/icons/github.svg" alt="" role="presentation" />
                        </a>
                    </div>
                </div>

                <div class="footer-links">
                    <h4>Product</h4>
                    <a href="${assetPath}services.html">Services</a>
                    <a href="${assetPath}pricing.html">Pricing</a>
                    <a href="${assetPath}admin/index.html">Dashboard</a>
                    <a href="${assetPath}blog.html">Blog</a>
                </div>

                <div class="footer-links">
                    <h4>Company</h4>
                    <a href="${assetPath}team.html">Team</a>
                    <a href="${assetPath}contact.html">Contact Us</a>
                    <a href="${assetPath}careers.html">Careers</a>
                    <a href="${assetPath}about.html">Abouadmin/t</a>
                </div>

                <div class="footer-links">
                    <h4>Legal</h4>
                    <a href="${assetPath}policies.html">Privacy &amp; Cookie Policy</a>
                    <a href="${assetPath}terms.html">Terms of Service</a>
                    <a href="${assetPath}faq.html">FAQ</a>
                </div>
            </div>

            <div class="footer-bottom">
                <p>&copy; 2026 Fromple. All rights reserved.</p>
            </div>
        </div>
    </footer>
    `;

    // Try multiple ways to inject
    function injectFooter() {
        var container = document.getElementById('footer');
        if (container) {
            container.innerHTML = footerHTML;
            console.log('Footer injected successfully');
            return true;
        }
        return false;
    }

    // Try immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (!injectFooter()) {
                // If failed, try again after a short delay
                setTimeout(injectFooter, 100);
            }
        });
    } else {
        if (!injectFooter()) {
            // If failed, try again after a short delay
            setTimeout(injectFooter, 100);
        }
    }

    // Final fallback - try after everything loads
    window.addEventListener('load', function() {
        injectFooter();
    });

})();