const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const DEFAULT_SOCIAL_IMAGE_PATH = '/assets/brand/welcome-lifestyle-clean-branded-v2.png';
const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200;
const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630;
const DEFAULT_SOCIAL_TITLE = 'Foryou Skin Bar | Jamaican Handmade Skincare';
const DEFAULT_SOCIAL_DESCRIPTION = 'Handcrafted Jamaican skincare made for acne, dark spots, body care, and healthy glow routines.';
const socialImageCache = new Map();

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
    title: 'Foryou Skin Journal | Trusted Skincare Education',
    description: 'Explore trusted skincare education for acne, dark spots, routines, ingredients, healthy skin, and Jamaican skincare from Foryou Skin Bar.'
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
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="${DEFAULT_SOCIAL_IMAGE_WIDTH}">
  <meta property="og:image:height" content="${DEFAULT_SOCIAL_IMAGE_HEIGHT}">
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
    const renderedHtml = typeof options.transformHtml === 'function' ? options.transformHtml(html) : html;
    res.type('html');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=1800');
    return res.status(options.status || 200).send(injectSeoHead(renderedHtml, options));
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

async function socialSharingSettings(supabase) {
  const defaults = {
    title: DEFAULT_SOCIAL_TITLE,
    description: DEFAULT_SOCIAL_DESCRIPTION,
    imageUrl: DEFAULT_SOCIAL_IMAGE_PATH,
    version: 1
  };
  const { data, error } = await supabase
    .from('site_content')
    .select('value,updated_at')
    .eq('key', 'social_sharing')
    .maybeSingle();
  if (error) return defaults;
  const value = data?.value && typeof data.value === 'object' ? data.value : {};
  return {
    title: compactText(value.title || DEFAULT_SOCIAL_TITLE, 90),
    description: compactText(value.description || DEFAULT_SOCIAL_DESCRIPTION, 180),
    imageUrl: String(value.image_url || DEFAULT_SOCIAL_IMAGE_PATH).trim() || DEFAULT_SOCIAL_IMAGE_PATH,
    version: data?.updated_at ? new Date(data.updated_at).getTime() : 1
  };
}

function socialPreviewUrl(siteOrigin, parameters = {}) {
  const url = new URL('/social-preview.jpg', siteOrigin);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.href;
}

function isBlockedRemoteHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost'
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || host === '::1';
}

async function sourceImageBuffer(source, rootDirectory, siteOrigin) {
  const sourceUrl = new URL(source || DEFAULT_SOCIAL_IMAGE_PATH, siteOrigin);
  const siteUrl = new URL(siteOrigin);
  if (sourceUrl.origin === siteUrl.origin) {
    const root = path.resolve(rootDirectory);
    const localPath = path.resolve(rootDirectory, `.${decodeURIComponent(sourceUrl.pathname)}`);
    if (localPath !== root && !localPath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid local sharing image path.');
    return fs.readFile(localPath);
  }
  if (sourceUrl.protocol !== 'https:' || isBlockedRemoteHost(sourceUrl.hostname)) throw new Error('Sharing images must use a public HTTPS address.');
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Sharing image returned HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 15 * 1024 * 1024) throw new Error('Sharing image is larger than 15 MB.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) throw new Error('Sharing image is larger than 15 MB.');
  return buffer;
}

async function sharingImageSource(req, supabase) {
  const productId = String(req.query.product || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productId)) {
    const { data: product } = await supabase
      .from('products')
      .select('id,updated_at,product_images(image_url,sort_order,is_primary)')
      .eq('id', productId)
      .eq('status', 'active')
      .maybeSingle();
    const imageUrl = product ? primaryProductImage(product) : '';
    if (imageUrl) return { imageUrl, version: product.updated_at || product.id };
  }

  const blogSlug = String(req.query.blog || '').trim().slice(0, 200);
  if (blogSlug) {
    const { data: post } = await supabase
      .from('blog_posts')
      .select('featured_image_url,updated_at')
      .eq('slug', blogSlug)
      .eq('status', 'published')
      .maybeSingle();
    if (post?.featured_image_url) return { imageUrl: post.featured_image_url, version: post.updated_at || blogSlug };
  }

  return socialSharingSettings(supabase);
}

async function optimizedSharingImage(source, rootDirectory, siteOrigin) {
  const cacheKey = `${source.imageUrl}|${source.version || ''}`;
  if (socialImageCache.has(cacheKey)) return socialImageCache.get(cacheKey);
  let input;
  try {
    input = await sourceImageBuffer(source.imageUrl, rootDirectory, siteOrigin);
  } catch (_) {
    input = await sourceImageBuffer(DEFAULT_SOCIAL_IMAGE_PATH, rootDirectory, siteOrigin);
  }
  const output = await sharp(input)
    .rotate()
    .resize(DEFAULT_SOCIAL_IMAGE_WIDTH, DEFAULT_SOCIAL_IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer();
  socialImageCache.set(cacheKey, output);
  while (socialImageCache.size > 50) socialImageCache.delete(socialImageCache.keys().next().value);
  return output;
}

function installSeoRoutes(app, { rootDirectory, supabase, siteOrigin }) {
  app.get('/social-preview.jpg', async (req, res, next) => {
    try {
      const source = await sharingImageSource(req, supabase);
      const image = await optimizedSharingImage(source, rootDirectory, siteOrigin);
      res.type('image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
      res.set('Content-Length', String(image.length));
      return res.status(200).send(image);
    } catch (error) {
      return next(error);
    }
  });

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
    app.get(route, async (req, res, next) => {
      try {
        const social = await socialSharingSettings(supabase);
        const isHomepage = route === '/' || route === '/index.html';
        let routeTitle = isHomepage ? social.title : page.title;
        let routeDescription = isHomepage ? social.description : page.description;
        let routeImageUrl = socialPreviewUrl(siteOrigin, { v: social.version });
        let schema;
        if (route === '/blog.html') {
          const [{ data: posts }, { data: journalContent }] = await Promise.all([
            supabase.from('blog_posts').select('title,slug,excerpt,featured_image_url,published_at,primary_topic').eq('status', 'published').order('published_at', { ascending: false }).limit(50),
            supabase.from('site_content').select('value,updated_at').eq('key', 'journal_page').maybeSingle()
          ]);
          const journal = journalContent?.value && typeof journalContent.value === 'object' ? journalContent.value : {};
          routeTitle = compactText(journal.seo_title || page.title, 90);
          routeDescription = compactText(journal.seo_description || page.description, 180);
          if (journal.social_image_url) routeImageUrl = absoluteUrl(journal.social_image_url, siteOrigin);
          schema = {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: compactText(journal.hero_title || 'Foryou Skin Journal', 120),
            description: routeDescription,
            url: absoluteUrl('/blog.html', siteOrigin),
            isPartOf: { '@type': 'WebSite', name: 'Foryou Skin Bar', url: siteOrigin },
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: (posts || []).map((post, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: absoluteUrl(`/blog-post.html?slug=${encodeURIComponent(post.slug)}`, siteOrigin),
                name: post.title
              }))
            }
          };
        }
        return readAndRender(rootDirectory, page.file, {
          ...page,
          title: routeTitle,
          description: routeDescription,
          canonicalUrl: absoluteUrl(page.canonicalPath || route, siteOrigin),
          imageUrl: routeImageUrl,
          type: 'website',
          schema
        }, res, next);
      } catch (error) {
        return next(error);
      }
    });
  });

  app.get('/product.html', async (req, res, next) => {
    const productId = String(req.query.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productId)) return res.redirect(302, '/shop.html');
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('id,name,seo_title,seo_description,short_description,description,price_jmd,status,updated_at,product_images(image_url,sort_order,is_primary)')
        .eq('id', productId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      if (!product) return res.redirect(302, '/shop.html');
      const title = compactText(product.seo_title || `${product.name} | Foryou Skin Bar`, 90);
      const description = product.seo_description || product.short_description || product.description
        || `Shop ${product.name}, handcrafted in Jamaica by Foryou Skin Bar.`;
      const canonicalUrl = absoluteUrl(`/product.html?id=${encodeURIComponent(product.id)}`, siteOrigin);
      const originalImageUrl = absoluteUrl(primaryProductImage(product), siteOrigin);
      const imageUrl = socialPreviewUrl(siteOrigin, { product: product.id, v: product.updated_at || 1 });
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        image: [originalImageUrl],
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
        .select('title,slug,excerpt,content,featured_image_url,published_at,updated_at,status,seo_title,seo_description,primary_topic,article_type,reading_time_minutes,related_post_slugs')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      if (!post) return res.redirect(302, '/blog.html');
      const title = compactText(post.seo_title || `${post.title} | Foryou Skin Journal`, 90);
      const description = post.seo_description || post.excerpt || post.content || 'Skincare education and routine guidance from Foryou Skin Bar Jamaica.';
      const canonicalUrl = absoluteUrl(`/blog-post.html?slug=${encodeURIComponent(post.slug)}`, siteOrigin);
      const originalImageUrl = absoluteUrl(post.featured_image_url, siteOrigin);
      const imageUrl = socialPreviewUrl(siteOrigin, { blog: post.slug, v: post.updated_at || post.published_at || 1 });
      const topicNames = {
        acne: 'Acne',
        'dark-spots-hyperpigmentation': 'Dark Spots & Hyperpigmentation',
        'skincare-routines': 'Skincare Routines',
        'ingredients-library': 'Ingredients Library',
        'healthy-skin': 'Healthy Skin',
        'skin-school': 'Skin School',
        'jamaican-skincare': 'Jamaican Skincare'
      };
      const topicName = topicNames[post.primary_topic] || 'Healthy Skin';
      const schema = {
        '@context': 'https://schema.org',
        '@graph': [{
          '@type': 'Article',
          headline: post.title,
          description: compactText(description, 500),
          image: [originalImageUrl],
          datePublished: post.published_at,
          dateModified: post.updated_at || post.published_at,
          articleSection: topicName,
          timeRequired: `PT${Number(post.reading_time_minutes) || 5}M`,
          mainEntityOfPage: canonicalUrl,
          author: { '@type': 'Organization', name: 'Foryou Skin Bar', url: siteOrigin },
          publisher: {
            '@type': 'Organization',
            name: 'Foryou Skin Bar',
            logo: { '@type': 'ImageObject', url: absoluteUrl('/assets/brand/logo.png', siteOrigin) }
          }
        }, {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: siteOrigin },
            { '@type': 'ListItem', position: 2, name: 'Foryou Skin Journal', item: absoluteUrl('/blog.html', siteOrigin) },
            { '@type': 'ListItem', position: 3, name: topicName, item: absoluteUrl(`/blog.html?topic=${encodeURIComponent(post.primary_topic || 'healthy-skin')}`, siteOrigin) },
            { '@type': 'ListItem', position: 4, name: post.title, item: canonicalUrl }
          ]
        }]
      };
      const serverArticle = `
        <article class="max-w-4xl mx-auto px-6 md:px-12 py-12 md:py-20">
          <header class="text-center mb-10">
            <nav aria-label="Breadcrumb"><a href="/blog.html">Foryou Skin Journal</a> / <a href="/blog.html?topic=${escapeHtml(post.primary_topic || 'healthy-skin')}">${escapeHtml(topicName)}</a></nav>
            <p>${escapeHtml(topicName)} &bull; ${Number(post.reading_time_minutes) || 5} min read</p>
            <h1>${escapeHtml(post.title)}</h1>
            ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
          </header>
          ${post.featured_image_url ? `<img src="${escapeHtml(absoluteUrl(post.featured_image_url, siteOrigin))}" alt="${escapeHtml(post.title)}">` : ''}
          <div class="article-content">${post.content || ''}</div>
        </article>`;
      return readAndRender(rootDirectory, 'blog-post.html', {
        title,
        description,
        canonicalUrl,
        imageUrl,
        type: 'article',
        schema,
        transformHtml: (html) => html.replace(/<main id="articleContainer">[\s\S]*?<\/main>/i, `<main id="articleContainer">${serverArticle}</main>`)
      }, res, next);
    } catch (error) {
      return next(error);
    }
  });
}

module.exports = { installSeoRoutes, injectSeoHead };
