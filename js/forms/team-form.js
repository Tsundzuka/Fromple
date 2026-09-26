// ============================================================
// TEAM FORM - Create/Edit team members (No Supabase)
// ============================================================

import { showToast, loadList } from './content-loader.js';

export function renderForm() {
    return `
        <h2>Add Team Member</h2>
        <p class="form-subtitle">Add a new team member to your website.</p>

        <form id="teamForm" class="admin-form">
            <div class="form-row">
                <div class="form-group">
                    <label for="teamFirstName">First Name *</label>
                    <input type="text" id="teamFirstName" class="form-input" placeholder="John" required />
                </div>
                <div class="form-group">
                    <label for="teamLastName">Last Name *</label>
                    <input type="text" id="teamLastName" class="form-input" placeholder="Doe" required />
                </div>
            </div>

            <div class="form-group">
                <label for="teamRole">Job Title / Role *</label>
                <input type="text" id="teamRole" class="form-input" placeholder="CEO & Co-Founder" required />
            </div>

            <div class="form-group">
                <label for="teamBio">Biography</label>
                <textarea id="teamBio" class="form-textarea" rows="4" placeholder="Brief bio about the team member..."></textarea>
            </div>

            <div class="form-group">
                <label for="teamEmail">Email</label>
                <input type="email" id="teamEmail" class="form-input" placeholder="john@fromple.ai" />
            </div>

            <div class="form-group">
                <label for="teamAvatar">Avatar URL</label>
                <input type="url" id="teamAvatar" class="form-input" placeholder="https://example.com/avatar.jpg" />
                <span class="form-hint">Or use initials if no image is provided</span>
            </div>

            <div class="form-group">
                <label>Social Links</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;font-weight:400;color:var(--gray-500);">LinkedIn</label>
                        <input type="url" id="teamLinkedin" class="form-input" placeholder="https://linkedin.com/in/..." />
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:400;color:var(--gray-500);">Twitter/X</label>
                        <input type="url" id="teamTwitter" class="form-input" placeholder="https://twitter.com/..." />
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:400;color:var(--gray-500);">GitHub</label>
                        <input type="url" id="teamGithub" class="form-input" placeholder="https://github.com/..." />
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:400;color:var(--gray-500);">Website</label>
                        <input type="url" id="teamWebsite" class="form-input" placeholder="https://example.com" />
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="teamStatus">Status</label>
                    <select id="teamStatus" class="form-select">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="teamDisplayOrder">Display Order</label>
                    <input type="number" id="teamDisplayOrder" class="form-input" value="0" min="0" />
                    <span class="form-hint">Lower numbers appear first</span>
                </div>
            </div>

            <button type="submit" class="btn-primary btn-full">Add Team Member</button>
        </form>
    `;
}

export function init() {
    const form = document.getElementById('teamForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            const data = {
                first_name: document.getElementById('teamFirstName').value,
                last_name: document.getElementById('teamLastName').value,
                role: document.getElementById('teamRole').value,
                bio: document.getElementById('teamBio').value,
                email: document.getElementById('teamEmail').value,
                avatar_url: document.getElementById('teamAvatar').value,
                linkedin: document.getElementById('teamLinkedin').value,
                twitter: document.getElementById('teamTwitter').value,
                github: document.getElementById('teamGithub').value,
                website: document.getElementById('teamWebsite').value,
                status: document.getElementById('teamStatus').value,
                display_order: parseInt(document.getElementById('teamDisplayOrder').value) || 0,
                created_at: new Date().toISOString()
            };

            console.log('Team member added (mock):', data);
            showToast('✅ Team member added successfully!', 'success');
            form.reset();

            // Reload the list
            const event = new CustomEvent('content-saved', { detail: { type: 'team' } });
            document.dispatchEvent(event);

        } catch (error) {
            console.error('Error adding team member:', error);
            showToast('❌ Error: ' + error.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}