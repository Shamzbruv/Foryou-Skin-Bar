// Products data will be populated from Supabase
window.productsData = [];

window.loadProductsData = async function() {
    if (window.productsData.length > 0) return window.productsData;

    if (!window.supabase) {
        console.error("Supabase client not loaded.");
        return [];
    }


    try {
        const { data, error } = await window.supabase
            .from('products')
            .select('*, categories(name), product_images(image_url, sort_order, is_primary), product_tags(name, type), product_variants(*), product_info_sections(*), product_concerns(concern_slug), product_ingredients(ingredient_name), product_recommendation_profiles(*), product_reviews(rating, approved)')
            .eq('status', 'active');

        if (error) throw error;

        window.productsData = (data || []).map(p => {
            const tags = p.product_tags || [];
            const productPrice = Number(p.price_jmd || 0);
            const images = (p.product_images || [])
                .filter(img => img && img.image_url)
                .sort((a, b) => {
                    if (a.is_primary && !b.is_primary) return -1;
                    if (!a.is_primary && b.is_primary) return 1;
                    return (a.sort_order || 0) - (b.sort_order || 0);
                })
                .map(img => img.image_url);

            const variants = (p.product_variants || [])
                .filter(v => v.is_active !== false)
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map(v => ({
                    id: v.id,
                    name: v.name,
                    sku: v.sku || '',
                    price: Number(v.price_jmd || productPrice || 0),
                    compareAtPrice: v.compare_at_price_jmd ? Number(v.compare_at_price_jmd) : null,
                    stock: v.stock_quantity,
                    trackInventory: v.track_inventory !== false,
                    image: v.image_url || ''
                }));

            const infoSections = (p.product_info_sections || [])
                .filter(section => section.is_visible !== false && (section.title || section.body))
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map(section => ({
                    title: section.title || 'Product Details',
                    body: section.body || ''
                }));

            const hasRecommendationProfile = Boolean(p.product_recommendation_profiles && p.product_recommendation_profiles.length > 0);
            const recommendationProfile = hasRecommendationProfile
                ? p.product_recommendation_profiles[0]
                : {};
            const routineStepValue = hasRecommendationProfile ? (recommendationProfile.routine_step || '') : '';
            const routineSteps = String(routineStepValue || '').split(/[,\|]/).map(step => step.trim()).filter(Boolean);

            const reviews = (p.product_reviews || []).filter(r => r.approved);
            const reviewCount = reviews.length;
            const reviewAverage = reviewCount > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1) : 0;

            return {
                id: p.id,
                status: p.status || 'active',
                name: p.name,
                slug: p.slug,
                sku: p.sku || '',
                brand: p.brand || '',
                price: productPrice,
                compareAtPrice: p.compare_at_price_jmd ? Number(p.compare_at_price_jmd) : null,
                costPrice: p.cost_price_jmd ? Number(p.cost_price_jmd) : null,
                discountMode: p.discount_mode || '',
                discountValue: p.discount_value ? Number(p.discount_value) : null,
                category: (p.categories ? p.categories.name : 'Uncategorized'),
                description: p.description || p.short_description || '',
                shortDescription: p.short_description || '',
                badge: p.badge,
                images,
                image: images.length > 0 ? images[0] : 'https://placehold.co/600x400/F5EDE1/8B5A2B?text=No+Image',
                bestFor: p.best_for || '',
                bestForHtml: p.best_for_html || '',
                resultsHtml: p.results_html || p.best_for_html || '',
                ingredientsHtml: p.ingredients_html || '',
                howToUseHtml: p.how_to_use_html || '',
                returnPolicyHtml: p.return_policy_html || '',
                infoSections,
                skinConcern: (p.product_concerns || []).map(c => c.concern_slug).concat(tags.filter(t => t.type === 'skin_concern').map(t => t.name)),
                skinType: Array.isArray(recommendationProfile.skin_types) && recommendationProfile.skin_types.length > 0 
                    ? recommendationProfile.skin_types 
                    : tags.filter(t => t.type === 'skin_type').map(t => t.name),
                avoidFor: recommendationProfile.avoid_for || [],
                hasRecommendationProfile,
                routineStep: routineStepValue,
                routineSteps,
                productUse: recommendationProfile.product_use || 'both',
                isSensitiveFriendly: !!recommendationProfile.is_sensitive_friendly,
                ingredients: (p.product_ingredients || []).map(i => i.ingredient_name).concat(tags.filter(t => t.type === 'ingredient').map(t => t.name)),
                type: p.type,
                howToUse: p.how_to_use || '',
                whenToUse: p.when_to_use || '',
                size: p.size || p.weight || '',
                isFeatured: p.is_featured,
                trackInventory: p.track_inventory !== false,
                stockQuantity: p.stock_quantity,
                allowBackorder: p.allow_backorder,
                reviewCount,
                reviewAverage,
                is_sulphate_free: !!p.is_sulphate_free,
                is_paraben_free: !!p.is_paraben_free,
                is_mineral_oil_free: !!p.is_mineral_oil_free,
                is_cruelty_free: !!p.is_cruelty_free,
                is_handmade_in_jamaica: !!p.is_handmade_in_jamaica,
                has_results_disclaimer: p.has_results_disclaimer !== false,
                relatedProducts: [],
                variants
            };
        });

        return window.productsData;
    } catch (err) {
        console.error("Error fetching products from Supabase:", err);
        return [];
    }
};
