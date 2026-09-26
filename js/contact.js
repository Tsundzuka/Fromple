// ========================================
// Contact Form Handler
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('contactUsForm');
    
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const btn = form.querySelector('.btn-primary');
            const originalText = btn.innerHTML;
            
            // Disable button and show sending state
            btn.innerHTML = '⏳ Sending...';
            btn.disabled = true;
            
            // Simulate form submission
            setTimeout(() => {
                // Success state
                btn.innerHTML = '✅ Message sent!';
                btn.style.background = '#10B981';
                
                setTimeout(() => {
                    // Reset button
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                    btn.disabled = false;
                    
                    // Reset form
                    form.reset();
                    
                    // Show success notification
                    showToast('📧 Message sent! We\'ll get back to you soon.', 'success');
                }, 2000);
            }, 1500);
        });
    }
});

// ========================================
// Toast Notification System
// ========================================

function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.dashboard-notification');
    if (existing) existing.remove();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `dashboard-notification ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add to body
    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        }
    }, 5000);
}