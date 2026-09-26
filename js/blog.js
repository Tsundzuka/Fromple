// ============================================================
// blog.js - Blog Card Component (With Sample Data)
// ============================================================

// ============================================================
// SAMPLE BLOG DATA (Remove when database is connected)
// ============================================================
const SAMPLE_BLOGS = [
    {
        id: '1',
        slug: 'the-80-20-content-rule',
        title: 'The 80/20 Content Rule: How to Generate 10+ Assets from One Recording',
        excerpt: 'Learn how to maximize your content output by repurposing one piece of content across 10+ platforms.',
        category: 'Content Strategy',
        published_at: 'May 15, 2026',
        read_time_minutes: 8,
        featured: true,
        featured_image: '',
        content: 'Full blog content goes here...'
    },
    {
        id: '2',
        slug: 'how-ai-is-revolutionizing-content-creation',
        title: 'How AI is Revolutionizing Content Creation',
        excerpt: 'Explore the latest AI technologies transforming how we create and distribute content.',
        category: 'AI Technology',
        published_at: 'May 10, 2026',
        read_time_minutes: 6,
        featured: false,
        featured_image: '',
        content: 'Full blog content goes here...'
    },
    {
        id: '3',
        slug: 'measuring-content-roi',
        title: 'Measuring Content ROI: What Actually Matters',
        excerpt: 'Beyond likes and shares—how to track content that drives real business results.',
        category: 'Analytics',
        published_at: 'May 5, 2026',
        read_time_minutes: 5,
        featured: false,
        featured_image: '',
        content: 'Full blog content goes here...'
    },
    {
        id: '4',
        slug: 'building-authority-through-consistent-content',
        title: 'Building Authority Through Consistent Content',
        excerpt: 'Why consistency matters more than perfection in building thought leadership.',
        category: 'Brand Building',
        published_at: 'Apr 28, 2026',
        read_time_minutes: 7,
        featured: false,
        featured_image: '',
        content: 'Full blog content goes here...'
    },
    {
        id: '5',
        slug: 'social-media-trends-2026',
        title: '10 Social Media Trends You Can\'t Ignore in 2026',
        excerpt: 'Stay ahead of the curve with these emerging social media trends and strategies.',
        category: 'Social Media',
        published_at: 'Apr 20, 2026',
        read_time_minutes: 9,
        featured: false,
        featured_image: '',
        content: 'Full blog content goes here...'
    },
    {
        id: '6',
        slug: 'scaling-content-without-burnout',
        title: 'Scaling Your Content Operation Without Burnout',
        excerpt: 'How to produce more content while maintaining quality and sanity.',
        category: 'Growth',
        published_at: 'Apr 15, 2026',
        read_time_minutes: 6,
        featured: false,
        featured_image: '',
        content: 'Full blog content goes here...'
    }
];

// ============================================================
// Render a single blog card
// ============================================================
function renderBlogCard(blog) {
    const featuredClass = blog.featured ? 'featured' : '';
    const imageHtml = blog.featured_image 
        ? `<img src="${blog.featured_image}" alt="${blog.title}" class="blog-card-image-img" />`
        : `<div class="blog-card-icon">📄</div>`;

    const linkUrl = blog.slug 
        ? `blog-post.html?slug=${blog.slug}` 
        : `blog-post.html?id=${blog.id}`;

    return `
        <a href="${linkUrl}" class="blog-card ${featuredClass}">
            <div class="blog-card-image">
                ${imageHtml}
            </div>
            <span class="blog-category">${blog.category || 'General'}</span>
            <h2>${blog.title}</h2>
            <p>${blog.excerpt || ''}</p>
            <div class="blog-meta">
                <span>${blog.published_at || blog.created_at || ''}</span>
                <span>${blog.read_time_minutes || '5'} min read</span>
            </div>
        </a>
    `;
}

// ============================================================
// Render all blog cards
// ============================================================
function renderBlogCards(blogs) {
    if (!blogs || blogs.length === 0) {
        return `
            <div class="blog-empty">
                <p>No blog posts found. Check back soon!</p>
            </div>
        `;
    }

    const sorted = [...blogs].sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return 0;
    });

    return sorted.map(renderBlogCard).join('');
}

// ============================================================
// Load blog posts (uses sample data until database is ready)
// ============================================================
async function loadBlogPosts() {
    const container = document.getElementById('blogGrid');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="blog-loading">
            <div class="spinner"></div>
            <p>Loading articles...</p>
        </div>
    `;

    try {
        // Try to fetch from API first
        const response = await fetch('/api/blogs');
        
        if (response.ok) {
            const data = await response.json();
            const blogs = data.blogs || data || [];
            
            if (blogs.length > 0) {
                container.innerHTML = renderBlogCards(blogs);
                return;
            }
        }
        
        // If API fails or returns empty, use sample data
        console.log('Using sample blog data (database not connected yet)');
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        container.innerHTML = renderBlogCards(SAMPLE_BLOGS);

    } catch (error) {
        console.log('API not available, using sample data');
        // Use sample data if API fails
        await new Promise(resolve => setTimeout(resolve, 500));
        container.innerHTML = renderBlogCards(SAMPLE_BLOGS);
    }
}

// ============================================================
// Auto-initialize when DOM is ready
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBlogPosts);
} else {
    loadBlogPosts();
}