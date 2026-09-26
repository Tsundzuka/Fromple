// ============================================================
// CAREER FORM - Create/Edit job posts (No Supabase)
// ============================================================

import { showToast, loadList } from './content-loader.js';

export function renderForm() {
    return `
        <h2>Create New Career Post</h2>
        <p class="form-subtitle">Post a new job opening.</p>

        <form id="careerForm" class="admin-form">
            <div class="form-group">
                <label for="careerTitle">Job Title *</label>
                <input type="text" id="careerTitle" class="form-input" placeholder="e.g. Senior Full Stack Developer" required />
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="careerDepartment">Department</label>
                    <select id="careerDepartment" class="form-select">
                        <option value="Engineering">Engineering</option>
                        <option value="Design">Design</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Sales">Sales</option>
                        <option value="Customer Success">Customer Success</option>
                        <option value="Operations">Operations</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="careerLocation">Location</label>
                    <select id="careerLocation" class="form-select">
                        <option value="Remote">Remote</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-site">On-site</option>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="careerType">Employment Type</label>
                    <select id="careerType" class="form-select">
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="careerStatus">Status</label>
                    <select id="careerStatus" class="form-select">
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="careerDescription">Job Description *</label>
                <textarea id="careerDescription" class="form-textarea" rows="8" placeholder="Describe the role, responsibilities, and what makes it exciting..." required></textarea>
            </div>

            <div class="form-group">
                <label for="careerRequirements">Requirements</label>
                <textarea id="careerRequirements" class="form-textarea" rows="6" placeholder="List the skills, experience, and qualifications needed..."></textarea>
            </div>

            <div class="form-group">
                <label for="careerSalary">Salary Range</label>
                <input type="text" id="careerSalary" class="form-input" placeholder="e.g. R40,000 - R60,000/month" />
            </div>

            <button type="submit" class="btn-primary btn-full">Post Job</button>
        </form>
    `;
}

export function init() {
    const form = document.getElementById('careerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Posting...';
        btn.disabled = true;

        try {
            const data = {
                title: document.getElementById('careerTitle').value,
                department: document.getElementById('careerDepartment').value,
                location: document.getElementById('careerLocation').value,
                type: document.getElementById('careerType').value,
                status: document.getElementById('careerStatus').value,
                description: document.getElementById('careerDescription').value,
                requirements: document.getElementById('careerRequirements').value,
                salary: document.getElementById('careerSalary').value,
                created_at: new Date().toISOString()
            };

            console.log('Career post saved (mock):', data);
            showToast('✅ Job posted successfully!', 'success');
            form.reset();

            const event = new CustomEvent('content-saved', { detail: { type: 'career' } });
            document.dispatchEvent(event);

        } catch (error) {
            console.error('Error posting job:', error);
            showToast('❌ Error: ' + error.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}