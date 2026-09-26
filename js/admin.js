(function() {
// ============================================================
// admin.js - Admin Panel Functionality
// ============================================================

// ============================================================
// Dashboard
// ============================================================
function refreshData() {
    document.getElementById('lastUpdated').textContent = 'Just now';
    // Will connect to API later
    showNotification('Data refreshed', 'success');
}

// ============================================================
// Users
// ============================================================
let adminCurrentPage = 1;
let currentUserFilter = 'all';

function filterUsers() {
    const search = document.getElementById('userSearch')?.value || '';
    const role = document.getElementById('userRoleFilter')?.value || 'all';
    const plan = document.getElementById('userPlanFilter')?.value || 'all';
    const status = document.getElementById('userStatusFilter')?.value || 'all';
    // Will connect to API later
    loadUsers(adminCurrentPage);
}

function loadUsers(page) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    // Show loading
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-text">Loading users...</td>
        </tr>
    `;
    
    // Will connect to API later
    // For now, show sample data
    setTimeout(() => {
        tbody.innerHTML = `
            <tr>
                <td><strong>John Doe</strong></td>
                <td>john@example.com</td>
                <td><span class="badge success">Professional</span></td>
                <td>User</td>
                <td><span class="badge success">Active</span></td>
                <td>Jan 15, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="editUser('1')">✏️</button>
                    <button class="action-btn-icon" onclick="deleteUser('1')">🗑️</button>
                </td>
            </tr>
            <tr>
                <td><strong>Sarah Mitchell</strong></td>
                <td>sarah@example.com</td>
                <td><span class="badge warning">Free</span></td>
                <td>User</td>
                <td><span class="badge success">Active</span></td>
                <td>Feb 3, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="editUser('2')">✏️</button>
                    <button class="action-btn-icon" onclick="deleteUser('2')">🗑️</button>
                </td>
            </tr>
            <tr>
                <td><strong>Marcus Chen</strong></td>
                <td>marcus@example.com</td>
                <td><span class="badge info">Growth</span></td>
                <td>Admin</td>
                <td><span class="badge success">Active</span></td>
                <td>Mar 10, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="editUser('3')">✏️</button>
                    <button class="action-btn-icon" onclick="deleteUser('3')">🗑️</button>
                </td>
            </tr>
        `;
        document.getElementById('userTableInfo').textContent = `Showing 3 users`;
    }, 500);
}

function showAddUserModal() {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('userModal').style.display = 'none';
}

function saveUser() {
    // Will connect to API later
    closeModal();
    showNotification('User saved successfully', 'success');
    loadUsers(adminCurrentPage);
}

function editUser(id) {
    document.getElementById('modalTitle').textContent = 'Edit User';
    // Will load user data from API
    document.getElementById('userModal').style.display = 'flex';
}

function deleteUser(id) {
    if (confirm('Are you sure you want to delete this user?')) {
        // Will connect to API later
        showNotification('User deleted', 'warning');
        loadUsers(adminCurrentPage);
    }
}

function exportUsers() {
    // Will connect to API later
    showNotification('Export started', 'info');
}

// ============================================================
// Campaigns
// ============================================================
function loadCampaigns(page) {
    const tbody = document.getElementById('campaignsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="loading-text">Loading campaigns...</td>
        </tr>
    `;
    
    // Will connect to API later
    setTimeout(() => {
        tbody.innerHTML = `
            <tr>
                <td>Masterclass Recording – Content Strategy 2026</td>
                <td>John Doe</td>
                <td><span class="badge success">Completed</span></td>
                <td>12</td>
                <td>May 12, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="viewCampaign('1')">👁️</button>
                    <button class="action-btn-icon" onclick="deleteCampaign('1')">🗑️</button>
                </td>
            </tr>
            <tr>
                <td>Client Interview – Sarah Mitchell</td>
                <td>Sarah Mitchell</td>
                <td><span class="badge warning">Processing</span></td>
                <td>8</td>
                <td>May 8, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="viewCampaign('2')">👁️</button>
                    <button class="action-btn-icon" onclick="deleteCampaign('2')">🗑️</button>
                </td>
            </tr>
        `;
        document.getElementById('campaignTableInfo').textContent = 'Showing 2 campaigns';
    }, 500);
}

function filterCampaigns() {
    loadCampaigns(adminCurrentPage);
}

function viewCampaign(id) {
    window.location.href = `../pages/dashboard.html?tab=campaign&id=${id}`;
}

function deleteCampaign(id) {
    if (confirm('Are you sure you want to delete this campaign?')) {
        showNotification('Campaign deleted', 'warning');
        loadCampaigns(adminCurrentPage);
    }
}

// ============================================================
// Subscriptions
// ============================================================
function loadSubscriptions(page) {
    const tbody = document.getElementById('subscriptionsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-text">Loading subscriptions...</td>
        </tr>
    `;
    
    // Will connect to API later
    setTimeout(() => {
        tbody.innerHTML = `
            <tr>
                <td>John Doe</td>
                <td><span class="badge info">Professional</span></td>
                <td><span class="badge success">Active</span></td>
                <td>R299</td>
                <td>Jan 15, 2026</td>
                <td>Jun 15, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="editSubscription('1')">✏️</button>
                    <button class="action-btn-icon" onclick="cancelSubscription('1')">⛔</button>
                </td>
            </tr>
        `;
        document.getElementById('subTableInfo').textContent = 'Showing 1 subscription';
    }, 500);
}

function filterSubscriptions() {
    loadSubscriptions(adminCurrentPage);
}

function editSubscription(id) {
    showNotification('Edit subscription feature coming soon', 'info');
}

function cancelSubscription(id) {
    if (confirm('Are you sure you want to cancel this subscription?')) {
        showNotification('Subscription cancelled', 'warning');
        loadSubscriptions(adminCurrentPage);
    }
}

// ============================================================
// Billing & Invoices
// ============================================================
function loadInvoices(page) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-text">Loading invoices...</td>
        </tr>
    `;
    
    // Will connect to API later
    setTimeout(() => {
        tbody.innerHTML = `
            <tr>
                <td>#INV-001</td>
                <td>John Doe</td>
                <td>R299.00</td>
                <td><span class="badge success">Paid</span></td>
                <td>May 15, 2026</td>
                <td>Jun 15, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="downloadInvoice('1')">📄</button>
                </td>
            </tr>
            <tr>
                <td>#INV-002</td>
                <td>Marcus Chen</td>
                <td>R599.00</td>
                <td><span class="badge success">Paid</span></td>
                <td>May 10, 2026</td>
                <td>Jun 10, 2026</td>
                <td>
                    <button class="action-btn-icon" onclick="downloadInvoice('2')">📄</button>
                </td>
            </tr>
        `;
        document.getElementById('invoiceTableInfo').textContent = 'Showing 2 invoices';
    }, 500);
}

function filterInvoices() {
    loadInvoices(adminCurrentPage);
}

function applyDateFilter() {
    loadInvoices(adminCurrentPage);
}

function generateInvoice() {
    showNotification('Invoice generation feature coming soon', 'info');
}

function downloadInvoice(id) {
    showNotification(`Downloading invoice #${id}...`, 'info');
}

// ============================================================
// AI Usage
// ============================================================
function loadAIUsage() {
    // Will connect to API later
    document.getElementById('aiTotalTokens').textContent = '1.2M';
    document.getElementById('aiGroqTokens').textContent = '840K';
    document.getElementById('aiGeminiTokens').textContent = '360K';
    document.getElementById('aiQueueLength').textContent = '3';
    document.getElementById('aiCostThisMonth').textContent = 'R42.50';
    
    // Queue stats
    document.getElementById('queueWaiting').textContent = '3';
    document.getElementById('queueProcessing').textContent = '2';
    document.getElementById('queueCompletedToday').textContent = '18';
    document.getElementById('queueAvgWait').textContent = '45s';
}

// ============================================================
// Prompts
// ============================================================
function loadPrompts() {
    const tbody = document.getElementById('promptsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td><strong>linkedin-post</strong></td>
            <td>Social Media</td>
            <td>Creator Module</td>
            <td>v2.1</td>
            <td><span class="badge success">Active</span></td>
            <td>
                <button class="action-btn-icon" onclick="editPrompt('1')">✏️</button>
                <button class="action-btn-icon" onclick="testPrompt('1')">🧪</button>
            </td>
        </tr>
        <tr>
            <td><strong>blog-article</strong></td>
            <td>Authority</td>
            <td>Authority Builder</td>
            <td>v1.3</td>
            <td><span class="badge success">Active</span></td>
            <td>
                <button class="action-btn-icon" onclick="editPrompt('2')">✏️</button>
                <button class="action-btn-icon" onclick="testPrompt('2')">🧪</button>
            </td>
        </tr>
    `;
    document.getElementById('promptTableInfo').textContent = 'Showing 2 prompts';
}

function filterPrompts(category) {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    loadPrompts();
}

function showAddPromptModal() {
    document.getElementById('promptModalTitle').textContent = 'New Prompt';
    document.getElementById('promptForm').reset();
    document.getElementById('promptModal').style.display = 'flex';
}

function closePromptModal() {
    document.getElementById('promptModal').style.display = 'none';
}

function editPrompt(id) {
    document.getElementById('promptModalTitle').textContent = 'Edit Prompt';
    document.getElementById('promptModal').style.display = 'flex';
}

function savePrompt() {
    closePromptModal();
    showNotification('Prompt saved successfully', 'success');
    loadPrompts();
}

function testPrompt() {
    showNotification('Testing prompt...', 'info');
}

// ============================================================
// Settings
// ============================================================
function saveAllSettings() {
    // Will connect to API later
    showNotification('All settings saved successfully', 'success');
}

// Temperature slider
document.addEventListener('DOMContentLoaded', function() {
    const tempSlider = document.getElementById('temperature');
    if (tempSlider) {
        tempSlider.addEventListener('input', function() {
            document.getElementById('temperatureValue').textContent = this.value;
        });
    }
    
    // Load data on each page
    const page = window.location.pathname.split('/').pop();
    switch(page) {
        case 'index.html':
            // Dashboard already loaded
            break;
        case 'users.html':
            loadUsers(1);
            break;
        case 'campaigns.html':
            loadCampaigns(1);
            break;
        case 'subscriptions.html':
            loadSubscriptions(1);
            break;
        case 'billing.html':
            loadInvoices(1);
            break;
        case 'ai-usage.html':
            loadAIUsage();
            break;
        case 'prompts.html':
            loadPrompts();
            break;
        case 'logs.html':
            loadLogs();
            break;
        case 'analytics.html':
            loadAnalytics();
            break;
    }
});

// ============================================================
// Logs
// ============================================================
function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td>May 15, 2026 14:32</td>
            <td>User</td>
            <td><span class="badge success">Info</span></td>
            <td>john@example.com</td>
            <td>Logged in successfully</td>
            <td>192.168.1.1</td>
        </tr>
        <tr>
            <td>May 15, 2026 14:15</td>
            <td>Campaign</td>
            <td><span class="badge success">Info</span></td>
            <td>sarah@example.com</td>
            <td>Campaign "Masterclass" completed</td>
            <td>192.168.1.2</td>
        </tr>
        <tr>
            <td>May 15, 2026 13:45</td>
            <td>Payment</td>
            <td><span class="badge success">Info</span></td>
            <td>marcus@example.com</td>
            <td>Payment of R299 received</td>
            <td>192.168.1.3</td>
        </tr>
        <tr>
            <td>May 15, 2026 12:20</td>
            <td>System</td>
            <td><span class="badge warning">Warning</span></td>
            <td>System</td>
            <td>AI queue backlog: 5 items</td>
            <td>-</td>
        </tr>
    `;
    document.getElementById('logTableInfo').textContent = 'Showing 4 logs';
}

function filterLogs() {
    loadLogs();
}

function applyLogDateFilter() {
    loadLogs();
}

function exportLogs() {
    showNotification('Exporting logs...', 'info');
}

function clearLogs() {
    if (confirm('Are you sure you want to clear all logs?')) {
        showNotification('Logs cleared', 'warning');
        loadLogs();
    }
}

// ============================================================
// Analytics
// ============================================================
function loadAnalytics() {
    document.getElementById('userGrowthRate').textContent = '+12%';
    document.getElementById('revenueGrowthRate').textContent = '+18%';
    document.getElementById('conversionRate').textContent = '8.5%';
    document.getElementById('churnRate').textContent = '3.2%';
    
    document.getElementById('breakdownFree').textContent = '720';
    document.getElementById('breakdownPro').textContent = '320';
    document.getElementById('breakdownGrowth').textContent = '120';
    document.getElementById('breakdownEnterprise').textContent = '45';
}

function updateAnalytics() {
    loadAnalytics();
    showNotification('Analytics updated', 'success');
}

function exportAnalytics() {
    showNotification('Exporting analytics...', 'info');
}

// ============================================================
// Pagination
// ============================================================
function prevPage() {
    if (adminCurrentPage > 1) {
        adminCurrentPage--;
        reloadadminCurrentPage();
    }
}

function nextPage() {
    adminCurrentPage++;
    reloadadminCurrentPage();
}

function reloadadminCurrentPage() {
    const page = window.location.pathname.split('/').pop();
    switch(page) {
        case 'users.html': loadUsers(adminCurrentPage); break;
        case 'campaigns.html': loadCampaigns(adminCurrentPage); break;
        case 'subscriptions.html': loadSubscriptions(adminCurrentPage); break;
        case 'billing.html': loadInvoices(adminCurrentPage); break;
    }
    document.getElementById('pageInfo').textContent = `Page ${adminCurrentPage}`;
}

// ============================================================
// Notifications
// ============================================================
function showNotification(message, type = 'info') {
    const colors = {
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
    };
    
    const notification = document.createElement('div');
    notification.className = 'dashboard-notification';
    notification.style.borderLeftColor = colors[type] || colors.info;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

})();