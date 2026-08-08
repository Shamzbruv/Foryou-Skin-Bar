window.blogPosts = window.blogPosts || [];
window.journalTopics = [
    { slug: 'acne', name: 'Acne' },
    { slug: 'dark-spots-hyperpigmentation', name: 'Dark Spots & Hyperpigmentation' },
    { slug: 'skincare-routines', name: 'Skincare Routines' },
    { slug: 'ingredients-library', name: 'Ingredients Library' },
    { slug: 'healthy-skin', name: 'Healthy Skin' },
    { slug: 'skin-school', name: 'Skin School' },
    { slug: 'jamaican-skincare', name: 'Jamaican Skincare' }
];

function estimateReadingTime(content = '') {
    const text = String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return Math.max(1, Math.ceil((text ? text.split(' ').length : 0) / 220));
}

window.loadBlogPosts = async function() {
    if (window.blogPosts.length > 0 && window.blogPosts[0].slug) return window.blogPosts;
    
    let loadedFromDb = false;
    if (window.supabase) {
        try {
            const { data, error } = await window.supabase
                .from('blog_posts')
                .select('*')
                .eq('status', 'published')
                .order('published_at', { ascending: false });
                
            if (!error && data && data.length > 0) {
                window.blogPosts = data.map(post => ({
                    id: post.id,
                    title: post.title,
                    slug: post.slug,
                    excerpt: post.excerpt || '',
                    content: post.content || '',
                    image: post.featured_image_url || 'https://placehold.co/600x400/F5EDE1/8B5A2B?text=No+Image',
                    date: post.published_at || post.created_at,
                    publishedAt: post.published_at || post.created_at,
                    updatedAt: post.updated_at || post.published_at || post.created_at,
                    viewCount: Number(post.view_count) || 0,
                    primaryTopic: post.primary_topic || 'healthy-skin',
                    category: (window.journalTopics.find(topic => topic.slug === post.primary_topic) || {}).name || 'Healthy Skin',
                    articleType: post.article_type || 'guide',
                    isNewThisWeek: Boolean(post.is_new_this_week),
                    isFeatured: Boolean(post.is_featured),
                    readingTimeMinutes: Number(post.reading_time_minutes) || estimateReadingTime(post.content),
                    relatedPostSlugs: Array.isArray(post.related_post_slugs) ? post.related_post_slugs : []
                }));
                loadedFromDb = true;
            }
        } catch (err) {
            console.error("Error fetching blog posts from Supabase:", err);
        }
    }
    
    if (!loadedFromDb) {
        // Fallback to original data by dynamically loading the script
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'js/blog.original.js';
            script.onload = () => resolve(window.blogPosts);
            script.onerror = () => resolve([]);
            document.head.appendChild(script);
        });
    }
    
    return window.blogPosts;
};
