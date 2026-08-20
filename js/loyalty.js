(() => {
  const DEFAULT_PROGRAM = {
    enabled: true,
    name: 'Glow & Go Inner Circle',
    hero: {
      eyebrow: 'Join the Glow. Get Rewarded.',
      title: 'Join the Glow.\nGet <em>Rewarded</em>.',
      description: 'The Glow & Go Inner Circle is our free rewards programme, created to thank you for choosing ForYou Skin Bar. Join free and get 100 Glow Credits instantly. Earn more when you shop, refer friends, celebrate your birthday, leave reviews, and more.',
      imageUrl: 'assets/products/gift_set.png',
      primaryLabel: 'Join Free',
      primaryHref: 'customer-login.html',
      secondaryLabel: 'Explore Rewards',
      proof: ['Free to join', '100 Glow Credits just for joining', 'Jamaican handmade skincare']
    },
    steps: [
      { number: '01', icon: 'fa-sparkles', title: 'Join', description: 'Sign up for the Glow & Go Inner Circle for free and get 100 Glow Credits instantly. No membership fee, no complicated sign-up.' },
      { number: '02', icon: 'fa-bag-shopping', title: 'Shop', description: 'Earn Glow Credits every time you shop — 1 Glow Credit for every J$100 spent. The more you shop, the more you earn.' },
      { number: '03', icon: 'fa-gift', title: 'Get Rewarded', description: 'Turn your Glow Credits into savings toward your next eligible purchase. 100 Glow Credits = J$100 off, and it keeps going from there.' }
    ],
    tiers: [
      {
        name: 'Radiant Rookie',
        threshold: 'Join for free — everyone starts here',
        rank: 'Welcome to the Inner Circle',
        icon: 'fa-seedling',
        summary: 'As a Radiant Rookie, you get 100 Glow Credits when you join, 1 Glow Credit for every J$100 spent, birthday rewards, member-only offers, access to Glow Days, and opportunities to earn bonus Glow Credits.',
        perks: ['100 Glow Credits when you join', '1 Glow Credit for every J$100 spent', 'Birthday rewards', 'Member-only offers', 'Access to special Glow Days', 'Opportunities to earn bonus Glow Credits'],
        earnRules: [
          { title: 'Join for free', description: 'Get 100 Glow Credits instantly' },
          { title: 'Shop with us', description: 'Get 1 Glow Credit for every J$100 spent' },
          { title: 'Celebrate your birthday', description: 'Get 100 Glow Credits' },
          { title: 'Leave a review', description: 'Get 200 Glow Credits' },
          { title: 'Take the skin quiz', description: 'Get 200 Glow Credits' },
          { title: 'Refer a friend', description: 'Get Glow Credits when they shop' }
        ],
        rewards: [
          { title: 'Shine On', points: '100 Glow Credits', description: 'J$100 off your next eligible purchase' },
          { title: 'Glow Getter', points: '250 Glow Credits', description: 'J$250 off your next eligible purchase' }
        ]
      },
      {
        name: 'Glowing Insider',
        threshold: 'J$10,000 in lifetime purchases required',
        rank: 'Reach J$10,000 in lifetime purchases',
        icon: 'fa-sun',
        summary: 'Your glow is getting stronger. As a Glowing Insider, you get everything in Radiant Rookie, plus 1.5X Glow Credits on purchases, bigger birthday rewards, insider-only offers, early access to new products, exclusive member promotions, and special bonus-credit opportunities.',
        perks: ['1.5X Glow Credits on purchases', 'Bigger birthday rewards', 'Insider-only offers', 'Early access to selected new products', 'Exclusive member promotions', 'Special bonus-credit opportunities'],
        earnRules: [
          { title: 'Shop with us', description: 'Get 1.5 Glow Credits for every J$100 spent' },
          { title: 'Celebrate your birthday', description: 'Get a bigger birthday reward' },
          { title: 'Leave a review', description: 'Get 200 Glow Credits' },
          { title: 'Take the skin quiz', description: 'Get 200 Glow Credits' },
          { title: 'Refer a friend', description: 'Get Glow Credits when they shop' }
        ],
        rewards: [
          { title: 'Sparkle Surprise', points: '500 Glow Credits', description: 'J$500 off your next eligible purchase' },
          { title: 'Glowing Gratification', points: '1,000 Glow Credits', description: 'J$1,000 off your next eligible purchase' }
        ]
      },
      {
        name: 'Luminous VIP',
        threshold: 'J$25,000 in lifetime purchases required',
        rank: 'Reach J$25,000 in lifetime purchases',
        icon: 'fa-crown',
        summary: 'You have reached your ultimate glow. As a Luminous VIP, you get everything in Glowing Insider, plus 2X Glow Credits on purchases, a VIP birthday gift, VIP-only offers, first access to selected new products and limited releases, exclusive VIP promotions, 1 free serum and 1 free toner every six months, and extra opportunities to earn bonus Glow Credits.',
        perks: ['2X Glow Credits on purchases', 'VIP birthday gift', 'VIP-only offers', 'First access to selected new products and limited releases', 'Exclusive VIP promotions', '1 free serum and 1 free toner, semi-annually', 'Extra opportunities to earn bonus Glow Credits'],
        earnRules: [
          { title: 'Shop with us', description: 'Get 2 Glow Credits for every J$100 spent' },
          { title: 'Celebrate your birthday', description: 'Get a VIP birthday gift' },
          { title: 'Leave a review', description: 'Get 200 Glow Credits' },
          { title: 'Take the skin quiz', description: 'Get 200 Glow Credits' },
          { title: 'Refer a friend', description: 'Get Glow Credits when they shop' }
        ],
        rewards: [
          { title: 'Luminous Surprise', points: '1,000 Glow Credits', description: 'J$1,000 off your next eligible purchase' },
          { title: 'Semi-annual product reward', points: 'Automatic at this tier', description: '1 free serum and 1 free toner every six months' }
        ]
      }
    ],
    cta: {
      title: 'Your glow. Your rewards. Your inner circle.',
      description: 'Join the Glow & Go Inner Circle today — free to join, 100 Glow Credits instantly, and more ways to earn every time you shop.',
      label: 'Join Free',
      href: 'customer-login.html'
    },
    terms: 'The Glow & Go Inner Circle is a rewards programme offered by ForYou Skin Bar. Membership is free. 100 Glow Credits always equals J$100 off — Glow Credits have no cash value beyond this fixed rate and cannot be exchanged for cash. Glow Credits expire 6 months after they are earned. Glow Credits are removed if the related order is returned or refunded. Glow Credits cannot be earned on orders using a discount code, and Glow Credits, referral rewards, and promotional discount codes cannot be combined on the same order. There are no minimum purchase requirements to redeem a reward and no product or service exclusions. Tier status (Radiant Rookie, Glowing Insider, Luminous VIP) is based on lifetime purchases and is permanent once reached. Referral rewards: your friend receives 20% off their first eligible purchase, and you receive Glow Credits once they complete that purchase — referral rewards and Glow Credits cannot be combined on the same order. Birthday rewards (100 Glow Credits) are added automatically once your birthday is on file with your account. Luminous VIP members receive 1 free serum and 1 free toner every six months while they remain at that tier. ForYou Skin Bar reserves the right to modify, suspend, or terminate the rewards programme or individual rewards with reasonable notice. Glow Credits earned through fraudulent, abusive, or otherwise prohibited activity may be removed.'
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
