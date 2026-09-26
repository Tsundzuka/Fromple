// ============================================================
// apply.js - Job Application Handler
// ============================================================

// ============================================================
// Get job title from URL parameter
// ============================================================
function getJobTitle() {
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get('job');
    
    if (jobParam) {
        // Decode URL parameter and display
        const decoded = decodeURIComponent(jobParam);
        document.getElementById('jobTitleDisplay').textContent = decoded;
        document.getElementById('jobPosition').value = `Job Application: ${decoded}`;
        return decoded;
    }
    
    // Default if no parameter
    return 'Position at Fromple';
}

// ============================================================
// File upload handler
// ============================================================
function setupFileUpload() {
    const fileInput = document.getElementById('resume');
    const fileNameDisplay = document.getElementById('fileName');
    const uploadArea = document.querySelector('.file-upload-area');

    if (!fileInput) return;

    // Click on upload area triggers file input
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // Update filename when file is selected
    fileInput.addEventListener('change', function(e) {
        const file = this.files[0];
        if (file) {
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            fileNameDisplay.textContent = `${file.name} (${fileSize} MB)`;
            fileNameDisplay.style.color = 'var(--success)';
        } else {
            fileNameDisplay.textContent = 'No file selected';
            fileNameDisplay.style.color = 'var(--gray-500)';
        }
    });
}

// ============================================================
// Form submission handler
// ============================================================
function setupFormSubmission() {
    const form = document.getElementById('applyForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get submit button and show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Submitting... ⏳';
        submitBtn.disabled = true;

        // Collect form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Show success message
            form.style.display = 'none';
            document.getElementById('applySuccess').style.display = 'block';

        } catch (error) {
            console.error('Error submitting application:', error);
            
            // Show error to user
            const errorMsg = document.createElement('div');
            errorMsg.className = 'apply-error';
            errorMsg.innerHTML = `
                <span>⚠️</span>
                <span>There was an error submitting your application. Please try again or email us directly at <a href="mailto:hello@fromple.ai">hello@fromple.ai</a>.</span>
            `;
            
            // Remove any existing error
            const existingError = form.querySelector('.apply-error');
            if (existingError) existingError.remove();
            
            form.prepend(errorMsg);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ============================================================
// Initialize
// ============================================================
function init() {
    getJobTitle();
    setupFileUpload();
    setupFormSubmission();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}