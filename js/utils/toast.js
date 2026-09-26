// ============================================================
// utils/toast.js - Shared Toast Notification
// ============================================================

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'info', 'success', 'warning', 'error'
 * @param {number} duration - Duration in milliseconds (default: 5000)
 */
export function showToast(message, type = 'info', duration = 5000) {
    // Remove any existing toast
    const existing = document.querySelector('.dashboard-notification');
    if (existing) existing.remove();

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `dashboard-notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" aria-label="Close notification">×</button>
    `;

    // Add to DOM
    document.body.appendChild(notification);

    // Add close button listener
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            notification.remove();
        });
    }

    // Auto-remove after duration
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);
}

// Expose globally for inline onclick handlers
window.showToast = showToast;

// Also export a default for convenience
export default showToast;