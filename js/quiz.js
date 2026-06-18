document.addEventListener('DOMContentLoaded', () => {
  const quizContainer = document.getElementById('quizContainer');
  const quizResults = document.getElementById('quizResults');
  const progressFill = document.getElementById('quizProgressFill');
  const stepCounter = document.getElementById('stepCounter');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const steps = Array.from(document.querySelectorAll('.quiz-step'));

  if (!quizContainer || steps.length === 0) return;

  let currentStep = 1;
  const totalSteps = steps.length;
  const answers = {};
  let recommendedRoutine = [];

  const concernMap = {
    'Fade dark spots': 'dark-spots',
    'Reduce acne & breakouts': 'acne',
    'Brighten dull skin': 'glow',
    'Smooth rough texture': 'texture',
    'Moisturize dry skin': 'dryness',
    'Build a simple routine': 'glow'
  };

  function getCurrentStepEl() {
    return document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clearStepNotice() {
    document.querySelectorAll('#quizNotice').forEach(el => el.remove());
  }

  function showStepNotice(message) {
    clearStepNotice();
    const stepEl = getCurrentStepEl();
    if (!stepEl) return;

    const notice = document.createElement('div');
    notice.id = 'quizNotice';
    notice.className = 'mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900';
    notice.textContent = message;
    stepEl.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
  }

  function saveSelectedAnswer(input) {
    if (!input || !input.name) return;
    answers[input.name] = input.value;
  }

  function syncSelectedClass(stepEl) {
    if (!stepEl) return;
    stepEl.querySelectorAll('.quiz-option').forEach(option => {
      const input = option.querySelector('input[type="radio"]');
      option.classList.toggle('selected', Boolean(input && input.checked));
    });
  }

  function selectOption(option) {
    const stepEl = option.closest('.quiz-step');
    if (!stepEl) return;

    const stepNumber = Number(stepEl.dataset.step);
    if (stepNumber !== currentStep) return;

    const input = option.querySelector('input[type="radio"]');
    if (!input) return;

    stepEl.querySelectorAll(`input[name="${input.name}"]`).forEach(radio => {
      radio.checked = false;
      radio.closest('.quiz-option')?.classList.remove('selected');
    });

    input.checked = true;
    option.classList.add('selected');
    saveSelectedAnswer(input);
    clearStepNotice();
  }

  function goToStep(step) {
    const safeStep = Math.max(1, Math.min(totalSteps, Number(step)));
    if (safeStep === currentStep) return;

    currentStep = safeStep;
    clearStepNotice();
    updateUI();

    quizContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Handle clicks directly on the visible option cards.
  // This avoids radio/label double-fire issues and prevents auto-advance.
  steps.forEach(stepEl => {
    stepEl.querySelectorAll('.quiz-option').forEach(option => {
      option.addEventListener('click', event => {
        event.preventDefault();
        selectOption(option);
      });

      option.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectOption(option);
        }
      });
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) goToStep(currentStep - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const currentStepEl = getCurrentStepEl();
      const checkedInput = currentStepEl?.querySelector('input[type="radio"]:checked');

      if (!checkedInput) {
        showStepNotice('Please select an option to continue.');
        return;
      }

      saveSelectedAnswer(checkedInput);

      if (currentStep < totalSteps) {
        goToStep(currentStep + 1);
      } else {
        generateResults();
      }
    });
  }

  function updateUI() {
    const progress = (currentStep / totalSteps) * 100;
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (stepCounter) stepCounter.innerText = `Step ${currentStep} of ${totalSteps}`;

    steps.forEach(step => {
      const isActive = Number(step.dataset.step) === currentStep;
      step.classList.toggle('hidden', !isActive);
      step.classList.toggle('animate-fade-in', isActive);
      if (isActive) syncSelectedClass(step);
    });

    if (prevBtn) {
      prevBtn.classList.toggle('opacity-0', currentStep === 1);
      prevBtn.classList.toggle('pointer-events-none', currentStep === 1);
    }

    if (nextBtn) {
      if (currentStep === totalSteps) {
        nextBtn.innerHTML = 'See Results ✨';
        nextBtn.classList.remove('bg-stone-200', 'text-stone-700');
        nextBtn.classList.add('bg-amber-800', 'text-white');
      } else {
        nextBtn.innerHTML = 'Next →';
        nextBtn.classList.add('bg-stone-200', 'text-stone-700');
        nextBtn.classList.remove('bg-amber-800', 'text-white');
      }
    }
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

  function basicScoreProduct(product, targetConcern, targetType, focus, currentRoutine, budget) {
    let score = 0;
    const concerns = toArray(product.skinConcern).map(normalize);
    const skinTypes = toArray(product.skinType).map(normalize);
    const category = normalize(product.category);
    const routineStep = normalize(product.routineStep);
    const text = normalize([
      product.name,
      product.category,
      product.description,
      product.shortDescription,
      product.ingredientsHtml,
      product.bestForHtml
    ].join(' '));

    if (concerns.includes(targetConcern)) score += 45;
    if (targetConcern === 'glow' && (concerns.includes('dark-spots') || concerns.includes('dryness'))) score += 20;
    if (targetConcern === 'texture' && /scrub|exfoliat|smooth|texture/.test(text)) score += 25;
    if (targetConcern === 'body-care' && /body|butter|mist|oil|scrub|soap/.test(text)) score += 25;

    if (targetType && skinTypes.includes(targetType)) score += 20;
    if (targetType === 'normal' && skinTypes.length === 0) score += 5;

    if (focus === 'Mostly body care' && /body|butter|mist|oil|scrub/.test(text)) score += 25;
    if (focus === 'Mostly face care' && !/body butter|body mist|body oil/.test(text)) score += 10;

    if (currentRoutine === 'Minimal' && ['cleanse', 'moisturize', 'treat'].includes(routineStep)) score += 10;
    if (currentRoutine === 'Advanced' && ['treat', 'tone', 'exfoliate'].includes(routineStep)) score += 10;

    const price = Number(product.price || 0);
    if (budget === 'Under J$2,000' && price > 2000) score -= 20;
    if (budget === 'J$2,000 - J$5,000' && price > 5000) score -= 15;

    if (product.trackInventory && Number(product.stockQuantity || 0) <= 0 && !product.allowBackorder) score -= 100;

    return score;
  }

  function buildRecommendationResults(products, answersForResults) {
    const goal = answersForResults.goal || 'Build a simple routine';
    const targetConcern = concernMap[goal] || 'glow';
    const targetType = normalize(answersForResults.type || 'Not sure') === 'not sure' ? 'normal' : normalize(answersForResults.type || 'normal');
    const focus = answersForResults.focus || 'Both face and body';
    const currentRoutine = answersForResults.currentRoutine || 'Basic';
    const budget = answersForResults.budget || 'No limit';

    if (window.RecommendationEngine && typeof window.RecommendationEngine.recommend === 'function') {
      try {
        const smartResults = window.RecommendationEngine.recommend(products, answersForResults, []);
        if (Array.isArray(smartResults) && smartResults.length) return { results: smartResults, targetConcern, targetType, focus };
      } catch (error) {
        console.warn('Smart recommendation engine failed. Using fallback scoring.', error);
      }
    }

    const results = products
      .map(product => ({
        product,
        score: basicScoreProduct(product, targetConcern, targetType, focus, currentRoutine, budget),
        reasons: ['Matched using the current shop catalog and your quiz answers.'],
        warnings: []
      }))
      .sort((a, b) => b.score - a.score);

    return { results, targetConcern, targetType, focus };
  }

  function pickStepProduct(results, step, fallbackRegex, usedIds) {
    const normalizedStep = normalize(step);
    const found = results.find(result => {
      const product = result.product;
      if (!product || usedIds.has(product.id)) return false;
      const productStep = normalize(product.routineStep);
      const text = normalize(`${product.name} ${product.category} ${product.description} ${product.shortDescription}`);
      return productStep === normalizedStep || fallbackRegex.test(text);
    });

    if (found) {
      usedIds.add(found.product.id);
      return found;
    }

    const fallback = results.find(result => result.product && !usedIds.has(result.product.id));
    if (fallback) usedIds.add(fallback.product.id);
    return fallback || null;
  }

  function renderNoProductsMessage() {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="bg-white rounded-3xl p-8 shadow-sm border border-amber-50 text-center text-stone-800">
        <h3 class="font-bold text-2xl mb-3">We could not load product recommendations right now.</h3>
        <p class="text-stone-600 mb-6">Your answers were saved, but the product catalog did not load. Please refresh the page or visit the shop directly.</p>
        <a href="shop.html" class="inline-block bg-amber-800 text-white px-6 py-3 rounded-full font-bold hover:bg-amber-900 transition">Shop Products</a>
      </div>
    `;

    const totalEl = document.getElementById('routineTotal');
    if (totalEl) totalEl.innerText = 'Total Routine Value: J$0';
  }

  async function generateResults() {
    document.querySelectorAll('.quiz-step input[type="radio"]:checked').forEach(saveSelectedAnswer);

    quizContainer.classList.add('hidden');
    quizResults.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.trackEvent) window.trackEvent('quiz_complete', answers);

    const products = await getProductsSafely();
    if (!products.length) {
      recommendedRoutine = [];
      const summaryText = document.getElementById('resultSummary');
      if (summaryText) summaryText.innerHTML = 'We saved your quiz answers, but the product catalog could not be loaded.';
      renderNoProductsMessage();
      return;
    }

    const { results, targetConcern, targetType, focus } = buildRecommendationResults(products, answers);
    const topResults = results.slice(0, 8);
    const usedIds = new Set();
    const routine = [];

    if (focus === 'Mostly face care' || focus === 'Both face and body') {
      const cleanser = pickStepProduct(topResults, 'cleanse', /soap|cleanse|wash/, usedIds);
      const treatment = pickStepProduct(topResults, 'treat', /serum|elixir|cream|treat|boost/, usedIds);
      const moisturizer = pickStepProduct(topResults, 'moisturize', /moistur|butter|cream|oil/, usedIds);

      if (cleanser) routine.push({ step: 'Step 1: Cleanse', desc: 'Start with a gentle cleanse.', result: cleanser });
      if (treatment) routine.push({ step: 'Step 2: Treat', desc: `Support ${targetConcern.replace('-', ' ')}.`, result: treatment });
      if (moisturizer) routine.push({ step: 'Step 3: Moisturize', desc: 'Lock in hydration and glow.', result: moisturizer });
    }

    if (focus === 'Mostly body care' || focus === 'Both face and body') {
      const bodyExfoliant = pickStepProduct(topResults, 'exfoliate', /scrub|exfoliat|polish/, usedIds);
      const bodyMoisturizer = pickStepProduct(topResults, 'moisturize', /body|butter|oil|moistur/, usedIds);

      if (bodyExfoliant) routine.push({ step: 'Body Step 1: Polish', desc: 'Smooth rough texture and refresh the skin.', result: bodyExfoliant });
      if (bodyMoisturizer) routine.push({ step: 'Body Step 2: Glow', desc: 'Nourish and seal in moisture.', result: bodyMoisturizer });
    }

    if (!routine.length) {
      topResults.slice(0, 3).forEach((result, index) => {
        routine.push({ step: `Recommendation ${index + 1}`, desc: 'Best match based on your answers.', result });
      });
    }

    recommendedRoutine = routine;

    const summaryText = document.getElementById('resultSummary');
    if (summaryText) {
      summaryText.innerHTML = `Based on your answers, we built a routine for <strong>${targetType}</strong> skin to support <strong>${String(answers.goal || 'your skin goals').toLowerCase()}</strong>.`;
    }

    renderResults(routine, targetConcern, targetType);
  }

  function renderResults(routine, targetConcern, targetType) {
    const grid = document.getElementById('routineGrid');
    if (!grid) return;

    let totalValue = 0;

    grid.innerHTML = routine.map(r => {
      if (!r.result || !r.result.product) return '';
      const p = r.result.product;
      totalValue += Number(p.price || 0);
      const reasons = toArray(r.result.reasons);
      const warnings = toArray(r.result.warnings);

      const reasonsHtml = reasons.length
        ? `<ul class="list-disc pl-4 text-sm mt-2 text-stone-700">${reasons.map(reason => `<li>${reason}</li>`).join('')}</ul>`
        : `<p class="text-sm text-stone-700">Matched to your ${targetConcern.replace('-', ' ')} goal and ${targetType} skin profile using the current shop catalog.</p>`;

      const warningsHtml = warnings.length
        ? `<div class="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800"><i class="fas fa-exclamation-triangle mr-2"></i>${warnings.join('<br>')}</div>`
        : '';

      return `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-amber-50 flex flex-col md:flex-row gap-6 items-center text-stone-800">
          <div class="w-full md:w-1/3 shrink-0 text-center">
            <h4 class="font-bold text-amber-800 mb-1">${r.step}</h4>
            <p class="text-xs text-stone-500 mb-4">${r.desc}</p>
            <img src="${p.image}" class="w-full h-40 object-cover rounded-2xl" alt="${p.name}">
          </div>
          <div class="w-full md:w-2/3">
            <h3 class="font-bold text-xl mb-2">${p.name}</h3>
            <p class="text-amber-800 font-bold mb-3">J$${Number(p.price || 0).toLocaleString()}</p>
            <p class="text-stone-600 text-sm mb-4">${p.description || p.shortDescription || 'Recommended based on your quiz answers.'}</p>
            <div class="bg-amber-50 rounded-xl p-4">
              <p class="text-sm font-bold mb-1">Why we chose this for you:</p>
              ${reasonsHtml}
              ${warningsHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const totalEl = document.getElementById('routineTotal');
    if (totalEl) totalEl.innerText = `Total Routine Value: J$${totalValue.toLocaleString()}`;
  }

  const addAllBtn = document.getElementById('addAllBtn');
  if (addAllBtn) {
    addAllBtn.onclick = () => {
      recommendedRoutine.forEach(r => {
        if (r.result && r.result.product && window.cartManager) window.cartManager.addItem(r.result.product);
      });
    };
  }

  const whatsAppBtn = document.getElementById('sendWhatsAppBtn');
  if (whatsAppBtn) {
    whatsAppBtn.onclick = () => {
      let message = 'Hi For You Skin Bar! I just took the Skin Quiz and wanted to ask about my recommended routine:\n\n';
      recommendedRoutine.forEach(r => {
        if (r.result && r.result.product) message += `* ${r.result.product.name}\n`;
      });

      if (window.openWhatsApp) {
        window.openWhatsApp(message);
      } else {
        window.open(`https://wa.me/18763094374?text=${encodeURIComponent(message)}`, '_blank');
      }
    };
  }

  updateUI();
  if (window.trackEvent) window.trackEvent('quiz_start');
});
