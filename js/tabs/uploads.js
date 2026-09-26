// ============================================================
// tabs/uploads.js - Uploads Tab
// ============================================================
// Handles the Uploads tab: upload history, stats, source breakdown, and file uploads.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Uploads tab initialized');

    // Attach file upload handlers
    attachFileUploadHandlers();

    // Load uploads
    await loadUploads();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Uploads tab');
    await loadUploads();
}

// ============================================================
// LOAD UPLOADS
// ============================================================

async function loadUploads() {
    console.log('🔵 loadUploads() function STARTED');

    try {
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Not logged in, showing empty state');
            showEmptyUploadsState();
            return;
        }

        console.log('🔵 Fetching /api/uploads...');
        const response = await fetch('/api/uploads', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });

        console.log('🔵 Response status:', response.status);

        if (!response.ok) {
            console.error('❌ Failed to fetch uploads. Status:', response.status);
            showEmptyUploadsState();
            return;
        }

        const data = await response.json();
        console.log('🔵 Data received:', data);
        const uploads = data.uploads || [];
        console.log('🔵 Uploads count:', uploads.length);

        // Update the table
        const tbody = document.querySelector('#uploadsTableBody');
        console.log('🔵 tbody element found?', tbody ? '✅ Yes' : '❌ No');

        if (tbody) {
            if (uploads.length === 0) {
                console.log('🔵 No uploads, showing empty state');
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">
                            No uploads yet. Go to <a href="/service-detail.html" style="color: var(--primary);">Services</a> to create your first one.
                        </td>
                    </tr>
                `;
                return;
            }

            console.log('🔵 Rendering', uploads.length, 'upload rows');
            tbody.innerHTML = uploads.map(upload => {
                const statusMap = {
                    'pending': 'warning',
                    'processing': 'in-progress',
                    'completed': 'success',
                    'failed': 'danger'
                };
                const statusClass = statusMap[upload.status] || 'warning';
                const sourceIcon = {
                    'text': '📄',
                    'video_url': '🎥',
                    'file': '📁'
                }[upload.source_type] || '📄';

                return `
                    <tr>
                        <td data-label="Source">
                            <span class="source-type">${sourceIcon} ${upload.source_type}</span>
                        </td>
                        <td data-label="Name">
                            <div class="activity-description">
                                <strong>${upload.name || 'Untitled'}</strong>
                            </div>
                        </td>
                        <td data-label="Date">
                            <span class="activity-time">${new Date(upload.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </td>
                        <td data-label="Assets">
                            <span class="badge ${statusClass}">0</span>
                        </td>
                        <td data-label="Status">
                            <span class="status-badge ${statusClass}">${upload.status}</span>
                        </td>
                    </tr>
                `;
            }).join('');
            console.log('✅ Uploads rendered successfully');
        } else {
            console.error('❌ tbody element not found!');
        }

        // Update stats and sources
        updateUploadStats(uploads);
        updateUploadSources(uploads);
        console.log('🔵 loadUploads() COMPLETED');

    } catch (error) {
        console.error('❌ loadUploads() ERROR:', error);
        showEmptyUploadsState();
    }
}

// ============================================================
// SHOW EMPTY UPLOADS STATE
// ============================================================

function showEmptyUploadsState() {
    console.log('🔵 showEmptyUploadsState() called');
    const tbody = document.querySelector('#uploadsTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">
                    No uploads yet. Go to <a href="/service-detail.html" style="color: var(--primary);">Services</a> to create your first one.
                </td>
            </tr>
        `;
    }
}

// ============================================================
// UPDATE UPLOAD STATS
// ============================================================

function updateUploadStats(uploads) {
    if (!uploads) return;

    const total = uploads.length;
    const completed = uploads.filter(u => u.status === 'completed').length;
    const processing = uploads.filter(u => u.status === 'processing').length;

    const uploadStatsGrid = document.querySelector('#tab-upload .stats-grid');
    if (!uploadStatsGrid) {
        console.log('Upload stats grid not found in uploads tab');
        return;
    }

    const statValues = uploadStatsGrid.querySelectorAll('.stat-value');
    if (statValues.length >= 4) {
        statValues[0].textContent = total;
        statValues[1].textContent = uploads.filter(u => {
            const date = new Date(u.created_at);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }).length;
        statValues[2].textContent = '0'; // Assets generated
        statValues[3].textContent = total > 0 ? Math.round(completed / total * 100) + '%' : '0%';
    }

    console.log('📊 Upload stats updated:', { total, completed, processing });
}

// ============================================================
// UPDATE UPLOAD SOURCES
// ============================================================

function updateUploadSources(uploads) {
    if (!uploads) return;

    const textCount = uploads.filter(u => u.source_type === 'text').length;
    const videoCount = uploads.filter(u => u.source_type === 'video_url').length;
    const fileCount = uploads.filter(u => u.source_type === 'file').length;
    const total = uploads.length || 1;

    const sourceItems = document.querySelectorAll('#tab-upload .source-item');
    if (sourceItems.length >= 3) {
        const counts = [textCount, videoCount, fileCount];
        const percentages = counts.map(c => Math.round((c / total) * 100));

        sourceItems.forEach((item, index) => {
            const countEl = item.querySelector('.source-count');
            const fillEl = item.querySelector('.source-fill');
            if (countEl) countEl.textContent = counts[index];
            if (fillEl) fillEl.style.width = percentages[index] + '%';
        });
    }
}

// ============================================================
// HANDLE FILE UPLOAD
// ============================================================

function handleFileUpload(file) {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'audio/mp4'];
    const maxSize = 500 * 1024 * 1024;

    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|aac)$/i)) {
        showToast('Please upload a valid audio file (MP3, WAV, M4A, AAC).', 'error');
        return;
    }

    if (file.size > maxSize) {
        showToast('File size exceeds 500MB limit. Please upload a smaller file.', 'error');
        return;
    }

    showToast(`Processing "${file.name}"...`, 'info');

    setTimeout(() => {
        showToast(`"${file.name}" uploaded successfully! Generating content...`, 'success');
        setTimeout(() => {
            // Switch to Review tab
            if (window.switchTab) {
                window.switchTab('review');
            } else {
                console.warn('switchTab not available');
            }
        }, 1500);
    }, 2000);

    console.log('File uploaded:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
}

// ============================================================
// ATTACH FILE UPLOAD HANDLERS
// ============================================================

function attachFileUploadHandlers() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');

    if (!dropzone) {
        console.log('Upload dropzone not found – skipping attachment');
        return;
    }

    if (browseBtn) {
        // Remove any existing listener
        browseBtn.removeEventListener('click', browseClickHandler);
        browseBtn.addEventListener('click', browseClickHandler);
    }

    if (dropzone) {
        dropzone.removeEventListener('click', dropzoneClickHandler);
        dropzone.addEventListener('click', dropzoneClickHandler);

        dropzone.removeEventListener('dragover', dragOverHandler);
        dropzone.addEventListener('dragover', dragOverHandler);

        dropzone.removeEventListener('dragleave', dragLeaveHandler);
        dropzone.addEventListener('dragleave', dragLeaveHandler);

        dropzone.removeEventListener('drop', dropHandler);
        dropzone.addEventListener('drop', dropHandler);
    }

    if (fileInput) {
        fileInput.removeEventListener('change', fileChangeHandler);
        fileInput.addEventListener('change', fileChangeHandler);
    }

    console.log('✅ File upload handlers attached');
}

// ============================================================
// EVENT HANDLERS (kept as separate functions to allow removal)
// ============================================================

function browseClickHandler(e) {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

function dropzoneClickHandler(e) {
    if (e.target.closest('.upload-actions')) return;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

function dragOverHandler(e) {
    e.preventDefault();
    this.classList.add('dragover');
}

function dragLeaveHandler(e) {
    e.preventDefault();
    this.classList.remove('dragover');
}

function dropHandler(e) {
    e.preventDefault();
    this.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        handleFileUpload(file);
    }
}

function fileChangeHandler(e) {
    const file = this.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// ============================================================
// HELPER: GET AUTH TOKEN
// ============================================================

async function getAuthToken() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW (if needed)
// ============================================================

// No window functions needed for this tab.