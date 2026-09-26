// ============================================================
// ASSET FORM - Upload new assets (No Supabase)
// ============================================================

import { showToast, loadList } from './content-loader.js';

export function renderForm() {
    return `
        <h2>Upload New Asset</h2>
        <p class="form-subtitle">Upload audio recordings to generate content.</p>

        <form id="assetForm" class="admin-form">
            <div class="form-group">
                <label for="assetTitle">Asset Title *</label>
                <input type="text" id="assetTitle" class="form-input" placeholder="e.g. Masterclass Recording" required />
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="assetType">Asset Type</label>
                    <select id="assetType" class="form-select">
                        <option value="podcast">Podcast</option>
                        <option value="webinar">Webinar</option>
                        <option value="interview">Interview</option>
                        <option value="presentation">Presentation</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="assetStatus">Status</label>
                    <select id="assetStatus" class="form-select">
                        <option value="uploading">Uploading</option>
                        <option value="processing">Processing</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="assetFile">Audio File *</label>
                <input type="file" id="assetFile" class="form-input" accept=".mp3,.wav,.m4a,.aac" required />
                <span class="form-hint">Supported: MP3, WAV, M4A, AAC (Max 500MB)</span>
            </div>

            <div class="form-group">
                <label for="assetDescription">Description</label>
                <textarea id="assetDescription" class="form-textarea" rows="4" placeholder="Brief description of this recording..."></textarea>
            </div>

            <div class="form-group">
                <label for="assetDuration">Duration (minutes)</label>
                <input type="number" id="assetDuration" class="form-input" placeholder="e.g. 45" min="1" />
            </div>

            <button type="submit" class="btn-primary btn-full">Upload Asset</button>
        </form>
    `;
}

export function init() {
    const form = document.getElementById('assetForm');
    if (!form) return;

    // Update file input display
    const fileInput = document.getElementById('assetFile');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const titleInput = document.getElementById('assetTitle');
                if (!titleInput.value) {
                    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
                }
                const durationInput = document.getElementById('assetDuration');
                if (!durationInput.value) {
                    // Estimate duration based on file size (rough)
                    const estimatedMinutes = Math.round(file.size / (1024 * 1024 * 1.2));
                    if (estimatedMinutes > 0) {
                        durationInput.value = estimatedMinutes;
                    }
                }
                showToast(`📁 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`, 'info');
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Uploading...';
        btn.disabled = true;

        try {
            const fileInput = document.getElementById('assetFile');
            const file = fileInput.files[0];

            if (!file) {
                showToast('❌ Please select a file to upload.', 'error');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }

            // Simulate file upload
            const fakeFileUrl = URL.createObjectURL(file);

            const data = {
                file_name: document.getElementById('assetTitle').value || file.name,
                file_url: fakeFileUrl,
                file_size: file.size,
                type: document.getElementById('assetType').value,
                status: document.getElementById('assetStatus').value,
                description: document.getElementById('assetDescription').value,
                duration: parseInt(document.getElementById('assetDuration').value) || null,
                created_at: new Date().toISOString()
            };

            console.log('Asset uploaded (mock):', data);

            showToast('✅ Asset uploaded successfully!', 'success');
            form.reset();

            // Reload the list
            const event = new CustomEvent('content-saved', { detail: { type: 'asset' } });
            document.dispatchEvent(event);

        } catch (error) {
            console.error('Error uploading asset:', error);
            showToast('❌ Error: ' + error.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}