(() => {
  'use strict';

  const pageName = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isDetailPage = pageName === 'product.html';
  const isShopPage = pageName === 'shop.html';
  const onReady = (callback) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', callback, { once: true })
    : callback();
  const normaliseId = (value) => String(value ?? '');

  function favourites() {
    try {
      return new Set((JSON.parse(localStorage.getItem('foryou_favs') || '[]') || []).map(normaliseId));
    } catch (_) {
      return new Set();
    }
  }

  function syncFavourites() {
    const saved = favourites();
    document.querySelectorAll('[data-favourite]').forEach((button) => {
      const selected = saved.has(normaliseId(button.dataset.favourite));
      button.classList.toggle('is-favourite', selected);
      button.classList.toggle('text-red-500', selected);
      button.classList.toggle('border-red-500', selected);
      button.classList.toggle('text-stone-400', !selected && button.id.startsWith('fav-btn-'));
      button.classList.toggle('border-stone-200', !selected && button.id.startsWith('fav-btn-'));
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const icon = button.querySelector('i');
      if (icon) icon.className = selected ? 'fas fa-heart' : 'far fa-heart';
    });
  }

  function toggleFavourite(id) {
    const key = normaliseId(id);
    if (!key) return;
    const saved = favourites();
    if (saved.has(key)) saved.delete(key);
    else saved.add(key);
    localStorage.setItem('foryou_favs', JSON.stringify([...saved]));
    syncFavourites();
  }

  function productIdFromCard(card) {
    const link = card.querySelector('a[href*="product.html?id="]');
    if (!link) return '';
    try { return new URL(link.href, window.location.href).searchParams.get('id') || ''; }
    catch (_) { return (link.getAttribute('href') || '').split('id=')[1] || ''; }
  }

  function enhanceProductCards(root = document) {
    root.querySelectorAll('.product-card').forEach((card) => {
      const desc = card.querySelector('.text-stone-500.h-\\[18px\\], .text-stone-500.line-clamp-1, .text-stone-500.line-clamp-3');
      if (desc) desc.classList.add('product-card-description');

      const productId = productIdFromCard(card);
      const product = window.productsData?.find(p => p.id === productId);

      const title = card.querySelector('h3');
      if (title && !title.parentElement.querySelector('.product-rating')) {
        const rating = document.createElement('div');
        rating.className = 'product-rating';
        if (product && product.reviewCount > 0) {
          const avg = Math.round(product.reviewAverage);
          const starsHtml = '★'.repeat(avg) + '☆'.repeat(5 - avg);
          rating.setAttribute('aria-label', `${product.reviewAverage} out of 5 stars from ${product.reviewCount} reviews`);
          rating.innerHTML = `<span class="stars" aria-hidden="true">${starsHtml}</span><span>${product.reviewCount} ${product.reviewCount === 1 ? 'review' : 'reviews'}</span>`;
        } else {
          rating.setAttribute('aria-label', 'Product ratings will appear when reviews are published');
          rating.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>No reviews yet</span>';
        }
        title.insertAdjacentElement('afterend', rating);
      }

      if (productId && !card.querySelector('[data-favourite]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'product-favourite';
        button.dataset.favourite = productId;
        button.setAttribute('aria-label', 'Save this product to favourites');
        button.innerHTML = '<i class="far fa-heart" aria-hidden="true"></i>';
        card.prepend(button);
      }

      const addButton = [...card.querySelectorAll('button')].find((button) => /add/i.test(button.textContent || '') || button.hasAttribute('data-add-to-cart'));
      if (addButton?.parentElement) addButton.parentElement.classList.add('product-card-actions');
    });
    syncFavourites();
  }

  function setupGlobalSearch() {
    const actions = document.querySelector('.glass-nav .flex.items-center.gap-4');
    if (!actions || document.getElementById('globalSearchToggle')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'globalSearchToggle';
    toggle.className = 'global-search-toggle';
    toggle.setAttribute('aria-label', 'Search products');
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';
    actions.prepend(toggle);

    const modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.className = 'global-search-modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="globalSearchHeading">
      <h2 id="globalSearchHeading">Search the collection</h2>
      <form id="globalSearchForm" class="global-search-form">
        <input id="globalSearchInput" type="search" autocomplete="off" placeholder="Search soaps, serums, body care and more" aria-label="Search products">
        <button type="submit">Search</button>
      </form>
      <button type="button" class="global-search-close" id="globalSearchClose">Close search</button>
    </div>`;
    document.body.appendChild(modal);

    const close = () => { modal.hidden = true; toggle.focus(); };
    const open = () => { modal.hidden = false; setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 0); };
    toggle.addEventListener('click', open);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('#globalSearchClose')?.addEventListener('click', close);
    modal.querySelector('#globalSearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = document.getElementById('globalSearchInput')?.value.trim();
      if (query) window.location.href = `shop.html?q=${encodeURIComponent(query)}`;
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
  }

  function applyIncomingShopSearch() {
    if (!isShopPage) return;
    const query = new URLSearchParams(window.location.search).get('q')?.trim();
    if (!query) return;
    let attempt = 0;
    const apply = () => {
      attempt += 1;
      const input = document.getElementById('searchInput');
      if (input && Array.isArray(window.productsData) && window.productsData.length) {
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (attempt < 30) {
        setTimeout(apply, 180);
      }
    };
    apply();
  }

  function addHomepageRefinements() {
    const sections = [...document.querySelectorAll('main section')];
    const find = (phrase) => sections.find((section) => phrase.test(section.querySelector('h2')?.textContent || section.textContent || ''));

    const concernSection = find(/find what you.?re looking for/i);
    const concernGrid = concernSection?.querySelector('.grid');
    if (concernGrid) {
      concernGrid.classList.add('home-concern-grid');
      if (!concernSection.querySelector('.home-shop-all')) {
        const all = document.createElement('div');
        all.className = 'home-shop-all';
        all.innerHTML = '<a href="shop.html">Shop All Products <span aria-hidden="true">→</span></a>';
        concernGrid.insertAdjacentElement('afterend', all);
      }
    }

    const ritual = find(/build your glow ritual/i);
    if (ritual) {
      ritual.classList.add('glow-ritual-section');
      ritual.querySelectorAll(':scope > .grid > div').forEach((card) => card.classList.add('glow-routine-card'));
    }

    const journal = find(/from the glow journal/i);
    if (journal) journal.classList.add('glow-journal-section');

    const journey = find(/ready to start your glow journey/i);
    if (journey) {
      journey.classList.add('journey-cta');
      journey.querySelector('.flex')?.classList.add('journey-cta-actions');
    }
  }

  function applyBritishSpelling() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return /\bfavors?\b/i.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(/\bFavors\b/g, 'Favours').replace(/\bfavors\b/g, 'favours');
    });
  }

  function layoutPageHeaders() {
    if (!['about.html', 'blog.html', 'ingredients.html', 'contact.html', 'shop.html'].includes(pageName)) return;
    const header = document.querySelector('main > section');
    if (header?.querySelector('h1')) header.classList.add('page-header-wide');
  }

  function cleanCheckout() {
    if (pageName !== 'checkout.html') return;
    const heading = [...document.querySelectorAll('h3')].find((node) => node.textContent.trim() === 'Order Summary');
    heading?.closest('div')?.classList.add('checkout-summary-clean');
  }

  function safeHTML(value = '') {
    const holder = document.createElement('div');
    holder.innerHTML = String(value);
    holder.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
    holder.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name) || (/^(href|src)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
      });
    });
    return holder.innerHTML;
  }

  async function setReviewSummary(productId, target) {
    if (!window.supabase || !productId || !target || target.dataset.loaded) return;
    target.dataset.loaded = 'true';
    try {
      const { data, error } = await window.supabase.from('product_reviews').select('rating').eq('product_id', productId).eq('approved', true);
      if (error || !data?.length) {
        target.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>No reviews yet</span>';
        return;
      }
      const average = data.reduce((sum, item) => sum + Number(item.rating || 0), 0) / data.length;
      const rounded = Math.max(0, Math.min(5, Math.round(average)));
      target.innerHTML = `<span class="stars" aria-hidden="true">${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}</span><span>${average.toFixed(1)} from ${data.length} review${data.length === 1 ? '' : 's'}</span>`;
    } catch (_) {
      target.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>Reviews coming soon</span>';
    }
  }

  function mergeLegacyResults() {
    const cards = [...document.querySelectorAll('#productDetails .product-detail-card')];
    const resultCards = cards.filter((card) => /^results\b/i.test(card.querySelector('h3')?.textContent.trim() || ''));
    if (resultCards.length < 2) return;
    const primary = resultCards.shift();
    resultCards.forEach((legacy) => {
      const body = legacy.querySelector('ul, p') || legacy;
      const text = (body.textContent || '').replace(/^results\s*/i, '').trim();
      if (text) {
        const extra = document.createElement('div');
        extra.className = 'migrated-results';
        extra.textContent = text;
        primary.appendChild(extra);
      }
      legacy.remove();
    });
  }

  function enhanceProductDetail() {
    if (!isDetailPage) return;
    const container = document.getElementById('productDetails');
    if (!container || container.dataset.clientReviewEnhanced === 'true' || container.children.length < 2) return;
    const productId = new URLSearchParams(window.location.search).get('id');
    const product = (window.productsData || []).find((item) => normaliseId(item.id) === normaliseId(productId));
    const media = container.firstElementChild;
    const panel = container.children[1];
    if (!media || !panel) return;

    container.dataset.clientReviewEnhanced = 'true';
    media.classList.add('product-media-column');
    panel.classList.add('product-details-editorial');

    const heading = panel.querySelector('h1');
    if (heading && !panel.querySelector('.product-review-summary')) {
      const summary = document.createElement('div');
      summary.className = 'product-review-summary';
      summary.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>Loading reviews…</span>';
      heading.insertAdjacentElement('afterend', summary);
      setReviewSummary(product?.id || productId, summary);
    }

    const favourite = panel.querySelector('[id^="fav-btn-"]');
    if (favourite) {
      const id = favourite.id.replace(/^fav-btn-/, '');
      favourite.dataset.favourite = id;
      favourite.removeAttribute('onclick');
      if (favourite.dataset.clientFavouriteBound !== 'true') {
        favourite.dataset.clientFavouriteBound = 'true';
        favourite.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavourite(id);
        });
      }
    }

    const guide = [...container.querySelectorAll('div')].find((node) => /quick product guide/i.test(node.textContent || '') && node.querySelector('h2'));
    if (guide) {
      guide.classList.add('product-detail-editorial-header');
      [...guide.querySelectorAll('p')].find((node) => /quick product guide/i.test(node.textContent || ''))?.remove();
      const title = guide.querySelector('h2');
      if (title) title.textContent = 'Product Details';
    }

    if (product?.returnPolicyHtml) {
      const policy = [...container.querySelectorAll('.product-detail-card')].find((card) => /return\s*\/?.*policy|refund/i.test(card.querySelector('h3')?.textContent || ''));
      if (policy && !policy.dataset.expanded) {
        policy.dataset.expanded = 'true';
        const title = policy.querySelector('h3');
        policy.innerHTML = '';
        if (title) policy.appendChild(title);
        const body = document.createElement('div');
        body.className = 'full-policy-text';
        body.innerHTML = safeHTML(product.returnPolicyHtml);
        policy.appendChild(body);
      }
    }

    mergeLegacyResults();
    syncFavourites();
  }

  function observeDynamicContent() {
    const observer = new MutationObserver((records) => {
      let cardsChanged = false;
      let detailChanged = false;
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.('.product-card') || node.querySelector?.('.product-card')) cardsChanged = true;
        if (node.closest?.('#productDetails') || node.querySelector?.('#productDetails')) detailChanged = true;
      }));
      if (cardsChanged) enhanceProductCards();
      if (detailChanged) {
        const details = document.getElementById('productDetails');
        if (details) delete details.dataset.clientReviewEnhanced;
        enhanceProductDetail();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  onReady(() => {
    document.body.classList.toggle('quiz-page', pageName === 'quiz.html');
    document.body.classList.toggle('faq-page', pageName === 'faq.html');
    setupGlobalSearch();
    layoutPageHeaders();
    addHomepageRefinements();
    cleanCheckout();
    applyBritishSpelling();
    applyIncomingShopSearch();
    enhanceProductCards();
    enhanceProductDetail();
    observeDynamicContent();

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-favourite]');
      if (!button) return;
      event.preventDefault();
      toggleFavourite(button.dataset.favourite);
    });

    window.toggleFavourite = toggleFavourite;
  });
})();
