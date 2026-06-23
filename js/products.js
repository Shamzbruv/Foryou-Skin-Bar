// Products data will be populated from Supabase
window.productsData = [];

window.loadProductsData = async function() {
    if (window.productsData.length > 0) return window.productsData;

    if (!window.supabase) {
        console.error("Supabase client not loaded.");
        return [];
    }

    const normalizeCatalogKey = value => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    const catalogPrices = {"Island Vybz Bundle - Big Vybz Collection":{"p":4500,"v":{}},"In Your Dreams Bundle – Pink Chiffon Collection":{"p":4500,"v":{}},"Bold Touch Bundle – Black Woman Collection":{"p":4500,"v":{}},"Body Oil Jamaican Made Natural Botanical Infused":{"p":1500,"v":{"Island Vybz":1500,"Vanilla Bae":1500,"Bold Touch":1500,"Favoured":1500,"In Your Dreams":1500}},"Grace and Glow Self Care – Handmade Bath and Body Gift Sets":{"p":10000,"v":{"Wrapped in Grace":10000,"Praise and Glow":10000,"Bold by Design":10000,"Chosen and Covered":10000,"Covered While You Rest":10000}},"Favoured Jamaican Handmade Natural Body Butter":{"p":1500,"v":{"8.5oz":2700,"4oz":1500}},"Facial Sponge for Mild Exfoliation":{"p":200,"v":{"6":1000,"3":500,"1":200}},"Soap Saver Mesh Bag":{"p":350,"v":{}},"Goddess Relief Feminine Oil":{"p":1500,"v":{}},"Root Theory Beard Balm":{"p":1500,"v":{"2oz":1500,"4oz":2800}},"Hyperpigmentation Fix Targeted Skincare for Dark Spots & Uneven Skin Tone":{"p":4800,"v":{"Yaad Glow Essentials":7200,"Spotless Radiance Set":6350,"Even Glow Kit":6800,"Glow Getter Bundle":4800}},"Calm Theory Soap Bar with Moringa and Neem for Even Skin Tone":{"p":1500,"v":{"4.7oz":1500}},"Roots Beard Oil":{"p":1900,"v":{}},"ClariTone Brightening and Balancing Toner for Acne Spots and Hyperpigmentation":{"p":2000,"v":{}},"Clear Era Vanishing Cream Spot and Hyperpigmentation Corrector":{"p":2000,"v":{}},"Exfoliation Glove":{"p":750,"v":{"Purple":750,"Baby Blue":750,"Light Blue":750,"Lime Green":750,"Orange":750,"Pink":750,"Mint green":750,"Lilac":750,"Yellow":750,"White":750,"Blue":750,"Rose Pink":750,"Red":750}},"In Your Dreams All Natural Jamaican Handmade Body Butter":{"p":1500,"v":{"4oz":1500,"8.5oz":2500}},"Glow Reset Emulsifying Sugar Scrub":{"p":1500,"v":{}},"Bold Touch Natural Handmade Body Butter":{"p":1500,"v":{"8oz":2700,"4oz":1500}},"Body Mist Jamaican Made Natural Alcohol Free":{"p":1800,"v":{"Vanilla Bae":1800,"In Your Dreams":1800,"Favoured":1800,"Bold Touch":1800,"Island Vybz":1800}},"Rose Radiance Toner":{"p":1800,"v":{}},"Plump N Glow Elixir":{"p":1900,"v":{}},"Protect and Glow Vitamin C Serum":{"p":2100,"v":{}},"Glow and Clear Essentials":{"p":6150,"v":{}},"Eco Friendly Bamboo Soap Dish":{"p":600,"v":{}},"Flawless Body Scrub with Hibiscus":{"p":2250,"v":{}},"Firm Skin Coffee  Face Cream":{"p":2250,"v":{}},"Skinfidence Blemish Cream":{"p":1800,"v":{}},"Niaskin Boost Elixir Handmade with Niacinamide":{"p":1500,"v":{"With Cinnamon Essential Oil":1500,"With/O Cinnamon Essential Oil":1500}},"Fluff and Flair Facial Spa Headband":{"p":1200,"v":{}},"Neem Turmeric Acne Soap":{"p":1500,"v":{"4.7oz":1500,"Melt & Pour 4.5oz":1000}},"Coffee Rush Glow Body Scrub":{"p":2400,"v":{}},"Skin Balance Handmade Toner for Spots and Hyperpigmentation":{"p":1800,"v":{}},"Vanilla Bae All Natural Nourishing Body Butter For Dry Skin":{"p":1500,"v":{"Light Vanilla":2700,"Very Vanilla":2700}},"Island Vybz All Natural Jamaican Body Butter":{"p":1500,"v":{"4oz":1500,"8.02oz":2750}},"Revive Oil Serum Handmade Brightening Moisturizer":{"p":1250,"v":{}},"Kojie Fade Bar Handmade soap with Kojic Acid":{"p":1950,"v":{}},"TruGlow Turmeric Scrub for Spots and Uneven Skin Tone":{"p":1700,"v":{"6oz":1700,"8oz":2000,"11oz":2700}},"Glow Therapy Soap All Natural with Hibiscus":{"p":1200,"v":{}},"Clear Skin Serum with 2% Salicylic Acid for Acne":{"p":900,"v":{"1oz":900,"2oz":1500}},"Kojie Fade Skin Brightening Serum":{"p":1500,"v":{}},"Hydrating Serum":{"p":50,"v":{}},"Repairing Night Cream":{"p":60,"v":{}},"Brightening Cream":{"p":55,"v":{}},"Brightening Serum":{"p":45,"v":{}},"Hydrating Cleanser":{"p":32,"v":{}},"Moisturizing Day Cream":{"p":40,"v":{}},"Anti-Acne Serum":{"p":55,"v":{}},"Gentle Foaming Cleanser":{"p":30,"v":{}},"Exfoliating Cleanser":{"p":35,"v":{}}};
    const catalogPricesByName = new Map(Object.entries(catalogPrices).map(([name, data]) => [normalizeCatalogKey(name), data]));

    function getCatalogEntry(productName) {
        return catalogPricesByName.get(normalizeCatalogKey(productName));
    }

    function getCatalogVariantPrice(entry, variantName, fallbackPrice) {
        if (!entry) return Number(fallbackPrice || 0);
        const variantMap = entry.v || {};
        const matchedKey = Object.keys(variantMap).find(key => normalizeCatalogKey(key) === normalizeCatalogKey(variantName));
        if (matchedKey) return Number(variantMap[matchedKey] || entry.p || fallbackPrice || 0);
        return Number(entry.p || fallbackPrice || 0);
    }

    try {
        const { data, error } = await window.supabase
            .from('products')
            .select('*, categories(name), product_images(image_url, sort_order, is_primary), product_tags(name, type), product_variants(*), product_info_sections(*), product_concerns(concern_slug), product_ingredients(ingredient_name), product_recommendation_profiles(*)')
            .eq('status', 'active');

        if (error) throw error;

        window.productsData = (data || []).map(p => {
            const tags = p.product_tags || [];
            const catalogEntry = getCatalogEntry(p.name);
            const productPrice = Number(catalogEntry?.p || p.price_jmd || 0);
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
                    price: getCatalogVariantPrice(catalogEntry, v.name, Number(v.price_jmd || productPrice || 0)),
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

            const recommendationProfile = (p.product_recommendation_profiles && p.product_recommendation_profiles.length > 0) 
                ? p.product_recommendation_profiles[0] 
                : {};

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
                ingredientsHtml: p.ingredients_html || '',
                howToUseHtml: p.how_to_use_html || '',
                returnPolicyHtml: p.return_policy_html || '',
                infoSections,
                skinConcern: (p.product_concerns || []).map(c => c.concern_slug).concat(tags.filter(t => t.type === 'skin_concern').map(t => t.name)),
                skinType: Array.isArray(recommendationProfile.skin_types) && recommendationProfile.skin_types.length > 0 
                    ? recommendationProfile.skin_types 
                    : tags.filter(t => t.type === 'skin_type').map(t => t.name),
                avoidFor: recommendationProfile.avoid_for || [],
                routineStep: recommendationProfile.routine_step || p.routine_step || '',
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
                relatedProducts: [],
                variants
            };
        });

        return window.productsData;
    } catch (err) {
        console.error("Error fetching products from Supabase:", err);
        alert("Failed to load products: " + err.message);
        return [];
    }
};
