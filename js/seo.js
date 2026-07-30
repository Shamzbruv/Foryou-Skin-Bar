(function () {
  const SITE_ORIGIN = 'https://foryouskinbar.com';
  const DEFAULT_IMAGE = `${SITE_ORIGIN}/social-preview.jpg`;

  function absoluteUrl(value) {
    if (!value) return DEFAULT_IMAGE;
    try { return new URL(value, SITE_ORIGIN).href; } catch (_) { return DEFAULT_IMAGE; }
  }

  function setMeta(selector, attributes) {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      document.head.appendChild(element);
    }
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function defaultCanonical() {
    const url = new URL(window.location.href);
    const canonical = new URL(url.pathname.replace(/index\.html$/, ''), SITE_ORIGIN);
    if (/\/(product|blog-post)\.html$/.test(url.pathname)) {
      const key = url.pathname.endsWith('product.html') ? 'id' : 'slug';
      const value = url.searchParams.get(key);
      if (value) canonical.searchParams.set(key, value);
    }
    return canonical.href;
  }

  function updateSeo(options = {}) {
    const title = options.title || document.title;
    const description = options.description || document.querySelector('meta[name="description"]')?.content || '';
    const canonicalUrl = absoluteUrl(options.canonicalPath || defaultCanonical());
    const image = absoluteUrl(options.image || document.querySelector('meta[property="og:image"]')?.content || DEFAULT_IMAGE);
    const type = options.type || 'website';

    if (options.title) document.title = options.title;
    setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    setMeta('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url', content: image });
    setMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: `${title} - For You Skin Bar` });
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Foryou Skin Bar' });
    setMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'en_JM' });
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });
    setMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: `${title} - For You Skin Bar` });

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    if (options.schema) {
      let schema = document.getElementById('dynamicSeoSchema');
      if (!schema) {
        schema = document.createElement('script');
        schema.type = 'application/ld+json';
        schema.id = 'dynamicSeoSchema';
        document.head.appendChild(schema);
      }
      schema.textContent = JSON.stringify(options.schema);
    }
  }

  window.updateSeo = updateSeo;
  updateSeo();

  if (window.location.pathname !== '/' && !window.location.pathname.endsWith('/index.html')) {
    const label = document.querySelector('h1')?.textContent?.trim() || document.title.split('|')[0].trim();
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: label, item: defaultCanonical() }
      ]
    };
    const node = document.createElement('script');
    node.type = 'application/ld+json';
    node.textContent = JSON.stringify(breadcrumb);
    document.head.appendChild(node);
  }
})();
