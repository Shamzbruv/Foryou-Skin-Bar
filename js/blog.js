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
window.journalSettings = {
    hero_eyebrow: 'Education by Foryou Skin Bar',
    hero_title: 'Foryou Skin Journal',
    hero_tagline: 'Healthy Skin. Real Knowledge. Lasting Confidence.',
    hero_description: 'Trusted skincare education from Foryou Skin Bar, written to help you understand your skin and make informed routine choices.',
    hero_image_url: 'assets/blog/blog_science.png',
    manifesto_eyebrow: 'Editorial Manifesto',
    manifesto_title: 'Knowledge should make skincare feel clearer.',
    manifesto_body_1: 'The Foryou Skin Journal is an educational centre for thoughtful, practical skincare. We explain concerns without shame, ingredients without hype, and routines without unnecessary complexity.',
    manifesto_body_2: 'Our articles are organized as guided reading: begin with a foundation, follow the supporting articles, and return as the library grows. We cite reputable health sources, distinguish education from medical care, and write with melanin-rich skin and Jamaican life in mind.',
    weekly_eyebrow: 'Fresh Reading', weekly_title: 'New This Week', weekly_description: 'Four focused answers to questions readers ask most.', weekly_limit: 4,
    topics_eyebrow: 'Find Your Path', topics_title: 'Browse by Topic',
    foundation_eyebrow: 'Start Here', foundation_title: 'Foundation Guides', foundation_description: "Long-form guides that anchor the Journal's learning paths.", foundation_limit: 3,
    library_eyebrow: 'Explore Everything', library_title: 'The Article Library',
    cta_eyebrow: 'Continue Learning', cta_title: 'New education, delivered thoughtfully.', cta_description: 'Join Glow Letters for new Journal articles, practical routines, and considered product updates.', cta_button_text: 'Join Glow Letters', cta_button_url: '#newsletterForm'
};

window.loadJournalSettings = async function() {
    if (window.journalSettingsLoaded) return window.journalSettings;
    if (window.supabase) {
        try {
            const { data, error } = await window.supabase.from('site_content').select('value').eq('key', 'journal_page').maybeSingle();
            if (!error && data?.value && typeof data.value === 'object') {
                window.journalSettings = { ...window.journalSettings, ...data.value };
                const configuredTopics = new Map((Array.isArray(data.value.topics) ? data.value.topics : []).map(topic => [topic.slug, String(topic.name || '').trim()]));
                window.journalTopics = window.journalTopics.map(topic => ({ ...topic, name: configuredTopics.get(topic.slug) || topic.name }));
            }
        } catch (error) {
            console.error('Error fetching Journal settings from Supabase:', error);
        }
    }
    window.journalSettingsLoaded = true;
    return window.journalSettings;
};

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
                    journalSortOrder: Number.isFinite(Number(post.journal_sort_order)) ? Number(post.journal_sort_order) : 100,
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
