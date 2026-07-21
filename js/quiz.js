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
    'fade dark spots and hyperpigmentation': 'dark-spots',
    'reduce acne and breakouts': 'acne',
    'brighten dull skin': 'glow',
    'smooth rough texture': 'texture',
    'moisturize dry skin': 'dryness',
    'deeply moisturize dry skin': 'dryness',
    'build a simple daily routine': 'glow'
  };

  const preferenceStepMap = {
    'soap cleanser': ['cleanse'],
    'serum treatment': ['treat'],
    'toner mist': ['tone'],
    'cream moisturizer': ['moisturize'],
    'scrub exfoliation': ['exfoliate'],
    'body butter body oil': ['moisturize', 'body-care']
  };

  const stepAliases = {
    clean: 'cleanse',
    cleanser: 'cleanse',
    cleansing: 'cleanse',
    wash: 'cleanse',
    soap: 'cleanse',
    toner: 'tone',
    toning: 'tone',
    mist: 'tone',
    treatment: 'treat',
    serum: 'treat',
    active: 'treat',
    actives: 'treat',
    moisturise: 'moisturize',
    moisturiser: 'moisturize',
    moisturizer: 'moisturize',
    cream: 'moisturize',
    butter: 'moisturize',
    hydrate: 'moisturize',
    hydrating: 'moisturize',
    scrub: 'exfoliate',
    exfoliant: 'exfoliate',
    exfoliation: 'exfoliate',
    exfoliating: 'exfoliate',
    body: 'body-care',
    bodycare: 'body-care',
    spf: 'protect',
    sunscreen: 'protect'
  };

  const routinePlans = {
    simple: ['cleanse', 'tone', 'treat'],
    balanced: ['cleanse', 'tone', 'treat', 'moisturize'],
    full: ['cleanse', 'exfoliate', 'tone', 'treat', 'moisturize']
  };

  const stepLabels = {
    cleanse: ['Cleanse', 'Start with the admin-approved cleansing product for your answers.'],
    tone: ['Tone', 'Refresh and prep the skin with the selected toner or mist.'],
    treat: ['Treat', 'Target your main concern with the selected treatment.'],
    exfoliate: ['Exfoliate', 'Use the selected exfoliating step as directed.'],
    moisturize: ['Moisturize', 'Seal in hydration with the selected moisture step.'],
    protect: ['Protect', 'Finish with the selected protective step.'],
    'body-care': ['Body Care', 'Support your body-care goal with the selected product.']
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
  const normalize = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const toArray = (value) => Array.isArray(value) ? value : [];
  const canonicalStep = (value) => {
    const normalized = normalize(value);
    const compact = normalized.replace(/\s+/g, '');
    return stepAliases[normalized] || stepAliases[compact] || normalized;
  };
  const parseSteps = (value) => toArray(value).length
    ? value.map(canonicalStep).filter(Boolean)
    : String(value || '').split(/[,\|/]/).map(canonicalStep).filter(Boolean);

  function currentStepElement() {
    return steps.find((step) => Number(step.dataset.step) === currentStep) || null;
  }

  function checkedInputs(step = currentStepElement()) {
    return Array.from(step?.querySelectorAll('input:checked') || []);
  }

  function saveStepAnswers(step = currentStepElement()) {
    if (!step) return;
    const names = [...new Set(Array.from(step.querySelectorAll('input[name]')).map(input => input.name))];
    names.forEach((name) => {
      const selected = Array.from(step.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
      answers[name] = selected.length > 1 ? selected : selected[0];
    });
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

  function selectOption(option) {
    const step = option.closest('.quiz-step');
    const input = option.querySelector('input');
    if (!step || !input || Number(step.dataset.step) !== currentStep) return;

    if (input.type === 'radio') {
      step.querySelectorAll(`input[name="${input.name}"]`).forEach((radio) => {
        radio.checked = false;
        radio.closest('.quiz-option')?.classList.remove('selected');
      });
      input.checked = true;
      option.classList.add('selected');
    } else if (input.type === 'checkbox') {
      const exclusive = input.dataset.exclusive === 'true';
      if (exclusive) {
        step.querySelectorAll(`input[name="${input.name}"]`).forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.closest('.quiz-option')?.classList.remove('selected');
        });
        input.checked = true;
        option.classList.add('selected');
      } else {
        const noPreference = step.querySelector(`input[name="${input.name}"][data-exclusive="true"]`);
        if (noPreference) {
          noPreference.checked = false;
          noPreference.closest('.quiz-option')?.classList.remove('selected');
        }
        input.checked = !input.checked;
        option.classList.toggle('selected', input.checked);
      }
    }

    saveStepAnswers(step);
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
          const input = option.querySelector('input');
          option.classList.toggle('selected', Boolean(input?.checked));
        });
      }
    });

    if (prevBtn) {
      prevBtn.classList.toggle('opacity-0', currentStep === 1);
      prevBtn.classList.toggle('pointer-events-none', currentStep === 1);
    }

    if (nextBtn) {
      nextBtn.textContent = currentStep === totalSteps ? 'See Results' : 'Next';
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

  function concernForGoal(goal) {
    const normalized = normalize(goal);
    return goalMap[normalized] || 'glow';
  }

  function focusArea() {
    const focus = normalize(answers.focus);
    if (focus === 'face care' || focus === 'mostly face care') return 'face';
    if (focus === 'body care' || focus === 'mostly body care') return 'body';
    return 'both';
  }

  function routinePlanKey() {
    const pref = normalize(answers.routinePreference);
    if (pref.includes('quick') || pref.includes('simple')) return 'simple';
    if (pref.includes('full')) return 'full';
    return 'balanced';
  }

  function selectedPreferenceSteps() {
    const preferences = toArray(answers.productPreference).length ? answers.productPreference : [answers.productPreference];
    const steps = [];
    preferences.forEach((preference) => {
      if (normalize(preference) === 'no preference') return;
      (preferenceStepMap[normalize(preference)] || []).forEach((step) => {
        if (!steps.includes(step)) steps.push(step);
      });
    });
    return steps;
  }

  function desiredSteps() {
    return routinePlans[routinePlanKey()] || routinePlans.balanced;
  }

  function isAvailable(product) {
    if (product.allowBackorder || product.trackInventory === false) return true;
    if (product.stockQuantity === null || product.stockQuantity === undefined || product.stockQuantity === '') return true;
    return Number(product.stockQuantity) > 0;
  }

  function productArea(product) {
    const area = normalize(product.productUse);
    if (['face', 'body', 'both'].includes(area)) return area;
    return 'both';
  }

  function productSteps(product) {
    return parseSteps(product.routineSteps?.length ? product.routineSteps : product.routineStep);
  }

  function hasAdminQuizProfile(product) {
    if (Object.prototype.hasOwnProperty.call(product, 'hasRecommendationProfile') && !product.hasRecommendationProfile) return false;
    return productSteps(product).length > 0
      && ['face', 'body', 'both'].includes(productArea(product));
  }

  function canUseForArea(product, area) {
    const productUse = productArea(product);
    return area === 'both' || productUse === 'both' || productUse === area;
  }

  function scoreForStep(product, step, context) {
    if (!product?.id || product.status !== 'active' || !isAvailable(product) || !hasAdminQuizProfile(product)) return -10000;
    if (!productSteps(product).includes(step)) return -10000;
    if (!canUseForArea(product, context.area)) return -10000;

    const concerns = toArray(product.skinConcern).map(normalize);
    const skinTypes = toArray(product.skinType).map(normalize);
    const avoidFor = toArray(product.avoidFor).map(normalize);
    const targetType = normalize(context.skinType);
    let score = 50;

    if (concerns.includes(context.concern)) score += 45;
    else if (context.concern === 'glow' && concerns.length === 0) score += 8;
    else if (concerns.length > 0) score -= 18;

    if (targetType && targetType !== 'not sure') {
      if (avoidFor.includes(targetType)) return -10000;
      if (skinTypes.includes(targetType)) score += 24;
      else if (skinTypes.length === 0) score += 8;
      else score -= 12;
    }

    const sensitivity = normalize(context.sensitivity);
    if (sensitivity.includes('very sensitive') && !product.isSensitiveFriendly) score -= 30;
    if (sensitivity.includes('sensitive') && product.isSensitiveFriendly) score += 14;

    if (productArea(product) === context.area) score += 12;
    if (toArray(context.preferredSteps).includes(step)) score += 18;
    return score;
  }

  function chooseProduct(products, step, used, context) {
    const ranked = products
      .filter(product => !used.has(String(product.id)))
      .map(product => ({ product, score: scoreForStep(product, step, context) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);

    const selected = ranked[0] || null;
    if (selected) used.add(String(selected.product.id));
    return selected;
  }

  function buildRoutine(products) {
    const context = {
      area: focusArea(),
      concern: concernForGoal(answers.goal),
      skinType: answers.type,
      sensitivity: answers.sensitivity,
      preferredSteps: selectedPreferenceSteps()
    };
    const used = new Set();
    const routine = [];

    desiredSteps().forEach((step) => {
      const result = chooseProduct(products, step, used, context);
      if (!result) return;
      const [title, description] = stepLabels[step] || ['Recommendation', 'Selected from the admin quiz settings.'];
      routine.push({
        step,
        label: `${routine.length + 1}. ${title}`,
        description,
        result
      });
    });

    return { routine, context };
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

  function plainText(value = '') {
    const holder = document.createElement('div');
    holder.innerHTML = String(value);
    return (holder.textContent || holder.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function explainChoice(product, step, context) {
    const parts = [];
    const concernLabel = context.concern.replace(/-/g, ' ');
    if (toArray(product.skinConcern).map(normalize).includes(context.concern)) parts.push(`supports ${concernLabel}`);
    if (normalize(context.skinType) !== 'not sure' && toArray(product.skinType).map(normalize).includes(normalize(context.skinType))) parts.push(`fits ${String(context.skinType).toLowerCase()} skin`);
    if (normalize(context.sensitivity).includes('sensitive') && product.isSensitiveFriendly) parts.push('marked sensitive-friendly');
    parts.push(`approved by admin for ${stepLabels[step]?.[0].toLowerCase() || step}`);
    return parts.join(', ') + '.';
  }

  function renderNoResults() {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="bg-white rounded-3xl p-8 shadow-sm border border-amber-50 text-center text-stone-800">
        <h3 class="font-bold text-2xl mb-3">No exact routine match is configured yet.</h3>
        <p class="text-stone-600 mb-6">The quiz now only uses the admin recommendation settings. Add routine steps, skin concerns, skin types, and product-use areas to the products you want the quiz to recommend.</p>
        <a href="shop.html" class="inline-block bg-amber-800 text-white px-6 py-3 rounded-full font-bold hover:bg-amber-900 transition">Shop Products</a>
      </div>`;
    const total = document.getElementById('routineTotal');
    if (total) total.textContent = 'Total Routine Value: J$0';
  }

  function renderRoutine(routine, context) {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;
    let totalValue = 0;

    grid.innerHTML = routine.map((item) => {
      const product = item.result.product;
      totalValue += Number(product.price || 0);
      return `
        <article class="bg-white rounded-3xl p-6 shadow-sm border border-amber-50 flex flex-col md:flex-row gap-6 items-center text-stone-800">
          <div class="w-full md:w-1/3 shrink-0 text-center">
            <h4 class="font-bold text-amber-800 mb-1">${escapeHTML(item.label)}</h4>
            <p class="text-xs text-stone-600 mb-4">${escapeHTML(item.description)}</p>
            <img src="${escapeHTML(product.image)}" class="w-full h-40 object-cover rounded-2xl" alt="${escapeHTML(product.name)}">
          </div>
          <div class="w-full md:w-2/3">
            <h3 class="font-bold text-xl mb-2 text-stone-900">${escapeHTML(product.name)}</h3>
            <p class="text-amber-800 font-bold mb-3">J$${Number(product.price || 0).toLocaleString()}</p>
            <p class="text-stone-700 text-sm mb-4">${escapeHTML(plainText(product.shortDescription || product.description || 'Recommended based on your quiz answers.'))}</p>
            <div class="bg-amber-50 rounded-xl p-4 text-stone-800">
              <p class="text-sm font-bold mb-1">Why we chose this for you:</p>
              <p class="text-sm">${escapeHTML(explainChoice(product, item.step, context))}</p>
            </div>
          </div>
        </article>`;
    }).join('');

    const total = document.getElementById('routineTotal');
    if (total) total.textContent = `Total Routine Value: J$${totalValue.toLocaleString()}`;
  }

  async function generateResults() {
    steps.forEach(saveStepAnswers);
    quizContainer.classList.add('hidden');
    quizResults.classList.remove('hidden');
    quizResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.trackEvent) window.trackEvent('quiz_complete', answers);

    const grid = document.getElementById('routineGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="bg-white rounded-3xl p-8 shadow-sm border border-amber-50 text-center text-stone-800">
          <i class="fas fa-spinner fa-spin text-amber-800 text-2xl mb-3"></i>
          <p class="font-semibold">Building your results...</p>
        </div>`;
    }

    const products = await getProductsSafely();
    const summary = document.getElementById('resultSummary');
    if (!products.length) {
      if (summary) summary.textContent = 'We could not load the product catalogue right now. Please refresh or visit the shop.';
      recommendedRoutine = [];
      renderNoResults();
      return;
    }

    const { routine, context } = buildRoutine(products);
    recommendedRoutine = routine;
    if (summary) {
      const plan = desiredSteps();
      const planLabel = routinePlanKey();
      const stepNames = plan.map(step => stepLabels[step]?.[0] || step).join(', ');
      summary.innerHTML = `Based on your answers, your ${escapeHTML(planLabel)} routine can recommend up to <strong>${plan.length}</strong> product${plan.length === 1 ? '' : 's'}: ${escapeHTML(stepNames)}. Products are selected only from the admin recommendation settings.`;
    }

    if (!routine.length) renderNoResults();
    else renderRoutine(routine, context);
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
    const selected = checkedInputs();
    if (!selected.length) {
      showStepNotice('Please select an option to continue.');
      return;
    }
    saveStepAnswers();
    if (currentStep < totalSteps) {
      moveToStep(currentStep + 1);
      return;
    }
    await generateResults();
  });

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
