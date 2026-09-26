// ============================================================
// SAMPLE BLOG DATA (Same as blog.js)
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
        content: `
            <p>Content repurposing is the secret weapon of top creators. Instead of creating content from scratch every day, they record once and publish everywhere.</p>
            
            <h2>What is the 80/20 Content Rule?</h2>
            
            <p>The 80/20 rule suggests that 80% of your results come from 20% of your efforts. In content creation, this means focusing on one high-quality recording and repurposing it into 10+ pieces of content.</p>
            
            <h2>How to Apply It</h2>
            
            <ol>
                <li><strong>Record once</strong> — Record a podcast, webinar, or interview</li>
                <li><strong>Transcribe</strong> — Use AI to get a text version</li>
                <li><strong>Repurpose</strong> — Turn it into posts, articles, newsletters, carousels, and more</li>
                <li><strong>Schedule</strong> — Spread it across 7 days on all platforms</li>
            </ol>
            
            <blockquote>
                <p>"One recording, 10+ pieces of content, 20+ hours saved."</p>
            </blockquote>
            
            <p>That's the power of AI-powered content repurposing.</p>
        `
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
        content: `
            <p>Artificial Intelligence is fundamentally changing how content is created, distributed, and consumed.</p>
            
            <h2>The AI Content Revolution</h2>
            
            <p>AI tools are now capable of generating high-quality content that rivals human creators. From blog posts to social media captions, AI is becoming an essential tool in every content creator's toolkit.</p>
            
            <h2>Key Technologies</h2>
            
            <ul>
                <li><strong>Natural Language Processing (NLP):</strong> Understanding and generating human-like text</li>
                <li><strong>Machine Learning:</strong> Improving content quality through pattern recognition</li>
                <li><strong>Computer Vision:</strong> Generating and enhancing visual content</li>
                <li><strong>Speech Recognition:</strong> Transcribing audio to text for repurposing</li>
            </ul>
            
            <p>The future of content creation is hybrid — human creativity combined with AI efficiency.</p>
        `
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
        content: `
            <p>Content marketing is a significant investment. But how do you know if it's actually working?</p>
            
            <h2>Beyond Vanity Metrics</h2>
            
            <p>Likes, shares, and followers are nice, but they don't pay the bills. True content ROI comes from metrics that tie directly to business outcomes.</p>
            
            <h2>What to Measure</h2>
            
            <ul>
                <li><strong>Lead Generation:</strong> How many leads did your content generate?</li>
                <li><strong>Conversion Rate:</strong> What percentage of visitors took action?</li>
                <li><strong>Customer Acquisition Cost:</strong> How much does it cost to acquire a customer through content?</li>
                <li><strong>Customer Lifetime Value:</strong> How much revenue do content-acquired customers generate?</li>
            </ul>
            
            <p>Track these metrics to prove the true value of your content strategy.</p>
        `
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
        content: `
            <p>Consistency is the secret weapon of every thought leader.</p>
            
            <h2>Why Consistency Matters</h2>
            
            <p>People trust brands that show up consistently. When you publish regularly, you build familiarity, trust, and authority in your niche.</p>
            
            <h2>How to Be Consistent</h2>
            
            <ul>
                <li><strong>Create a Content Calendar:</strong> Plan your content in advance</li>
                <li><strong>Repurpose Content:</strong> Get more mileage from each piece</li>
                <li><strong>Use AI Tools:</strong> Automate the heavy lifting</li>
                <li><strong>Batch Create:</strong> Produce multiple pieces in one session</li>
            </ul>
            
            <p>Consistency beats perfection every time.</p>
        `
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
        content: `
            <p>Social media is evolving faster than ever. Here are 10 trends you need to know in 2026.</p>
            
            <h2>Top Trends</h2>
            
            <ul>
                <li><strong>AI-Generated Content:</strong> More brands using AI for social content</li>
                <li><strong>Video-First Strategy:</strong> Short-form video dominates</li>
                <li><strong>Social Commerce:</strong> Shopping directly on social platforms</li>
                <li><strong>Community Building:</strong> Focus on engagement over reach</li>
                <li><strong>Personalization:</strong> Tailored content for specific audiences</li>
                <li><strong>User-Generated Content:</strong> Leveraging your audience</li>
                <li><strong>Interactive Content:</strong> Polls, quizzes, and AR experiences</li>
                <li><strong>Social SEO:</strong> Optimizing for platform search</li>
                <li><strong>Micro-Influencers:</strong> Smaller, more engaged audiences</li>
                <li><strong>Sustainability:</strong> Brands with purpose win</li>
            </ul>
            
            <p>Stay ahead by embracing these trends early.</p>
        `
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
        content: `
            <p>Scaling content is the ultimate challenge. Here's how to do it without burning out.</p>
            
            <h2>The Scaling Challenge</h2>
            
            <p>As demand for content grows, so does the pressure on your team. Without the right systems, you risk burnout and quality decline.</p>
            
            <h2>Strategies for Sustainable Scaling</h2>
            
            <ul>
                <li><strong>Repurpose Everything:</strong> One asset becomes 10+ pieces</li>
                <li><strong>Automate Where Possible:</strong> Use AI for research, writing, and distribution</li>
                <li><strong>Build a Content System:</strong> Standardized processes for every step</li>
                <li><strong>Set Realistic Goals:</strong> Quality over quantity</li>
                <li><strong>Delegate and Outsource:</strong> Don't do everything yourself</li>
                <li><strong>Take Breaks:</strong> Rest is essential for creativity</li>
            </ul>
            
            <p>Scale smart, not hard.</p>
        `
    }
];

// ============================================================
// Get post identifier from URL
// ============================================================
function getPostIdentifier() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const slug = params.get('slug');
    return { id, slug };
}

// ============================================================
// Update social share links
// ============================================================
function updateShareLinks(title) {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out: ${title}`);
    
    const linkedinBtn = document.querySelector('.share-btn.linkedin');
    const twitterBtn = document.querySelector('.share-btn.twitter');
    const facebookBtn = document.querySelector('.share-btn.facebook');
    const copyBtn = document.querySelector('.share-btn.copy');
    
    if (linkedinBtn) {
        linkedinBtn.href = `https://linkedin.com/sharing/share-offscreen/?url=${url}`;
    }
    if (twitterBtn) {
        twitterBtn.href = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    }
    if (facebookBtn) {
        facebookBtn.href = `https://facebook.com/sharer/sharer.php?u=${url}`;
    }
    if (copyBtn) {
        copyBtn.onclick = function(e) {
            e.preventDefault();
            navigator.clipboard.writeText(window.location.href).then(function() {
                alert('Link copied to clipboard!');
            }).catch(function() {
                // Fallback for older browsers
                const dummy = document.createElement('input');
                document.body.appendChild(dummy);
                dummy.value = window.location.href;
                dummy.select();
                document.execCommand('copy');
                document.body.removeChild(dummy);
                alert('Link copied to clipboard!');
            });
        };
    }
}

// ============================================================
// Load blog post (uses sample data until database is ready)
// ============================================================
async function loadBlogPost() {
    const { id, slug } = getPostIdentifier();
    const loading = document.getElementById('postLoading');
    const error = document.getElementById('postError');
    const content = document.getElementById('postContent');
    const related = document.getElementById('relatedPosts');

    if (!id && !slug) {
        loading.style.display = 'none';
        error.style.display = 'block';
        return;
    }

    try {
        // Try API first
        let apiUrl = '/api/blogs';
        if (id) apiUrl += `?id=${id}`;
        else if (slug) apiUrl += `?slug=${slug}`;

        const response = await fetch(apiUrl);
        let post = null;

        if (response.ok) {
            const data = await response.json();
            post = data;
        }

        // If API fails, use sample data
        if (!post) {
            post = SAMPLE_BLOGS.find(function(b) {
                return (id && b.id === id) || (slug && b.slug === slug);
            });
        }

        if (!post) {
            loading.style.display = 'none';
            error.style.display = 'block';
            return;
        }

        // Display the post
        document.getElementById('postTitle').textContent = post.title;
        document.getElementById('postCategory').textContent = post.category || 'General';
        document.getElementById('postAuthor').textContent = post.author_name || 'Fromple Team';
        document.getElementById('postDate').textContent = post.published_at || post.created_at || 'Unknown date';
        document.getElementById('postReadTime').textContent = (post.read_time_minutes || 5) + ' min read';

        const featuredImage = document.getElementById('postFeaturedImage');
        if (post.featured_image) {
            featuredImage.innerHTML = '<img src="' + post.featured_image + '" alt="' + post.title + '" />';
            featuredImage.style.display = 'block';
        } else {
            featuredImage.style.display = 'none';
        }

        document.getElementById('postBody').innerHTML = post.content || '<p>No content available.</p>';
        document.title = 'Fromple - ' + post.title;

        // Tags
        const tagsContainer = document.getElementById('postTags');
        if (post.tags && post.tags.length > 0) {
            var tagsHtml = '<span class="tag-label">Tags:</span> ';
            tagsHtml += post.tags.map(function(t) {
                return '<span class="tag-pill">' + t + '</span>';
            }).join('');
            tagsContainer.innerHTML = tagsHtml;
            tagsContainer.style.display = 'block';
        } else {
            tagsContainer.style.display = 'none';
        }

        loading.style.display = 'none';
        content.style.display = 'block';
        related.style.display = 'block';

        // Load related posts from sample data
        loadRelatedPosts(post.category, post.id);

        updateShareLinks(post.title);

    } catch (error) {
        console.error('Error loading blog post:', error);
        loading.style.display = 'none';
        error.style.display = 'block';
    }
}

// ============================================================
// Load related posts from sample data
// ============================================================
function loadRelatedPosts(category, currentId) {
    var relatedSection = document.getElementById('relatedPosts');
    var relatedGrid = document.getElementById('relatedPostsGrid');

    var related = SAMPLE_BLOGS
        .filter(function(p) {
            return p.id !== currentId && p.category === category;
        })
        .slice(0, 3);

    if (related.length === 0) {
        relatedSection.style.display = 'none';
        return;
    }

    relatedGrid.innerHTML = related.map(function(post) {
        return '<a href="blog-post.html?slug=' + (post.slug || post.id) + '" class="related-post-card">' +
            '<h4>' + post.title + '</h4>' +
            '<p>' + (post.excerpt || '') + '</p>' +
            '<span class="related-post-date">' + (post.published_at || 'Unknown date') + '</span>' +
            '</a>';
    }).join('');

    relatedSection.style.display = 'block';
}

// ============================================================
// Auto-initialize when DOM is ready
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBlogPost);
} else {
    loadBlogPost();
}