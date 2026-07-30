const fs = require('fs/promises');
const path = require('path');

const DEFAULT_SOCIAL_IMAGE_PATH = '/assets/brand/welcome-lifestyle-clean-branded-v2.png';
const DEFAULT_SOCIAL_IMAGE_WIDTH = 1773;
const DEFAULT_SOCIAL_IMAGE_HEIGHT = 887;

const STATIC_PAGE_SEO = {
  '/': {
    file: 'index.html',
    canonicalPath: '/',
    title: 'Foryou Skin Bar | Jamaican Handmade Skincare for Acne, Dark Spots & Glow Routines',
    description: 'Discover handcrafted Jamaican skincare for acne, dark spots, hyperpigmentation, body care, and natural glow routines. Shop plant-powered products made in Jamaica.'
  },
  '/index.html': {
    file: 'index.html',
    canonicalPath: '/',
    title: 'Foryou Skin Bar | Jamaican Handmade Skincare for Acne, Dark Spots & Glow Routines',
    description: 'Discover handcrafted Jamaican skincare for acne, dark spots, hyperpigmentation, body care, and natural glow routines. Shop plant-powered products made in Jamaica.'
  },
  '/shop.html': {
    file: 'shop.html',
    title: 'Shop Jamaican Skincare for Dark Spots & Acne | Foryou Skin Bar',
    description: 'Shop Jamaican handmade soaps, serums, toners, creams, body butters, scrubs, and skincare routines for acne, dark spots, dry skin, and an even-looking glow.'
  },
  '/about.html': {
    file: 'about.html',
    title: 'Our Founder & Jamaican Skincare Story | Foryou Skin Bar',
    description: 'Meet the founder of Foryou Skin Bar and discover the Jamaican story behind handcrafted skincare made for real routines and melanin-rich skin.'
  },
  '/ingredients.html': {
    file: 'ingredients.html',
    title: 'Skincare Ingredient Library | Foryou Skin Bar Jamaica',
    description: 'Explore the turmeric, neem, kojic acid, niacinamide, vitamin C, shea butter, and clarifying actives used in Foryou Skin Bar skincare.'
  },
  '/quiz.html': {
    file: 'quiz.html',
    title: 'Find Your Routine - Skin Quiz | Foryou Skin Bar',
    description: 'Take the Foryou Skin Bar skin quiz for a personalized Jamaican skincare routine based on your skin type, concerns, and routine goals.'
  },
  '/blog.html': {
    file: 'blog.html',
    title: 'Skincare Tips for Melanin-Rich Skin | Foryou Glow Journal',
    description: 'Read practical skincare education, ingredient guides, and routine tips for acne, dark spots, hyperpigmentation, and healthy-looking skin.'
  },
  '/reviews.html': {
    file: 'reviews.html',
    title: 'Customer Reviews | Foryou Skin Bar Jamaica',
    description: 'Read verified customer experiences with Foryou Skin Bar handmade Jamaican skincare and body care.'
  },
  '/faq.html': {
    file: 'faq.html',
    title: 'Skincare, Ordering & Delivery FAQ | Foryou Skin Bar',
    description: 'Find answers about Foryou Skin Bar products, skin routines, secure checkout, Jamaican delivery, international shipping, returns, and customer support.'
  },
  '/shipping-returns.html': {
    file: 'shipping-returns.html',
    title: 'Shipping & Returns | Foryou Skin Bar Jamaica',
    description: 'Review Foryou Skin Bar delivery options, shipping costs, free-shipping thresholds, processing times, tracking, and return information.'
  },
  '/loyalty.html': {
    file: 'loyalty.html',
    title: 'Glow & Go Rewards | Foryou Skin Bar',
    description: 'Join the Foryou Skin Bar Glow & Go Inner Circle to earn Glow Credits and unlock skincare rewards.'
  },
  '/contact.html': {
    file: 'contact.html',
    title: 'Contact Foryou Skin Bar | Jamaican Skincare Support',
    description: 'Contact Foryou Skin Bar for product guidance, skincare support, order questions, and delivery help in Jamaica and internationally.'
  },
  '/policies.html': {
    file: 'policies.html',
    title: 'Store Policies | Foryou Skin Bar',
    description: 'Read Foryou Skin Bar ordering, payment, shipping, returns, cancellation, privacy, and product-use policies.'
  },
  '/privacy.html': {
    file: 'privacy.html',
    title: 'Privacy Policy | Foryou Skin Bar',
    description: 'Learn how Foryou Skin Bar collects, uses, and protects customer information.'
  },
  '/terms.html': {
    file: 'terms.html',
    title: 'Terms of Service | Foryou Skin Bar',
    description: 'Review the terms governing use of the Foryou Skin Bar website and online store.'
  }
};

const CANONICAL_ALIASES = {
  '/home': '/',
  '/shop': '/shop.html',
  '/about': '/about.html',
  '/about-us': '/about.html',
  '/blog': '/blog.html',
  '/ingredients': '/ingredients.html',
  '/quiz': '/quiz.html',
  '/skin-quiz': '/quiz.html',
  '/loyalty': '/loyalty.html',
  '/faq': '/faq.html',
  '/contact': '/contact.html',
  '/shipping-returns': '/shipping-returns.html',
  '/privacy': '/privacy.html',
  '/terms': '/terms.html',
  '/policies': '/policies.html'
};

const LEGACY_CATEGORY_DESTINATIONS = {
  'all-products': '/shop.html',
  'natural-body-care': '/shop.html?category=Body+Care',
  'acne-solutions': '/shop.html?concern=acne',
  'dark-spots-hyperpigmentation': '/shop.html?concern=dark-spots',
  'natural-skincare-bundles': '/shop.html',
  'skincare-bundles': '/shop.html'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function compactText(value = '', maximumLength = 160) {
  const text = String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, Math.max(0, maximumLength - 1)).replace(/\s+\S*$/, '')}...`;
}

function absoluteUrl(value, siteOrigin, fallbackPath = DEFAULT_SOCIAL_IMAGE_PATH) {
  try {
    return new URL(value || fallbackPath, siteOrigin).href;
  } catch (_) {
    return new URL(fallbackPath, siteOrigin).href;
  }
}

function injectSeoHead(html, options) {
  const title = options.title;
  const description = compactText(options.description, 160);
  const canonicalUrl = options.canonicalUrl;
  const imageUrl = options.imageUrl;
  const type = options.type || 'website';
  const imageIsDefault = imageUrl.endsWith(DEFAULT_SOCIAL_IMAGE_PATH);
  const robots = options.robots || 'index, follow, max-image-preview:large';
  const schema = options.schema
    ? `<script id="serverSeoSchema" type="application/ld+json">${JSON.stringify(options.schema).replace(/</g, '\\u003c')}</script>`
    : '';
  const productMeta = options.price
    ? `<meta property="product:price:amount" content="${escapeHtml(options.price)}">\n  <meta property="product:price:currency" content="JMD">`
    : '';

  const cleaned = String(html)
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '')
    .replace(/\s*<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '');

  const metadata = `
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:site_name" content="Foryou Skin Bar">
  <meta property="og:locale" content="en_JM">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
  ${imageIsDefault ? `<meta property="og:image:width" content="${DEFAULT_SOCIAL_IMAGE_WIDTH}">\n  <meta property="og:image:height" content="${DEFAULT_SOCIAL_IMAGE_HEIGHT}">` : ''}
  <meta property="og:image:alt" content="${escapeHtml(`${title} - For You Skin Bar`)}">
  ${productMeta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(`${title} - For You Skin Bar`)}">
  ${schema}`;

  return cleaned.replace(/<head([^>]*)>/i, `<head$1>${metadata}`);
}

async function readAndRender(rootDirectory, page, options, res, next) {
  try {
    const html = await fs.readFile(path.join(rootDirectory, page), 'utf8');
    res.type('html');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=1800');
    return res.status(options.status || 200).send(injectSeoHead(html, options));
  } catch (error) {
    return next(error);
  }
}

function primaryProductImage(product) {
  return (product.product_images || [])
    .filter((image) => image?.image_url)
    .sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary))
      || Number(left.sort_order || 0) - Number(right.sort_order || 0))[0]?.image_url || '';
}

function installSeoRoutes(app, { rootDirectory, supabase, siteOrigin }) {
  Object.entries(CANONICAL_ALIASES).forEach(([source, destination]) => {
    app.get(source, (req, res) => res.redirect(301, destination));
  });

  app.get('/category/:slug', (req, res) => {
    const destination = LEGACY_CATEGORY_DESTINATIONS[String(req.params.slug || '').toLowerCase()] || '/shop.html';
    return res.redirect(301, destination);
  });

  app.get('/product-page/:slug', async (req, res, next) => {
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('id')
        .eq('slug', req.params.slug)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return res.redirect(301, product ? `/product.html?id=${encodeURIComponent(product.id)}` : '/shop.html');
    } catch (error) {
      return next(error);
    }
  });

  app.get('/post/:slug', (req, res) => res.redirect(301, `/blog-post.html?slug=${encodeURIComponent(req.params.slug)}`));

  Object.entries(STATIC_PAGE_SEO).forEach(([route, page]) => {
    app.get(route, (req, res, next) => readAndRender(rootDirectory, page.file, {
      ...page,
      canonicalUrl: absoluteUrl(page.canonicalPath || route, siteOrigin),
      imageUrl: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH, siteOrigin),
      type: 'website'
    }, res, next));
  });

  app.get('/product.html', async (req, res, next) => {
    const productId = String(req.query.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productId)) return res.redirect(302, '/shop.html');
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('id,name,seo_title,seo_description,short_description,description,price_jmd,status,product_images(image_url,sort_order,is_primary)')
        .eq('id', productId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      if (!product) return res.redirect(302, '/shop.html');
      const title = compactText(product.seo_title || `${product.name} | Foryou Skin Bar`, 90);
      const description = product.seo_description || product.short_description || product.description
        || `Shop ${product.name}, handcrafted in Jamaica by Foryou Skin Bar.`;
      const canonicalUrl = absoluteUrl(`/product.html?id=${encodeURIComponent(product.id)}`, siteOrigin);
      const imageUrl = absoluteUrl(primaryProductImage(product), siteOrigin);
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        image: [imageUrl],
        description: compactText(description, 500),
        brand: { '@type': 'Brand', name: 'Foryou Skin Bar' },
        url: canonicalUrl,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'JMD',
          price: Number(product.price_jmd || 0).toFixed(2),
          availability: 'https://schema.org/InStock',
          url: canonicalUrl
        }
      };
      return readAndRender(rootDirectory, 'product.html', {
        title,
        description,
        canonicalUrl,
        imageUrl,
        type: 'product',
        price: Number(product.price_jmd || 0).toFixed(2),
        schema
      }, res, next);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/blog-post.html', async (req, res, next) => {
    const slug = String(req.query.slug || '').trim();
    if (!slug) return res.redirect(302, '/blog.html');
    try {
      const { data: post, error } = await supabase
        .from('blog_posts')
        .select('title,slug,excerpt,content,featured_image_url,published_at,updated_at,status')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      if (!post) return res.redirect(302, '/blog.html');
      const title = `${compactText(post.title, 70)} | Foryou Skin Bar Glow Journal`;
      const description = post.excerpt || post.content || 'Skincare education and routine guidance from Foryou Skin Bar Jamaica.';
      const canonicalUrl = absoluteUrl(`/blog-post.html?slug=${encodeURIComponent(post.slug)}`, siteOrigin);
      const imageUrl = absoluteUrl(post.featured_image_url, siteOrigin);
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: compactText(description, 500),
        image: [imageUrl],
        datePublished: post.published_at,
        dateModified: post.updated_at || post.published_at,
        mainEntityOfPage: canonicalUrl,
        author: { '@type': 'Organization', name: 'Foryou Skin Bar', url: siteOrigin },
        publisher: {
          '@type': 'Organization',
          name: 'Foryou Skin Bar',
          logo: { '@type': 'ImageObject', url: absoluteUrl('/assets/brand/logo.png', siteOrigin) }
        }
      };
      return readAndRender(rootDirectory, 'blog-post.html', {
        title,
        description,
        canonicalUrl,
        imageUrl,
        type: 'article',
        schema
      }, res, next);
    } catch (error) {
      return next(error);
    }
  });
}

module.exports = { installSeoRoutes, injectSeoHead };
