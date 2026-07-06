(() => {
  const DEFAULT_PROGRAM = {
    enabled: true,
    name: 'Glow & Go Inner Circle',
    hero: {
      eyebrow: 'ForYou Skin Bar Rewards',
      title: 'Glow more.\nGet <em>more</em> back.',
      description: 'The Glow & Go Inner Circle is our thank-you for choosing your skin. Earn Glow Credits, unlock special rewards, and rise through every level of your routine.',
      imageUrl: 'assets/products/gift_set.png',
      primaryLabel: 'Become a Member',
      primaryHref: 'https://wa.me/18763094374?text=Hi%20For%20You%20Skin%20Bar!%20I%20would%20like%20to%20join%20the%20Glow%20%26%20Go%20Inner%20Circle.',
      secondaryLabel: 'Explore Rewards',
      proof: ['Free to join', 'Made for your glow', 'Jamaican handmade skincare']
    },
    steps: [
      { number: '01', icon: 'fa-user-plus', title: 'Sign Up', description: 'Join the Inner Circle to begin collecting Glow Credits with your favourite skincare essentials.' },
      { number: '02', icon: 'fa-sparkles', title: 'Earn Glow Credits', description: 'Collect credits through purchases and special community moments built into the programme.' },
      { number: '03', icon: 'fa-gift', title: 'Redeem Rewards', description: 'Turn your Glow Credits into savings, treats, and elevated skin-care moments.' }
    ],
    tiers: [
      {
        name: 'Radiant Rookie',
        threshold: '0 total earned Glow Credits required',
        rank: 'Level One',
        icon: 'fa-seedling',
        summary: 'Your glow journey starts here. Earn as you shop and unlock your first rewards.',
        perks: ['Earn 1 Glow Credit for every $1 spent', 'Start enjoying rewards as soon as you join'],
        earnRules: [
          { title: 'Purchase a product', description: 'Get 1 Glow Credit for every $1 spent' },
          { title: 'Sign up to the site', description: 'Get 10 Glow Credits' },
          { title: 'Celebrate a birthday', description: 'Get 50 Glow Credits' },
          { title: 'Follow on social media', description: 'Get 50 Glow Credits' }
        ],
        rewards: [
          { title: 'Shine On', points: '2,500 Glow Credits', description: '$50 discount' },
          { title: 'Glow Getter', points: '7,500 Glow Credits', description: '5% off orders over $5,000' }
        ]
      },
      {
        name: 'Glowing Insider',
        threshold: '20,000 total earned Glow Credits required',
        rank: 'Level Two',
        icon: 'fa-sun',
        summary: 'Your commitment is showing. Enjoy stronger earning power and more generous rewards.',
        perks: ['Earn 2× more Glow Credits', 'Unlock rewards worth up to 15% off'],
        earnRules: [
          { title: 'Purchase a product', description: 'Get 2 Glow Credits for every $1 spent' },
          { title: 'Sign up to the site', description: 'Get 15 Glow Credits' },
          { title: 'Celebrate a birthday', description: 'Get 100 Glow Credits' },
          { title: 'Follow on social media', description: 'Get 50 Glow Credits' }
        ],
        rewards: [
          { title: 'Sparkle Surprise', points: '15,000 Glow Credits', description: '$350 off orders over $8,500' },
          { title: 'Glowing Gratification', points: '20,000 Glow Credits', description: '$500 off orders over $13,000' },
          { title: 'Glow & Glam Goodie', points: '30,000 Glow Credits', description: '15% off orders over $15,000' }
        ]
      },
      {
        name: 'Luminous VIP',
        threshold: '50,000 total earned Glow Credits required',
        rank: 'Level Three',
        icon: 'fa-crown',
        summary: 'Our brightest circle. Your loyalty unlocks premium treats made for your next-level glow.',
        perks: ['Earn 3× more Glow Credits', 'Receive a free pair of exfoliation gloves', 'Unlock rewards worth up to 20% off'],
        earnRules: [
          { title: 'Purchase a product', description: 'Get 3 Glow Credits for every $1 spent' },
          { title: 'Sign up to the site', description: 'Get 25 Glow Credits' },
          { title: 'Celebrate a birthday', description: 'Get 250 Glow Credits' },
          { title: 'Follow on social media', description: 'Get 50 Glow Credits' }
        ],
        rewards: [
          { title: 'Luminous Surprise', points: '40,000 Glow Credits', description: '$300 off a specific category' },
          { title: 'Brilliance Bonus', points: '55,000 Glow Credits', description: '100% off a specific product' },
          { title: 'Luminous Renewal', points: '65,000 Glow Credits', description: '$400 off a specific product' },
          { title: 'Luminary Luxe', points: '70,000 Glow Credits', description: '20% off orders over $15,500' }
        ]
      }
    ],
    cta: {
      title: 'Your routine deserves a little extra glow.',
      description: 'Join the Glow & Go Inner Circle today and make every skincare moment count.',
      label: 'Join the Inner Circle',
      href: 'https://wa.me/18763094374?text=Hi%20For%20You%20Skin%20Bar!%20I%20would%20like%20to%20join%20the%20Glow%20%26%20Go%20Inner%20Circle.'
    },
    terms: 'Glow Credits, tier thresholds, rewards, and eligibility are subject to the active programme terms. Rewards cannot be exchanged for cash and may be changed, paused, or withdrawn by For You Skin Bar at any time.'
  };

  const iconFallback = ['fa-seedling', 'fa-sun', 'fa-crown'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function mergeProgram(value) {
    const incoming = typeof value === 'string' ? safelyParse(value) : value;
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    const defaults = clone(DEFAULT_PROGRAM);

    return {
      ...defaults,
      ...source,
      hero: { ...defaults.hero, ...(source.hero || {}) },
      cta: { ...defaults.cta, ...(source.cta || {}) },
      steps: Array.isArray(source.steps) && source.steps.length ? source.steps : defaults.steps,
      tiers: Array.isArray(source.tiers) && source.tiers.length ? source.tiers.map((tier, index) => ({
        ...defaults.tiers[index % defaults.tiers.length],
        ...tier,
        perks: Array.isArray(tier.perks) ? tier.perks : [],
        earnRules: Array.isArray(tier.earnRules) ? tier.earnRules : [],
        rewards: Array.isArray(tier.rewards) ? tier.rewards : []
      })) : defaults.tiers
    };
  }

  function safelyParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function allowInlineEmphasis(value = '') {
    return escapeHtml(value).replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>').replace(/\n/g, '<br>');
  }

  function safeHref(value, fallback = '#tiers') {
    const href = String(value || '').trim();
    if (/^(https?:\/\/|mailto:|tel:|#|\/|[a-z0-9_-]+\.html(?:[?#].*)?$)/i.test(href)) return href;
    return fallback;
  }

  function renderStep(step, index) {
    return `
      <article class="loyalty-step">
        <span class="loyalty-step-number">${escapeHtml(step.number || String(index + 1).padStart(2, '0'))}</span>
        <i class="fas ${escapeHtml(step.icon || 'fa-sparkles')}"></i>
        <h3>${escapeHtml(step.title || 'Step')}</h3>
        <p>${escapeHtml(step.description || '')}</p>
      </article>`;
  }

  function renderDetails(items, variant) {
    if (!Array.isArray(items) || !items.length) return '<p class="text-sm text-stone-500">Details coming soon.</p>';
    return `<div class="loyalty-detail-grid">${items.map(item => `
      <div class="loyalty-detail">
        <strong>${escapeHtml(item.title || 'Reward')}</strong>
        ${variant === 'reward' && item.points ? `<span class="loyalty-detail-points">${escapeHtml(item.points)}</span>` : ''}
        <span>${escapeHtml(item.description || '')}</span>
      </div>`).join('')}</div>`;
  }

  function renderTier(tier, index) {
    const perks = Array.isArray(tier.perks) ? tier.perks : [];
    return `
      <article class="loyalty-tier">
        <div class="loyalty-tier-top">
          <div class="loyalty-tier-level">
            <span class="loyalty-tier-rank">${escapeHtml(tier.rank || `Level ${index + 1}`)}</span>
            <span class="loyalty-tier-icon"><i class="fas ${escapeHtml(tier.icon || iconFallback[index % iconFallback.length])}"></i></span>
          </div>
          <h3>${escapeHtml(tier.name || 'Glow Level')}</h3>
          <p class="loyalty-tier-threshold">${escapeHtml(tier.threshold || '')}</p>
          <p class="loyalty-tier-summary">${escapeHtml(tier.summary || '')}</p>
        </div>
        <div class="loyalty-tier-body">
          <div>
            <h4>Level benefits</h4>
            <ul class="loyalty-tier-list">${perks.map(perk => `<li>${escapeHtml(perk)}</li>`).join('') || '<li>Exclusive benefits are being prepared.</li>'}</ul>
          </div>
          <div>
            <h4>Earn Glow Credits</h4>
            ${renderDetails(tier.earnRules, 'earn')}
          </div>
          <div>
            <h4>Redeem rewards</h4>
            ${renderDetails(tier.rewards, 'reward')}
          </div>
        </div>
      </article>`;
  }

  function renderPage(program) {
    const hero = program.hero || {};
    const cta = program.cta || {};
    const proof = Array.isArray(hero.proof) ? hero.proof : [];
    const root = document.getElementById('loyaltyRoot');
    if (!root) return;

    if (!program.enabled) {
      root.innerHTML = `<main class="loyalty-page"><section class="loyalty-section"><div class="loyalty-empty"><i class="fas fa-sparkles text-3xl text-amber-700 mb-3"></i><h1 class="serif-heading text-3xl">Rewards are being refreshed.</h1><p class="mt-3">Please check back soon for the next Glow & Go Inner Circle update.</p></div></section></main>`;
      return;
    }

    root.innerHTML = `
      <main class="loyalty-page">
        <section class="loyalty-hero">
          <div class="loyalty-hero-image" ${hero.imageUrl ? `style="background-image:url('${escapeHtml(hero.imageUrl)}')"` : ''}></div>
          <div class="loyalty-hero-inner">
            <span class="loyalty-kicker"><i class="fas fa-sparkles"></i>${escapeHtml(hero.eyebrow || program.name)}</span>
            <h1>${allowInlineEmphasis(hero.title || program.name)}</h1>
            <p class="loyalty-hero-copy">${escapeHtml(hero.description || '')}</p>
            <div class="loyalty-hero-actions">
              <a class="loyalty-btn loyalty-btn-primary" href="${escapeHtml(safeHref(hero.primaryHref, '#tiers'))}">${escapeHtml(hero.primaryLabel || 'Become a Member')} <i class="fas fa-arrow-right"></i></a>
              <a class="loyalty-btn loyalty-btn-secondary" href="#tiers">${escapeHtml(hero.secondaryLabel || 'Explore Rewards')}</a>
            </div>
            ${proof.length ? `<div class="loyalty-hero-proof">${proof.map(item => `<span><i class="fas fa-circle-check"></i>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
          </div>
        </section>

        <section class="loyalty-section" aria-labelledby="how-it-works-heading">
          <div class="loyalty-content">
            <div class="loyalty-section-heading">
              <span class="eyebrow">Simple by design</span>
              <h2 id="how-it-works-heading">Your glow has its rewards.</h2>
              <p>Every level of the Inner Circle is designed to make your self-care routine feel even more rewarding.</p>
            </div>
            <div class="loyalty-steps">${program.steps.map(renderStep).join('')}</div>
          </div>
        </section>

        <section class="loyalty-section loyalty-section-soft" id="tiers" aria-labelledby="tiers-heading">
          <div class="loyalty-content">
            <div class="loyalty-section-heading">
              <span class="eyebrow">Programme tiers</span>
              <h2 id="tiers-heading">Find your glow level.</h2>
              <p>Move through each tier as your Glow Credits grow and unlock more reasons to love your routine.</p>
            </div>
            <div class="loyalty-tier-grid">${program.tiers.map(renderTier).join('')}</div>
          </div>
        </section>

        <section class="loyalty-section">
          <div class="loyalty-content">
            <div class="loyalty-cta">
              <h2>${escapeHtml(cta.title || 'Your routine deserves more glow.')}</h2>
              <p>${escapeHtml(cta.description || '')}</p>
              <a class="loyalty-btn loyalty-btn-primary" href="${escapeHtml(safeHref(cta.href, '#tiers'))}">${escapeHtml(cta.label || 'Join the Inner Circle')} <i class="fas fa-arrow-right"></i></a>
            </div>
            ${program.terms ? `<p class="loyalty-terms">${escapeHtml(program.terms)}</p>` : ''}
          </div>
        </section>
      </main>`;
  }

  async function loadProgram() {
    let program = clone(DEFAULT_PROGRAM);
    try {
      if (window.supabase && typeof window.supabase.from === 'function') {
        const { data, error } = await window.supabase
          .from('store_settings')
          .select('value')
          .eq('key', 'loyalty_program')
          .maybeSingle();
        if (!error && data && data.value) program = mergeProgram(data.value);
      }
    } catch (error) {
      console.warn('Using built-in loyalty programme content.', error);
    }
    renderPage(program);
  }

  document.addEventListener('DOMContentLoaded', loadProgram);
})();
