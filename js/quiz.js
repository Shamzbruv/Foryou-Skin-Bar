document.addEventListener('DOMContentLoaded', () => {
  const quizContainer = document.getElementById('quizContainer');
  const quizResults = document.getElementById('quizResults');
  const progressFill = document.getElementById('quizProgressFill');
  const stepCounter = document.getElementById('stepCounter');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  if (!quizContainer) return; // Not on quiz page

  let currentStep = 1;
  const totalSteps = 6;
  let answers = {};

  // Initialize UI
  updateUI();

  // Track Start
  if (window.trackEvent) window.trackEvent('quiz_start');

  // Handle Option Clicks
  document.querySelectorAll('.quiz-option input[type="radio"]').forEach(input => {
    input.addEventListener('change', function () {
      const stepEl = this.closest('.quiz-step');
      if (!stepEl) return;

      const stepNumber = Number(stepEl.dataset.step);

      // Ignore anything that does not belong to the current visible step
      if (stepNumber !== currentStep) return;

      const name = this.name;

      document.querySelectorAll(`input[name="${name}"]`).forEach(siblingInput => {
        siblingInput.closest('.quiz-option')?.classList.remove('selected');
      });

      this.closest('.quiz-option')?.classList.add('selected');
      answers[name] = this.value;
    });
  });

  function goToStep(step) {
    const safeStep = Math.max(1, Math.min(totalSteps, Number(step)));

    if (safeStep === currentStep) return;

    currentStep = safeStep;
    updateUI();

    const quizCard = document.getElementById('quizContainer');
    if (quizCard) {
      quizCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Navigation Buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToStep(currentStep - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const currentStepEl = document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
      const checkedInput = currentStepEl?.querySelector('input[type="radio"]:checked');

      if (!checkedInput) {
        alert("Please select an option to continue.");
        return;
      }

      answers[checkedInput.name] = checkedInput.value;

      if (currentStep < totalSteps) {
        goToStep(currentStep + 1);
      } else {
        generateResults();
      }
    });
  }

  function updateUI() {
    // Progress
    const progress = (currentStep / totalSteps) * 100;
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (stepCounter) stepCounter.innerText = `Step ${currentStep} of ${totalSteps}`;
    console.log('Quiz current step:', currentStep, 'Answers:', answers);

    // Show/Hide steps
    document.querySelectorAll('.quiz-step').forEach(step => {
      if (parseInt(step.dataset.step) === currentStep) {
        step.classList.remove('hidden');
        step.classList.add('animate-fade-in');
      } else {
        step.classList.add('hidden');
        step.classList.remove('animate-fade-in');
      }
    });

    // Buttons
    if (prevBtn) {
      if (currentStep === 1) prevBtn.classList.add('opacity-0', 'pointer-events-none');
      else prevBtn.classList.remove('opacity-0', 'pointer-events-none');
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

  async function generateResults() {
    quizContainer.classList.add('hidden');
    quizResults.classList.remove('hidden');
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Track Complete
    if (window.trackEvent) window.trackEvent('quiz_complete', answers);

    // Ensure products are loaded from Supabase
    if (window.loadProductsData) await window.loadProductsData();
    const products = window.productsData || [];

    // Load ingredient rules
    let ingredientRules = [];
    if (window.supabase) {
      try {
        const { data } = await window.supabase.from('ingredient_rules').select('*');
        if (data) ingredientRules = data;
      } catch(e) {
        console.error('Failed to load ingredient rules', e);
      }
    }

    // Run Smart Recommendation Engine
    const results = window.RecommendationEngine.recommend(
      products,
      answers,
      ingredientRules
    );

    const topProducts = results.slice(0, 6);

    // Build Routine
    let routine = [];
    
    const getProductResult = (step) => topProducts.find(r => r.product.routineStep === step);
    
    if (answers.focus === 'Mostly face care' || answers.focus === 'Both face and body') {
      const cleanser = getProductResult('cleanse');
      const treatment = getProductResult('treat');
      const toner = getProductResult('tone');
      const moisturizer = getProductResult('moisturize');
      const exfoliator = getProductResult('exfoliate');
      
      if (cleanser) routine.push({ step: 'Step 1: Cleanse', desc: 'Remove impurities gently.', result: cleanser });
      if (toner && answers.routinePreference === 'Full glow routine') routine.push({ step: 'Step 2: Tone', desc: 'Balance and prep skin.', result: toner });
      if (treatment && answers.routinePreference !== 'Quick and simple') routine.push({ step: 'Step 3: Treat', desc: `Target your main goal.`, result: treatment });
      if (moisturizer) routine.push({ step: 'Step 4: Moisturize', desc: 'Lock in hydration and glow.', result: moisturizer });
      if (exfoliator && answers.routinePreference === 'Full glow routine') routine.push({ step: 'Weekly: Exfoliate', desc: 'Smooth away texture.', result: exfoliator });
    }

    if (answers.focus === 'Mostly body care' || answers.focus === 'Both face and body') {
      const bodyExfoliant = topProducts.find(r => r.product.routineStep === 'exfoliate' && r.product.category === 'Body Care');
      const bodyMoisturizer = topProducts.find(r => r.product.routineStep === 'moisturize' && r.product.category === 'Body Care');
      
      if (bodyExfoliant) routine.push({ step: 'Body Step 1: Polish', desc: 'Smooth away dead skin.', result: bodyExfoliant });
      if (bodyMoisturizer) routine.push({ step: 'Body Step 2: Glow', desc: 'Deeply nourish and seal.', result: bodyMoisturizer });
    }

    // Fallback if routine is empty (e.g. no products matched specific steps)
    if (routine.length === 0) {
      topProducts.slice(0, 3).forEach((r, idx) => {
        routine.push({ step: `Recommendation ${idx + 1}`, desc: 'Selected specifically for you.', result: r });
      });
    }

    // Render Results
    const summaryText = document.getElementById('resultSummary');
    summaryText.innerHTML = `Based on your answers, we've built a routine to help <strong>${String(answers.goal || '').toLowerCase()}</strong> for <strong>${String(answers.type || 'Not sure').toLowerCase()}</strong> skin.`;

    const grid = document.getElementById('routineGrid');
    let totalValue = 0;
    
    grid.innerHTML = routine.map(r => {
      if (!r.result || !r.result.product) return '';
      const p = r.result.product;
      totalValue += p.price || 0;
      
      const reasonsHtml = r.result.reasons && r.result.reasons.length > 0 
        ? `<ul class="list-disc pl-4 text-sm mt-2 text-stone-700">${r.result.reasons.map(res => `<li>${res}</li>`).join('')}</ul>`
        : '';
        
      const warningsHtml = r.result.warnings && r.result.warnings.length > 0 
        ? `<div class="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800"><i class="fas fa-exclamation-triangle mr-2"></i>${r.result.warnings.join('<br>')}</div>`
        : '';

      return `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-amber-50 flex flex-col md:flex-row gap-6 items-center">
          <div class="w-full md:w-1/3 shrink-0 text-center">
            <h4 class="font-bold text-amber-800 mb-1">${r.step}</h4>
            <p class="text-xs text-stone-500 mb-4">${r.desc}</p>
            <img src="${p.image}" class="w-full h-40 object-cover rounded-2xl" alt="${p.name}">
          </div>
          <div class="w-full md:w-2/3">
            <h3 class="font-bold text-xl mb-2">${p.name}</h3>
            <p class="text-amber-800 font-bold mb-3">J$${(p.price || 0).toLocaleString()}</p>
            <p class="text-stone-600 text-sm mb-4">${p.description}</p>
            <div class="bg-amber-50 rounded-xl p-4">
              <p class="text-sm font-bold mb-1">Why we chose this for you:</p>
              ${reasonsHtml}
              ${warningsHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('routineTotal').innerText = `Total Routine Value: J$${totalValue.toLocaleString()}`;

    // Add All Button Logic
    document.getElementById('addAllBtn').onclick = () => {
      routine.forEach(r => {
        if (r.result && r.result.product && window.cartManager) window.cartManager.addItem(r.result.product);
      });
      // Show drawer is handled by CartManager
    };

    // WhatsApp Button Logic
    document.getElementById('sendWhatsAppBtn').onclick = () => {
      let message = `Hi For You Skin Bar! I just took the Skin Quiz and wanted to ask about my recommended routine:\n\n`;
      routine.forEach(r => {
        if (r.result && r.result.product) message += `* ${r.result.product.name}\n`;
      });
      window.openWhatsApp(message);
    };
  }
});
