// ============================================================
// PACKAGE FORM - Create/Edit pricing packages (No Supabase)
// ============================================================

import { showToast, loadList } from './content-loader.js';

export function renderForm() {
    return `
        <h2>Create Pricing Package</h2>
        <p class="form-subtitle">Add a new pricing plan for your customers.</p>

        <form id="packageForm" class="admin-form">
            <div class="form-group">
                <label for="packageName">Plan Name *</label>
                <input type="text" id="packageName" class="form-input" placeholder="e.g. Professional" required />
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="packagePrice">Price *</label>
                    <input type="text" id="packagePrice" class="form-input" placeholder="R299" required />
                    <span class="form-hint">e.g. R299, $49, Free</span>
                </div>
                <div class="form-group">
                    <label for="packagePeriod">Billing Period</label>
                    <select id="packagePeriod" class="form-select">
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="one-time">One-Time</option>
                        <option value="forever">Forever (Free)</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="packageDescription">Description</label>
                <input type="text" id="packageDescription" class="form-input" placeholder="For growing businesses and creators" />
            </div>

            <div class="form-group">
                <label for="packageFeatures">Features *</label>
                <textarea id="packageFeatures" class="form-textarea" rows="8" placeholder="List each feature on a new line&#10;e.g.&#10;5 uploads/month&#10;Priority processing&#10;All platforms" required></textarea>
                <span class="form-hint">One feature per line</span>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="packageStatus">Status</label>
                    <select id="packageStatus" class="form-select">
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="packagePopular">Featured</label>
                    <select id="packagePopular" class="form-select">
                        <option value="false">No</option>
                        <option value="true">Yes (Most Popular)</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="packageButtonText">Button Text</label>
                <input type="text" id="packageButtonText" class="form-input" placeholder="Get Started" />
                <span class="form-hint">Leave blank for default: "Get Started"</span>
            </div>

            <div class="form-group">
                <label for="packageDisplayOrder">Display Order</label>
                <input type="number" id="packageDisplayOrder" class="form-input" value="0" min="0" />
                <span class="form-hint">Lower numbers appear first</span>
            </div>

            <button type="submit" class="btn-primary btn-full">Create Package</button>
        </form>
    `;
}

export function init() {
    const form = document.getElementById('packageForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Creating...';
        btn.disabled = true;

        try {
            // Parse features from textarea (one per line)
            const featuresText = document.getElementById('packageFeatures').value;
            const features = featuresText.split('\n')
                .map(f => f.trim())
                .filter(f => f.length > 0);

            const data = {
                name: document.getElementById('packageName').value,
                price: document.getElementById('packagePrice').value,
                period: document.getElementById('packagePeriod').value,
                description: document.getElementById('packageDescription').value,
                features: features,
                status: document.getElementById('packageStatus').value,
                popular: document.getElementById('packagePopular').value === 'true',
                button_text: document.getElementById('packageButtonText').value || 'Get Started',
                display_order: parseInt(document.getElementById('packageDisplayOrder').value) || 0,
                created_at: new Date().toISOString()
            };

            console.log('Package created (mock):', data);
            showToast('✅ Package created successfully!', 'success');
            form.reset();

            // Reload the list
            const event = new CustomEvent('content-saved', { detail: { type: 'package' } });
            document.dispatchEvent(event);

        } catch (error) {
            console.error('Error creating package:', error);
            showToast('❌ Error: ' + error.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}