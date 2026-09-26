// ============================================================
// tabs/review.js - Review Tab
// ============================================================
// Handles the Review tab: loading generated content, viewing, editing, publishing.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Review tab initialized');

    await loadReviewContent();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Review tab');
    await loadReviewContent();
}

// ============================================================
// LOAD REVIEW CONTENT
// ============================================================

async function loadReviewContent() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            console.log('Not logged in');
            return;
        }

        const { data: content, error } = await supabase
            .from('content_history')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching content:', error);
            return;
        }

        const reviewGrid = document.querySelector('.review-grid');
        if (!reviewGrid) return;

        if (!content || content.length === 0) {
            reviewGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center;padding:60px;color:var(--gray-500);">
                    <div style="font-size:48px;margin-bottom:16px;">📝</div>
                    <h3>No content generated yet</h3>
                    <p>Go to <a href="/service-detail.html" style="color: var(--primary);">Services</a> to generate your first piece of content.</p>
                </div>
            `;
            return;
        }

        reviewGrid.innerHTML = content.map(item => {
            const featureName = item.feature_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const statusMap = {
                'processing': 'warning',
                'completed': 'success',
                'failed': 'danger',
                'review': 'info',
                'published': 'success'
            };
            const statusClass = statusMap[item.status] || 'warning';
            const statusLabel = item.status || 'draft';

            let contentPreview = 'No content available';
            if (item.generated_content && Array.isArray(item.generated_content) && item.generated_content.length > 0) {
                const selectedIdx = item.selected_version || 0;
                const version = item.generated_content[selectedIdx];
                contentPreview = version?.content || item.generated_content[0]?.content || 'No content available';
                if (contentPreview.length > 120) {
                    contentPreview = contentPreview.substring(0, 120) + '...';
                }
            }

            const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <div class="card review-card">
                    <div class="card-header">
                        <h3>${featureName}</h3>
                        <span class="badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <p class="review-text">"${contentPreview}"</p>
                    <div style="font-size:12px;color:var(--gray-500);margin:8px 0;">${date}</div>
                    <div class="review-actions">
                        <button class="btn-primary btn-sm" data-content-id="${item.id}" data-action="view">View</button>
                        <button class="btn-secondary btn-sm" data-content-id="${item.id}" data-action="edit">Edit</button>
                        <button class="btn-secondary btn-sm" data-content-id="${item.id}" data-action="publish">Publish</button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners to action buttons
        reviewGrid.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.contentId;
                const action = this.dataset.action;
                handleContentAction(id, action);
            });
        });

    } catch (error) {
        console.error('Error loading review content:', error);
    }
}

// ============================================================
// HANDLE CONTENT ACTIONS
// ============================================================

function handleContentAction(id, action) {
    console.log(`📝 Content action: ${action} on ${id}`);

    switch (action) {
        case 'view':
            viewContent(id);
            break;
        case 'edit':
            editContent(id);
            break;
        case 'publish':
            publishContent(id);
            break;
        default:
            console.warn('Unknown action:', action);
    }
}

// ============================================================
// VIEW CONTENT
// ============================================================

function viewContent(id) {
    console.log('View content:', id);
    // Option 1: Navigate to a detail page
    window.location.href = `dashboard.html?view=${id}`;

    // Option 2: Open a modal (if you have one)
    // showContentModal(id);

    // Option 3: Redirect to a dedicated content detail page
    // window.location.href = `/content-detail.html?id=${id}`;
}

// ============================================================
// EDIT CONTENT
// ============================================================

function editContent(id) {
    console.log('Edit content:', id);
    // This could open a modal or navigate to an edit page
    // For now, show a placeholder message
    showToast('Edit functionality coming soon.', 'info');

    // Future implementation:
    // const content = await fetchContent(id);
    // openEditModal(content);
}

// ============================================================
// PUBLISH CONTENT
// ============================================================

async function publishContent(id) {
    console.log('Publish content:', id);

    try {
        // Confirm with user
        if (!confirm('Are you sure you want to publish this content?')) return;

        // Update the content status in the database
        const { error } = await supabase
            .from('content_history')
            .update({
                status: 'published',
                published: true,
                published_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            console.error('Error publishing content:', error);
            showToast('Failed to publish content: ' + error.message, 'error');
            return;
        }

        showToast('Content published successfully! ✅', 'success');
        await refresh(supabase, user);

    } catch (error) {
        console.error('Error publishing content:', error);
        showToast('Failed to publish content. Please try again.', 'error');
    }
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW (for legacy onclick handlers)
// ============================================================

// These are kept for backward compatibility if the HTML uses onclick="viewContent('id')"
window.viewContent = viewContent;
window.editContent = editContent;
window.publishContent = publishContent;