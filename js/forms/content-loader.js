// ============================================================
// CONTENT LOADER - Loads forms dynamically
// ============================================================

// ============================================================
// MOCK DATABASE (Replace with Supabase when ready)
// ============================================================
const db = {
    from: (table) => ({
        select: () => ({
            order: (column, options) => ({
                limit: (count) => {
                    console.log(`[Mock] SELECT from ${table}`);
                    const data = getMockData(table);
                    return Promise.resolve({ data: data, error: null });
                }
            })
        }),
        insert: (data) => {
            console.log(`[Mock] INSERT:`, data);
            return Promise.resolve({ data: null, error: null });
        },
        delete: () => ({
            eq: (column, value) => {
                console.log(`[Mock] DELETE where ${column}=${value}`);
                return Promise.resolve({ error: null });
            }
        })
    })
};

// ============================================================
// STATE
// ============================================================
let currentType = 'blog';
let currentItems = [];

// ============================================================
// LOAD CONTENT TYPE
// ============================================================
async function loadContentType(type) {
    currentType = type;

    // Update active button
    document.querySelectorAll('.content-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Update page title
    const titles = {
        blog: 'Blog Posts',
        career: 'Career Posts',
        page: 'Pages',
        asset: 'Assets',
        team: 'Team Members',
        package: 'Packages'
    };
    document.getElementById('listTitle').textContent = titles[type] || 'Items';

    // Load the form
    await loadForm(type);

    // Load the list
    await loadList(type);
}

// ============================================================
// LOAD FORM
// ============================================================
async function loadForm(type) {
    const container = document.getElementById('formContent');

    // Show loading
    container.innerHTML = `
        <div class="form-loading">
            <div class="spinner"></div>
            <p>Loading form...</p>
        </div>
    `;

    try {
        // Dynamically import the form module
        const module = await import(`./${type}-form.js`);
        const formHTML = module.renderForm ? module.renderForm() : module.default();
        container.innerHTML = formHTML;

        // Initialize form handlers
        if (module.init) {
            module.init();
        }

        // Update form title
        const titles = {
            blog: 'Create New Blog Post',
            career: 'Create New Career Post',
            page: 'Create New Page',
            asset: 'Upload New Asset',
            team: 'Add Team Member',
            package: 'Create Pricing Package'
        };
        const titleEl = container.querySelector('h2');
        if (titleEl) {
            titleEl.textContent = titles[type] || 'Create New';
        }

    } catch (error) {
        console.error('Error loading form:', error);
        container.innerHTML = `
            <div class="form-error">
                <p>⚠️ Error loading form. Please refresh the page.</p>
                <p style="font-size:13px;color:var(--gray-500);">${error.message}</p>
            </div>
        `;
    }
}

// ============================================================
// LOAD LIST
// ============================================================
async function loadList(type) {
    const container = document.getElementById('listContainer');

    // Show loading
    container.innerHTML = `<div class="empty-state"><p>Loading...</p></div>`;

    try {
        // Map type to table name
        const tableMap = {
            blog: 'blogs',
            career: 'careers',
            page: 'pages',
            asset: 'assets',
            team: 'teams',
            package: 'packages'
        };
        const table = tableMap[type] || type + 's';

        // Get data from mock database
        const result = await db.from(table).select().order('created_at', { ascending: false }).limit(20);
        const data = result.data || [];

        currentItems = data || [];
        document.getElementById('listCount').textContent = currentItems.length + ' items';

        // Update badge count
        const badge = document.getElementById(type + 'Count');
        if (badge) badge.textContent = currentItems.length;

        // Update total summary
        updateTotalSummary();

        if (currentItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📭</span>
                    <p>No items yet. Create your first one above.</p>
                </div>
            `;
            return;
        }

        // Render table
        container.innerHTML = renderTable(type, currentItems);

    } catch (error) {
        console.error('Error loading list:', error);
        container.innerHTML = `
            <div class="empty-state">
                <p>⚠️ Error loading items: ${error.message}</p>
            </div>
        `;
    }
}

// ============================================================
// MOCK DATA
// ============================================================
function getMockData(table) {
    const mocks = {
        blogs: [
            { id: '1', title: 'The 80/20 Content Rule', category: 'Content Strategy', status: 'published', created_at: new Date().toISOString() },
            { id: '2', title: 'How AI is Revolutionizing Content', category: 'AI Technology', status: 'draft', created_at: new Date().toISOString() },
            { id: '3', title: 'Measuring Content ROI', category: 'Analytics', status: 'published', created_at: new Date().toISOString() }
        ],
        careers: [
            { id: '1', title: 'Senior Full Stack Developer', department: 'Engineering', status: 'active', created_at: new Date().toISOString() },
            { id: '2', title: 'AI Engineer', department: 'Engineering', status: 'active', created_at: new Date().toISOString() },
            { id: '3', title: 'Product Designer', department: 'Design', status: 'draft', created_at: new Date().toISOString() }
        ],
        pages: [
            { id: '1', title: 'About Us', status: 'published', created_at: new Date().toISOString() },
            { id: '2', title: 'Services', status: 'published', created_at: new Date().toISOString() },
            { id: '3', title: 'Pricing', status: 'draft', created_at: new Date().toISOString() }
        ],
        assets: [
            { id: '1', file_name: 'Masterclass Recording.mp3', status: 'completed', created_at: new Date().toISOString() },
            { id: '2', file_name: 'Client Interview.mp3', status: 'processing', created_at: new Date().toISOString() },
            { id: '3', file_name: 'Product Launch.mp3', status: 'completed', created_at: new Date().toISOString() }
        ],
        teams: [
            { id: '1', first_name: 'John', last_name: 'Doe', role: 'CEO & Co-Founder', status: 'active', created_at: new Date().toISOString() },
            { id: '2', first_name: 'Sarah', last_name: 'Mitchell', role: 'CTO & Co-Founder', status: 'active', created_at: new Date().toISOString() },
            { id: '3', first_name: 'Marcus', last_name: 'Chen', role: 'Head of Product', status: 'active', created_at: new Date().toISOString() }
        ],
        packages: [
            { id: '1', name: 'Free', price: '$0', period: 'forever', features: ['1 campaign', 'Max 45 minutes'], status: 'active', created_at: new Date().toISOString() },
            { id: '2', name: 'Professional', price: 'R299', period: 'monthly', features: ['5 uploads/month', 'Priority processing', 'All platforms'], status: 'active', created_at: new Date().toISOString() },
            { id: '3', name: 'Growth', price: 'R599', period: 'monthly', features: ['Unlimited uploads', 'Highest priority', 'Team access (5 users)'], status: 'active', created_at: new Date().toISOString() }
        ]
    };
    return mocks[table] || [];
}

// ============================================================
// RENDER TABLE
// ============================================================
function renderTable(type, items) {
    const columns = getColumns(type);
    const rows = items.map(item => getRow(type, item)).join('');

    return `
        <table class="content-table">
            <thead>
                <tr>
                    ${columns.map(col => `<th>${col}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function getColumns(type) {
    const map = {
        blog: ['Title', 'Category', 'Status', 'Date'],
        career: ['Title', 'Department', 'Status', 'Date'],
        page: ['Title', 'Status', 'Date'],
        asset: ['File Name', 'Status', 'Date'],
        team: ['Name', 'Role', 'Status', 'Date'],
        package: ['Name', 'Price', 'Period', 'Status']
    };
    return map[type] || ['Title', 'Status', 'Date'];
}

function getRow(type, item) {
    const actions = `
        <div class="actions">
            <button onclick="window.editItem('${type}','${item.id}')" title="Edit">✏️</button>
            <button onclick="window.deleteItem('${type}','${item.id}')" class="btn-delete" title="Delete">🗑️</button>
        </div>
    `;

    const statusClass = getStatusClass(item.status);
    const statusLabel = item.status || 'draft';
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : '-';

    switch (type) {
        case 'blog':
            return `
                <tr>
                    <td data-label="Title"><strong>${item.title || 'Untitled'}</strong></td>
                    <td data-label="Category">${item.category || 'General'}</td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Date">${date}</td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        case 'career':
            return `
                <tr>
                    <td data-label="Title"><strong>${item.title || 'Untitled'}</strong></td>
                    <td data-label="Department">${item.department || 'General'}</td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Date">${date}</td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        case 'page':
            return `
                <tr>
                    <td data-label="Title"><strong>${item.title || 'Untitled'}</strong></td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Date">${date}</td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        case 'asset':
            return `
                <tr>
                    <td data-label="File Name"><strong>${item.file_name || 'Untitled'}</strong></td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Date">${date}</td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        case 'team':
            const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Untitled';
            return `
                <tr>
                    <td data-label="Name"><strong>${fullName}</strong></td>
                    <td data-label="Role">${item.role || '-'}</td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Date">${date}</td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        case 'package':
            return `
                <tr>
                    <td data-label="Name"><strong>${item.name || 'Untitled'}</strong></td>
                    <td data-label="Price">${item.price || 'Free'}</td>
                    <td data-label="Period">${item.period || 'monthly'}</td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td class="actions" data-label="Actions">${actions}</td>
                </tr>
            `;
        default:
            return `<tr><td colspan="5">Unknown type</td></tr>`;
    }
}

function getStatusClass(status) {
    const map = {
        'published': 'published',
        'active': 'active',
        'draft': 'draft',
        'closed': 'closed',
        'processing': 'processing',
        'completed': 'published',
        'inactive': 'draft',
        'archived': 'closed'
    };
    return map[status] || 'draft';
}

// ============================================================
// UPDATE TOTAL SUMMARY
// ============================================================
function updateTotalSummary() {
    const counts = {
        blog: parseInt(document.getElementById('blogCount')?.textContent || '0'),
        career: parseInt(document.getElementById('careerCount')?.textContent || '0'),
        page: parseInt(document.getElementById('pageCount')?.textContent || '0'),
        asset: parseInt(document.getElementById('assetCount')?.textContent || '0'),
        team: parseInt(document.getElementById('teamCount')?.textContent || '0'),
        package: parseInt(document.getElementById('packageCount')?.textContent || '0')
    };
    const total = counts.blog + counts.career + counts.page + counts.asset + counts.team + counts.package;
    document.getElementById('contentSummary').textContent = `Total: ${total} items`;
    document.getElementById('contentCount').textContent = total;
}

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.loadContentType = loadContentType;

window.editItem = function(type, id) {
    const item = currentItems.find(i => i.id === id);
    if (item) {
        const name = item.title || item.name || item.file_name || [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Untitled';
        alert(`Edit ${type}: ${name}\n\nFeature coming soon: Load this item into the form for editing.`);
    } else {
        alert(`Edit ${type} with ID: ${id}`);
    }
};

window.deleteItem = function(type, id) {
    if (!confirm(`Delete this ${type}? This cannot be undone.`)) return;

    // Mock delete
    console.log(`[Mock] Deleting ${type} with ID: ${id}`);
    showToast('✅ Item deleted successfully!', 'success');
    loadList(type);
};

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'info') {
    const existing = document.querySelector('.dashboard-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `dashboard-notification ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

window.showToast = showToast;

// ============================================================
// INITIALIZE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Load default content type
    loadContentType('blog');

    // Listen for content-saved events to refresh the list
    document.addEventListener('content-saved', (e) => {
        if (e.detail?.type) {
            loadList(e.detail.type);
        }
    });
});

// ============================================================
// EXPORTS
// ============================================================
export { showToast, loadList };