document.addEventListener('DOMContentLoaded', () => {
  const quizContainer = document.getElementById('quizContainer');
  const quizResults = document.getElementById('quizResults');
  const progressFill = document.getElementById('quizProgressFill');
  const stepCounter = document.getElementById('stepCounter');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const steps = Array.from(document.querySelectorAll('.quiz-step'));

  if (!quizContainer || !quizResults || !steps.length) return;

  let currentStep = 1;
  const totalSteps = steps.length;
  const answers = {};
  let recommendedRoutine = [];

  const goalMap = {
    'fade dark spots': 'dark-spots',
    'reduce acne and breakouts': 'acne',
    'brighten dull skin': 'glow',
    'smooth rough texture': 'texture',
    'moisturize dry skin': 'dryness',
    'build a simple daily routine': 'glow'
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
  const normalize = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const toArray = (value) => Array.isArray(value) ? value : [];

  function currentStepElement() {
    return steps.find((step) => Number(step.dataset.step) === currentStep) || null;
  }

  function showStepNotice(message) {
    document.getElementById('quizNotice')?.remove();
    const step = currentStepElement();
    if (!step) return;
    const notice = document.createElement('div');
    notice.id = 'quizNotice';
    notice.className = 'mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900';
    notice.textContent = message;
    step.appendChild(notice);
  }

  function saveAnswer(input) {
    if (input?.name) answers[input.name] = input.value;
  }

  function selectOption(option) {
    const step = option.closest('.quiz-step');
    const input = option.querySelector('input[type="radio"]');
    if (!step || !input || Number(step.dataset.step) !== currentStep) return;

    step.querySelectorAll(`input[name="${input.name}"]`).forEach((radio) => {
      radio.checked = false;
      radio.closest('.quiz-option')?.classList.remove('selected');
    });
    input.checked = true;
    option.classList.add('selected');
    saveAnswer(input);
    document.getElementById('quizNotice')?.remove();
  }

  function updateUI() {
    const progress = (currentStep / totalSteps) * 100;
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (stepCounter) stepCounter.textContent = `Step ${currentStep} of ${totalSteps}`;

    steps.forEach((step) => {
      const active = Number(step.dataset.step) === currentStep;
      step.classList.toggle('hidden', !active);
      if (active) {
        step.querySelectorAll('.quiz-option').forEach((option) => {
          const input = option.querySelector('input[type="radio"]');
          option.classList.toggle('selected', Boolean(input?.checked));
        });
      }
    });

    if (prevBtn) {
      prevBtn.classList.toggle('opacity-0', currentStep === 1);
      prevBtn.classList.toggle('pointer-events-none', currentStep === 1);
    }

    if (nextBtn) {
      nextBtn.textContent = currentStep === totalSteps ? 'See Results ✨' : 'Next →';
      nextBtn.classList.remove('bg-stone-200', 'text-stone-700', 'hover:bg-stone-300');
      nextBtn.classList.add('bg-amber-800', 'text-white', 'hover:bg-amber-900');
    }
  }

  function moveToStep(nextStep) {
    currentStep = Math.max(1, Math.min(totalSteps, nextStep));
    document.getElementById('quizNotice')?.remove();
    updateUI();
    quizContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  steps.forEach((step) => {
    step.querySelectorAll('.quiz-option').forEach((option) => {
      option.tabIndex = 0;
      option.addEventListener('click', (event) => {
        event.preventDefault();
        selectOption(option);
      });
      option.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectOption(option);
        }
      });
    });
  });

  prevBtn?.addEventListener('click', () => {
    if (currentStep > 1) moveToStep(currentStep - 1);
  });

  nextBtn?.addEventListener('click', async () => {
    const selected = currentStepElement()?.querySelector('input[type="radio"]:checked');
    if (!selected) {
      showStepNotice('Please select an option to continue.');
      return;
    }
    saveAnswer(selected);
    if (currentStep < totalSteps) {
      moveToStep(currentStep + 1);
      return;
    }
    await generateResults();
  });

  function concernForGoal(goal) {
    const normalized = normalize(goal);
    return goalMap[normalized] || (normalized.includes('acne') ? 'acne' : 'glow');
  }

  function productText(product) {
    return normalize([
      product.name,
      product.category,
      product.description,
      product.shortDescription,
      product.bestFor,
      product.bestForHtml,
      product.resultsHtml,
      product.ingredientsHtml,
      product.routineStep
    ].join(' '));
  }

  function isAccessory(product) {
    return /soap saver|mesh bag|soap dish|facial sponge|exfoliation glove|spa headband|bamboo dish|skincare tool|accessory/.test(productText(product));
  }

  function productArea(product) {
    const declared = normalize(product.productUse);
    if (declared === 'face' || declared === 'body') return declared;
    const text = productText(product);
    if (/body butter|body oil|body mist|body scrub|coffee rush|island vybz|vanilla bae|bold touch|in your dreams/.test(text)) return 'body';
    if (/serum|toner|vanishing cream|face cream|blemish|acne|hyperpigmentation|niacinamide|salicylic/.test(text)) return 'face';
    return 'both';
  }

  function isAvailable(product) {
    if (product.allowBackorder || product.trackInventory === false) return true;
    if (product.stockQuantity === null || product.stockQuantity === undefined || product.stockQuantity === '') return true;
    return Number(product.stockQuantity) > 0;
  }

  function stepMatches(product, desiredStep, expression) {
    const current = normalize(product.routineStep);
    return current === desiredStep || expression.test(productText(product));
  }

  function scoreProduct(product, targetConcern, targetType, focus, preference) {
    if (!product?.id || product.status !== 'active' || !isAvailable(product) || isAccessory(product)) return -10000;

    const concerns = toArray(product.skinConcern).map(normalize);
    const skinTypes = toArray(product.skinType).map(normalize);
    const avoidFor = toArray(product.avoidFor).map(normalize);
    const area = productArea(product);
    const text = productText(product);
    let score = 0;

    if (focus === 'Mostly face care' && area === 'body') return -10000;
    if (focus === 'Mostly body care' && area === 'face') return -10000;

    if (concerns.includes(targetConcern)) score += 70;
    else if (targetConcern === 'glow' && (concerns.includes('dark spots') || concerns.includes('dryness'))) score += 24;
    else score -= 16;

    if (focus === 'Mostly face care' && area === 'face') score += 32;
    if (focus === 'Mostly body care' && area === 'body') score += 32;

    if (targetType && targetType !== 'not sure') {
      if (skinTypes.includes(targetType)) score += 22;
      else if (skinTypes.length === 0) score += 5;
      else score -= 8;
      if (avoidFor.includes(targetType)) return -10000;
    }

    const sensitivity = normalize(answers.sensitivity);
    if (sensitivity.includes('very sensitive')) score += product.isSensitiveFriendly ? 15 : -10;
    if (sensitivity.includes('somewhat sensitive') && product.isSensitiveFriendly) score += 8;

    const preferenceMap = {
      'soap cleanser': 'cleanse',
      'serum treatment': 'treat',
      'toner mist': 'tone',
      'cream moisturizer': 'moisturize',
      'scrub exfoliation': 'exfoliate',
      'body butter body oil': 'moisturize'
    };
    const preferredStep = preferenceMap[normalize(preference)];
    if (preferredStep && normalize(product.routineStep) === preferredStep) score += 12;

    if (targetConcern === 'acne' && /salicylic|niacinamide|neem|turmeric|blemish|acne/.test(text)) score += 12;
    if (targetConcern === 'dark-spots' && /kojic|vitamin c|niacinamide|dark spot|hyperpigmentation/.test(text)) score += 12;
    if (targetConcern === 'dryness' && /moistur|hydrating|butter|oil|cream/.test(text)) score += 12;

    return score;
  }

  function rankProducts(products) {
    const targetConcern = concernForGoal(answers.goal);
    const targetType = normalize(answers.type);
    const focus = answers.focus || 'Both face and body';
    const preference = answers.productPreference || 'No preference';

    return products
      .map((product) => ({
        product,
        score: scoreProduct(product, targetConcern, targetType, focus, preference)
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  function chooseProduct(ranked, used, desiredStep, matcher, area) {
    const candidate = ranked.find(({ product }) => {
      if (!product || used.has(String(product.id))) return false;
      if (area && productArea(product) !== area && productArea(product) !== 'both') return false;
      return stepMatches(product, desiredStep, matcher);
    });
    if (!candidate) return null;
    used.add(String(candidate.product.id));
    return candidate;
  }

  function chooseBestSameArea(ranked, used, area) {
    const candidate = ranked.find(({ product }) => {
      if (!product || used.has(String(product.id))) return false;
      return !area || productArea(product) === area || productArea(product) === 'both';
    });
    if (!candidate) return null;
    used.add(String(candidate.product.id));
    return candidate;
  }

  function buildRoutine(products) {
    const ranked = rankProducts(products);
    const focus = answers.focus || 'Both face and body';
    const compact = normalize(answers.routinePreference).includes('quick');
    const used = new Set();
    const routine = [];

    const add = (label, description, result) => {
      if (result?.product) routine.push({ label, description, result });
    };

    const buildFace = () => {
      const cleanse = chooseProduct(ranked, used, 'cleanse', /soap|cleanser|cleanse|wash/, 'face');
      const treat = chooseProduct(ranked, used, 'treat', /serum|elixir|blemish|treat|toner|vanishing cream/, 'face');
      const moisturize = chooseProduct(ranked, used, 'moisturize', /cream|moistur|hydrating|lotion/, 'face');
      add('Step 1: Cleanse', 'Start with a face cleanser selected for your skin goal.', cleanse);
      add('Step 2: Treat', 'Target your main skin concern with a focused treatment.', treat);
      if (!compact || routine.length < 2) add('Step 3: Moisturize', 'Finish with face-friendly moisture and support.', moisturize);
      if (!routine.length) add('Recommendation', 'Best available match for your answers.', chooseBestSameArea(ranked, used, 'face'));
    };

    const buildBody = () => {
      const exfoliate = chooseProduct(ranked, used, 'exfoliate', /scrub|exfoliat|polish/, 'body');
      const moisturize = chooseProduct(ranked, used, 'moisturize', /body butter|body oil|body cream|moistur/, 'body');
      add('Body Step 1: Polish', 'Smooth and refresh body skin with a suitable exfoliant.', exfoliate);
      add('Body Step 2: Nourish', 'Seal in moisture with body-focused hydration.', moisturize);
      if (!routine.length) add('Recommendation', 'Best available match for your answers.', chooseBestSameArea(ranked, used, 'body'));
    };

    if (focus === 'Mostly face care') buildFace();
    else if (focus === 'Mostly body care') buildBody();
    else {
      buildFace();
      buildBody();
    }

    if (!routine.length) {
      const fallback = chooseBestSameArea(ranked, used, focus === 'Mostly face care' ? 'face' : focus === 'Mostly body care' ? 'body' : null);
      add('Recommendation', 'Best available match for your answers.', fallback);
    }

    return { routine, targetConcern: concernForGoal(answers.goal), targetType: answers.type || 'your' };
  }

  async function getProductsSafely() {
    try {
      if (window.loadProductsData) await window.loadProductsData();
      return Array.isArray(window.productsData) ? window.productsData : [];
    } catch (error) {
      console.error('Skin quiz product loading error:', error);
      return [];
    }
  }

  function renderNoResults() {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="bg-white rounded-3xl p-8 shadow-sm border border-amber-50 text-center text-stone-800">
        <h3 class="font-bold text-2xl mb-3">We could not find an in-stock routine for those exact answers.</h3>
        <p class="text-stone-600 mb-6">Please try another preference or browse the full collection. We do not add unrelated products to complete a routine.</p>
        <a href="shop.html" class="inline-block bg-amber-800 text-white px-6 py-3 rounded-full font-bold hover:bg-amber-900 transition">Shop Products</a>
      </div>`;
    const total = document.getElementById('routineTotal');
    if (total) total.textContent = 'Total Routine Value: J$0';
  }

  function plainText(value = '') {
    const holder = document.createElement('div');
    holder.innerHTML = String(value);
    return (holder.textContent || holder.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function renderRoutine(routine, targetConcern, targetType) {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;
    let totalValue = 0;

    grid.innerHTML = routine.map((item) => {
      const product = item.result.product;
      totalValue += Number(product.price || 0);
      const explanation = `Matched to your ${targetConcern.replace(/-/g, ' ')} goal${targetType && normalize(targetType) !== 'not sure' ? ` and ${String(targetType).toLowerCase()} skin profile` : ''}.`;
      return `
        <article class="bg-white rounded-3xl p-6 shadow-sm border border-amber-50 flex flex-col md:flex-row gap-6 items-center text-stone-800">
          <div class="w-full md:w-1/3 shrink-0 text-center">
            <h4 class="font-bold text-amber-800 mb-1">${escapeHTML(item.label)}</h4>
            <p class="text-xs text-stone-500 mb-4">${escapeHTML(item.description)}</p>
            <img src="${escapeHTML(product.image)}" class="w-full h-40 object-cover rounded-2xl" alt="${escapeHTML(product.name)}">
          </div>
          <div class="w-full md:w-2/3">
            <h3 class="font-bold text-xl mb-2">${escapeHTML(product.name)}</h3>
            <p class="text-amber-800 font-bold mb-3">J$${Number(product.price || 0).toLocaleString()}</p>
            <p class="text-stone-600 text-sm mb-4">${escapeHTML(plainText(product.shortDescription || product.description || 'Recommended based on your quiz answers.'))}</p>
            <div class="bg-amber-50 rounded-xl p-4">
              <p class="text-sm font-bold mb-1">Why we chose this for you:</p>
              <p class="text-sm text-stone-700">${escapeHTML(explanation)}</p>
            </div>
          </div>
        </article>`;
    }).join('');

    const total = document.getElementById('routineTotal');
    if (total) total.textContent = `Total Routine Value: J$${totalValue.toLocaleString()}`;
  }

  async function generateResults() {
    document.querySelectorAll('.quiz-step input[type="radio"]:checked').forEach(saveAnswer);
    quizContainer.classList.add('hidden');
    quizResults.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.trackEvent) window.trackEvent('quiz_complete', answers);

    const products = await getProductsSafely();
    if (!products.length) {
      document.getElementById('resultSummary').textContent = 'We could not load the product catalogue right now. Please refresh or visit the shop.';
      recommendedRoutine = [];
      renderNoResults();
      return;
    }

    const { routine, targetConcern, targetType } = buildRoutine(products);
    recommendedRoutine = routine;
    const summary = document.getElementById('resultSummary');
    if (summary) {
      summary.innerHTML = `Based on your answers, we selected only <strong>in-stock</strong> products that suit your <strong>${escapeHTML(String(answers.focus || 'skincare').toLowerCase())}</strong> routine and support <strong>${escapeHTML(String(answers.goal || 'your skin goal').toLowerCase())}</strong>.`;
    }

    if (!routine.length) renderNoResults();
    else renderRoutine(routine, targetConcern, targetType);
  }

  const addAllBtn = document.getElementById('addAllBtn');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', () => {
      const uniqueProducts = [...new Map(recommendedRoutine
        .filter((item) => item.result?.product)
        .map((item) => [String(item.result.product.id), item.result.product]))
        .values()];
      uniqueProducts.forEach((product) => window.cartManager?.addItem(product));
    });
  }

  const whatsAppBtn = document.getElementById('sendWhatsAppBtn');
  if (whatsAppBtn) {
    whatsAppBtn.addEventListener('click', () => {
      let message = 'Hi For You Skin Bar! I just took the Skin Quiz and would like help with this recommended routine:\n\n';
      const uniqueProducts = [...new Map(recommendedRoutine
        .filter((item) => item.result?.product)
        .map((item) => [String(item.result.product.id), item.result.product]))
        .values()];
      uniqueProducts.forEach((product) => { message += `* ${product.name}\n`; });
      if (window.openWhatsApp) window.openWhatsApp(message);
      else window.open(`https://wa.me/18763094374?text=${encodeURIComponent(message)}`, '_blank');
    });
  }

  updateUI();
  if (window.trackEvent) window.trackEvent('quiz_start');
});
