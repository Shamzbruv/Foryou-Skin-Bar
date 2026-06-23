(() => {
  'use strict';

  const pageName = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isDetailPage = pageName === 'product.html';
  const isShopPage = pageName === 'shop.html';

  const onReady = (callback) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));

  const normaliseId = (value) => String(value ?? '');

  function getFavouriteIds() {
    try {
      return new Set((JSON.parse(localStorage.getItem('foryou_favs') || '[]') || []).map(normaliseId));
    } catch (_) {
      return new Set();
    }
  }

  function saveFavouriteIds(ids) {
    localStorage.setItem('foryou_favs', JSON.stringify([...ids]));
  }

  function syncFavouriteButtons() {
    const favourites = getFavouriteIds();
    document.querySelectorAll('[data-favourite]').forEach((button) => {
      const active = favourites.has(normaliseId(button.dataset.favourite));
      button.classList.toggle('is-favourite', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const icon = button.querySelector('i');
      if (icon) icon.className = active ? 'fas fa-heart' : 'far fa-heart';
      if (button.id.startsWith('fav-btn-')) {
        button.classList.toggle('text-red-500', active);
        button.classList.toggle('border-red-500', active);
        button.classList.toggle('text-stone-400', !active);
        button.classList.toggle('border-stone-200', !active);
      }
    });
  }

  function toggleFavourite(id) {
    const key = normaliseId(id);
    if (!key) return;
    const favourites = getFavouriteIds();
    if (favourites.has(key)) favourites.delete(key);
    else favourites.add(key);
    saveFavouriteIds(favourites);
    syncFavouriteButtons();
  }

  function getProductIdFromCard(card) {
    const link = card.querySelector('a[href*="product.html?id="]');
    if (!link) return '';
    try {
      return new URL(link.href, window.location.href).searchParams.get('id') || '';
    } catch (_) {
      return (link.getAttribute('href') || '').split('id=')[1] || '';
    }
  }

  function makeCardActionsHoverOnly(card) {
    const addButton = [...card.querySelectorAll('button')].find((button) => /add/i.test(button.textContent || '') || button.hasAttribute('data-add-to-cart'));
    if (addButton?.parentElement) addButton.parentElement.classList.add('product-card-actions');
  }

  function addCardRating(card) {
    const title = card.querySelector('h3');
    if (!title || title.parentElement.querySelector('.product-rating')) return;
    const rating = document.createElement('div');
    rating.className = 'product-rating';
    rating.setAttribute('aria-label', 'Product ratings will appear here when reviews are published');
    rating.innerHTML = '<span class="stars" aria-hidden="true">★★★★★</span><span>Reviews coming soon</span>';
    title.insertAdjacentElement('afterend', rating);
  }

  function addCardFavourite(card) {
    const productId = getProductIdFromCard(card);
    if (!productId || card.querySelector('[data-favourite]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-favourite';
    button.dataset.favourite = productId;
    button.setAttribute('aria-label', 'Save this product to favourites');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<i class="far fa-heart" aria-hidden="true"></i>';
    card.prepend(button);
  }

  function enhanceProductCards(root = document) {
    root.querySelectorAll('.product-card').forEach((card) => {
      const description = card.querySelector('.text-stone-500.h-\[18px\], .text-stone-500.line-clamp-1');
      if (description) description.classList.add('product-card-description');
      addCardRating(card);
      addCardFavourite(card);
      makeCardActionsHoverOnly(card);
    });
    syncFavouriteButtons();
  }

  function addGlobalSearch() {
    const navActions = document.querySelector('.glass-nav .flex.items-center.gap-4');
    if (!navActions || document.getElementById('globalSearchToggle')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'globalSearchToggle';
    toggle.className = 'global-search-toggle';
    toggle.setAttribute('aria-label', 'Search products');
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';
    navActions.prepend(toggle);

    const modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.className = 'global-search-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="globalSearchHeading">
        <h2 id="globalSearchHeading">Search the collection</h2>
        <form class="global-search-form" id="globalSearchForm">
          <input id="globalSearchInput" type="search" autocomplete="off" placeholder="Search soaps, serums, body care and more" aria-label="Search products">
          <button type="submit">Search</button>
        </form>
        <button type="button" class="global-search-close" id="globalSearchClose">Close search</button>
      </div>`;
    document.body.appendChild(modal);

    const close = () => {
      modal.hidden = true;
      toggle.focus();
    };
    const open = () => {
      modal.hidden = false;
      window.setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 0);
    };

    toggle.addEventListener('click', open);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector('#globalSearchClose')?.addEventListener('click', close);
    modal.querySelector('#globalSearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = document.getElementById('globalSearchInput')?.value.trim();
      if (!query) return;
      window.location.href = `shop.html?q=${encodeURIComponent(query)}`;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) close();
    });
  }

  function applyShopQueryFromHeaderSearch() {
    if (!isShopPage) return;
    const query = new URLSearchParams(window.location.search).get('q')?.trim();
    if (!query) return;

    let attempts = 0;
    const apply = () => {
      attempts += 1;
      const input = document.getElementById('searchInput');
      if (input && Array.isArray(window.productsData) && window.productsData.length) {
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (attempts < 30) window.setTimeout(apply, 180);
    };
    apply();
  }

  function addHomeRefinements() {
    const findSection = [...document.querySelectorAll('main section')].find((section) => /find what you.?re looking for/i.test(section.querySelector('h2')?.textContent || ''));
    if (findSection) {
      const grid = findSection.querySelector('.grid');
      if (grid) {
        grid.classList.add('home-concern-grid');
        if (!findSection.querySelector('.home-shop-all')) {
          const linkWrap = document.createElement('div');
          linkWrap.className = 'home-shop-all';
          linkWrap.innerHTML = '<a href="shop.html">Shop All Products <span aria-hidden="true">→</span></a>';
          grid.insertAdjacentElement('afterend', linkWrap);
        }
      }
    }

    const ritualSection = [...document.querySelectorAll('main section')].find((section) => /build your glow ritual/i.test(section.querySelector('h2')?.textContent || ''));
    if (ritualSection) {
      ritualSection.classList.add('glow-ritual-section');
      ritualSection.querySelectorAll(':scope > .grid > div').forEach((card) => card.classList.add('glow-routine-card'));
    }

    const journalSection = [...document.querySelectorAll('main section')].find((section) => /from the glow journal/i.test(section.querySelector('h2')?.textContent || ''));
    if (journalSection) journalSection.classList.add('glow-journal-section');

    const journeySection = [...document.querySelectorAll('main section')].find((section) => /ready to start your glow journey/i.test(section.textContent || ''));
    if (journeySection) {
      journeySection.classList.add('journey-cta');
      const actions = journeySection.querySelector('.flex');
      if (actions) actions.classList.add('journey-cta-actions');
    }
  }

  function britishSpellingPass() {
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
      node.nodeValue = node.nodeValue
        .replace(/\bFavors\b/g, 'Favours')
        .replace(/\bfavors\b/g, 'favours');
    });
  }

  function addWideHeaderLayout() {
    if (!['about.html', 'blog.html', 'ingredients.html', 'contact.html', 'shop.html'].includes(pageName)) return;
    const firstSection = document.querySelector('main > section');
    if (firstSection?.querySelector('h1')) firstSection.classList.add('page-header-wide');
  }

  function cleanCheckout() {
    if (pageName !== 'checkout.html') return;
    const heading = [...document.querySelectorAll('h3')].find((item) => item.textContent.trim() === 'Order Summary');
    const summary = heading?.closest('div');
    if (summary) summary.classList.add('checkout-summary-clean');
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

  async function loadReviewSummary(productId, target) {
    if (!window.supabase || !productId || !target || target.dataset.loaded === 'true') return;
    target.dataset.loaded = 'true';
    try {
      const { data, error } = await window.supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', productId)
        .eq('approved', true);
      if (error || !data?.length) {
        target.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>No reviews yet</span>';
        return;
      }
      const average = data.reduce((sum, review) => sum + Number(review.rating || 0), 0) / data.length;
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
      const body = legacy.querySelector('ul, p, div:not(:has(h3))');
      const text = (body?.textContent || legacy.textContent || '').replace(/^results\s*/i, '').trim();
      if (text) {
        const extra = document.createElement('div');
        extra.className = 'migrated-results';
        extra.textContent = text;
        primary.appendChild(extra);
      }
      legacy.remove();
    });
  }

  function expandPolicyText(product) {
    if (!product?.returnPolicyHtml) return;
    const policyCard = [...document.querySelectorAll('#productDetails .product-detail-card')]
      .find((card) => /return\s*\/?.*policy|refund/i.test(card.querySelector('h3')?.textContent || ''));
    if (!policyCard || policyCard.dataset.expanded === 'true') return;
    policyCard.dataset.expanded = 'true';
    const heading = policyCard.querySelector('h3');
    policyCard.innerHTML = '';
    if (heading) policyCard.appendChild(heading);
    const fullText = document.createElement('div');
    fullText.className = 'full-policy-text';
    fullText.innerHTML = safeHTML(product.returnPolicyHtml);
    policyCard.appendChild(fullText);
  }

  function enhanceProductDetail() {
    if (!isDetailPage) return;
    const container = document.getElementById('productDetails');
    if (!container || !container.children.length || container.dataset.clientReviewEnhanced === 'true') return;
    const productId = new URLSearchParams(window.location.search).get('id');
    const product = (window.productsData || []).find((item) => normaliseId(item.id) === normaliseId(productId));
    const media = container.firstElementChild;
    const panel = container.children[1];
    if (!media || !panel) return;

    container.dataset.clientReviewEnhanced = 'true';
    media.classList.add('product-media-column');
    panel.classList.add('product-details-editorial');

    const productHeading = panel.querySelector('h1');
    if (productHeading && !panel.querySelector('.product-review-summary')) {
      const reviewSummary = document.createElement('div');
      reviewSummary.className = 'product-review-summary';
      reviewSummary.innerHTML = '<span class="stars" aria-hidden="true">☆☆☆☆☆</span><span>Loading reviews…</span>';
      productHeading.insertAdjacentElement('afterend', reviewSummary);
      loadReviewSummary(product?.id || productId, reviewSummary);
    }

    const favouriteButton = panel.querySelector('[id^="fav-btn-"]');
    if (favouriteButton) {
      const id = favouriteButton.id.replace(/^fav-btn-/, '');
      favouriteButton.dataset.favourite = id;
      favouriteButton.removeAttribute('onclick');
      favouriteButton.addEventListener('click', () => toggleFavourite(id));
    }

    const guideHeader = [...container.querySelectorAll('div')].find((element) => /quick product guide/i.test(element.textContent || '') && element.querySelector('h2'));
    if (guideHeader) {
      guideHeader.classList.add('product-detail-editorial-header');
      const kicker = [...guideHeader.querySelectorAll('p')].find((item) => /quick product guide/i.test(item.textContent || ''));
      if (kicker) kicker.remove();
      const title = guideHeader.querySelector('h2');
      if (title) title.textContent = 'Product Details';
    }

    expandPolicyText(product);
    mergeLegacyResults();
    syncFavouriteButtons();
  }

  function observeDynamicContent() {
    const observer = new MutationObserver((records) => {
      let shouldEnhanceCards = false;
      let shouldEnhanceDetail = false;
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('.product-card') || node.querySelector?.('.product-card')) shouldEnhanceCards = true;
          if (node.id === 'productDetails' || node.closest?.('#productDetails') || node.querySelector?.('#productDetails')) shouldEnhanceDetail = true;
        });
      });
      if (shouldEnhanceCards) enhanceProductCards();
      if (shouldEnhanceDetail) {
        const detail = document.getElementById('productDetails');
        if (detail) delete detail.dataset.clientReviewEnhanced;
        enhanceProductDetail();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  onReady(() => {
    document.body.classList.toggle('quiz-page', pageName === 'quiz.html');
    addGlobalSearch();
    addWideHeaderLayout();
    addHomeRefinements();
    cleanCheckout();
    britishSpellingPass();
    applyShopQueryFromHeaderSearch();
    enhanceProductCards();
    enhanceProductDetail();
    observeDynamicContent();

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-favourite]');
      if (!button) return;
      event.preventDefault();
      toggleFavourite(button.dataset.favourite);
    });

    // Product page inline code previously stored numeric and string identifiers differently.
    // Keep one source of truth for all existing and new favourite controls.
    window.toggleFavourite = toggleFavourite;
  });
})();
