// ============================================================
// admin-tabs/prompts.js
// ============================================================
let supabase = null;
let user = null;
let currentFilter = 'all';
let currentEditId = null;

export async function init(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔵 prompts tab initialized');

    attachEventListeners();
    await loadPrompts();
}

export async function refresh(supabaseClient, adminUser) {
    supabase = supabaseClient;
    user = adminUser;
    console.log('🔄 Refreshing prompts tab');
    await loadPrompts();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadPrompts() {
    const tbody = document.getElementById('promptsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Loading prompts...</td></tr>`;

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const params = new URLSearchParams();
        params.set('resource', 'prompts');
        if (currentFilter && currentFilter !== 'all') params.set('category', currentFilter);

        const res = await fetch(`/api/admin/administrator?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const prompts = data.prompts || [];

        if (prompts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-text">No prompts found.</td></tr>`;
            setText('promptTableInfo', 'Showing 0 prompts');
            return;
        }

        tbody.innerHTML = prompts.map(p => {
            const statusClass = {
                active: 'success',
                draft: 'warning',
                disabled: 'muted',
            }[p.status] || 'info';

            const categoryLabel = {
                social: 'Social Media',
                authority: 'Authority',
                business: 'Business',
            }[p.category] || p.category;

            return `
                <tr>
                    <td><strong>${escapeHtml(p.name)}</strong></td>
                    <td>${escapeHtml(categoryLabel)}</td>
                    <td>${escapeHtml(p.module || '—')}</td>
                    <td>v${p.version || 1}</td>
                    <td><span class="badge ${statusClass}">${escapeHtml(p.status)}</span></td>
                    <td>
                        <button class="action-btn-icon" onclick="editPrompt('${p.id}')" title="Edit">✏️</button>
                        <button class="action-btn-icon" onclick="testPrompt('${p.id}')" title="Test">🧪</button>
                    </td>
                </tr>
            `;
        }).join('');

        setText('promptTableInfo', `Showing ${prompts.length} prompts`);
    } catch (err) {
        console.error('loadPrompts failed:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="loading-text" style="color:var(--red);">Failed to load prompts.</td></tr>`;
    }
}

async function getToken() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch {
        return null;
    }
}

// ============================================================
// MODAL — created on first use, reused after
// ============================================================
function ensureModal() {
    let modal = document.getElementById('promptModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'promptModal';
    modal.className = 'admin-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="admin-modal-content admin-modal-large">
            <div class="admin-modal-header">
                <h2 id="promptModalTitle">Edit Prompt</h2>
                <button class="modal-close" id="promptModalClose">✕</button>
            </div>
            <div class="admin-modal-body">
                <form id="promptForm" onsubmit="return false;">
                    <div class="form-group">
                        <label>Prompt Name</label>
                        <input type="text" class="form-input" id="promptName" placeholder="e.g. diagnose_gap_analysis" />
                    </div>
                    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        <div class="form-group">
                            <label>Category</label>
                            <select class="form-select" id="promptCategory">
                                <option value="social">Social Media</option>
                                <option value="authority" selected>Authority</option>
                                <option value="business">Business</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Module</label>
                            <select class="form-select" id="promptModule">
                                <option value="diagnose">Diagnose</option>
                                <option value="optimize">Optimize</option>
                                <option value="find">Find</option>
                                <option value="monitor">Monitor</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Prompt Template</label>
                        <textarea class="form-textarea" id="promptTemplate" rows="12" placeholder="Write your prompt template here... Use {{variable}} for placeholders." style="font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px;"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select class="form-select" id="promptStatus">
                            <option value="active">Active</option>
                            <option value="draft">Draft</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </div>
                </form>
            </div>
            <div class="admin-modal-footer">
                <button class="btn-secondary" id="promptModalCancel">Cancel</button>
                <button class="btn-primary" id="promptModalSave">Save Prompt</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Wire modal buttons
    document.getElementById('promptModalClose').addEventListener('click', closePromptModal);
    document.getElementById('promptModalCancel').addEventListener('click', closePromptModal);
    document.getElementById('promptModalSave').addEventListener('click', savePrompt);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePromptModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') closePromptModal();
    });

    return modal;
}

// ============================================================
// MODAL ACTIONS
// ============================================================
function openPromptModal(prompt) {
    const modal = ensureModal();

    document.getElementById('promptModalTitle').textContent = prompt ? 'Edit Prompt' : 'New Prompt';
    document.getElementById('promptName').value = prompt?.name || '';
    document.getElementById('promptCategory').value = prompt?.category || 'authority';
    document.getElementById('promptModule').value = prompt?.module || 'diagnose';
    document.getElementById('promptTemplate').value = prompt?.template || '';
    document.getElementById('promptStatus').value = prompt?.status || 'active';

    currentEditId = prompt?.id || null;

    modal.style.display = 'flex';
}

function closePromptModal() {
    const modal = document.getElementById('promptModal');
    if (modal) modal.style.display = 'none';
    currentEditId = null;
}

async function savePrompt() {
    const name = document.getElementById('promptName')?.value?.trim();
    const template = document.getElementById('promptTemplate')?.value?.trim();
    const category = document.getElementById('promptCategory')?.value;
    const module = document.getElementById('promptModule')?.value;
    const status = document.getElementById('promptStatus')?.value;

    if (!name) return toast('Prompt name is required', 'error');
    if (!template) return toast('Prompt template is required', 'error');

    const payload = { name, category, module, template, status };

    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const isEdit = !!currentEditId;
        const url = isEdit
            ? `/api/admin/administrator?resource=prompts&id=${currentEditId}`
            : `/api/admin/administrator?resource=prompts`;

        const res = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        closePromptModal();
        toast(isEdit ? 'Prompt updated' : 'Prompt created', 'success');
        await loadPrompts();
    } catch (err) {
        console.error('savePrompt failed:', err);
        toast('Failed to save: ' + err.message, 'error');
    }
}

async function editPrompt(id) {
    try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch(`/api/admin/administrator?resource=prompts&id=${id}`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        openPromptModal(data.prompt);
    } catch (err) {
        console.error('editPrompt failed:', err);
        toast('Failed to load prompt', 'error');
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    // Category filter buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.category || 'all';
            loadPrompts();
        });
    });
}

// ============================================================
// HELPERS
// ============================================================
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
}

// ============================================================
// WINDOW EXPOSURE
// ============================================================
window.filterPrompts = function (cat) {
    currentFilter = cat || 'all';
    document.querySelectorAll('.category-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.category === currentFilter);
    });
    loadPrompts();
};

window.showAddPromptModal = function () {
    openPromptModal(null);
};

window.closePromptModal = closePromptModal;
window.editPrompt = editPrompt;

window.savePrompt = async function () {
    await savePrompt();
};

window.testPrompt = function (id) {
    toast('Prompt testing — not yet implemented', 'info');
};
