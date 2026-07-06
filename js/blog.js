window.blogPosts = window.blogPosts || [];

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
                    date: new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                    category: 'Skincare'
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