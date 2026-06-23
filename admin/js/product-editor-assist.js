(() => {
  'use strict';

  const onReady = (callback) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  const field = (id) => document.getElementById(id);

  function labelFor(input) {
    if (!input) return null;
    const parent = input.closest('div');
    return parent?.querySelector('label') || null;
  }

  function addHelpText(input, message, className) {
    if (!input || input.parentElement.querySelector(`.${className}`)) return;
    const note = document.createElement('p');
    note.className = `${className} mt-1 text-xs leading-relaxed text-stone-500`;
    note.textContent = message;
    input.insertAdjacentElement('afterend', note);
  }

  function improveLabels() {
    const benefits = field('productBenefits');
    const ingredients = field('productIngredients');
    const directions = field('productHowToUse');
    const policy = field('returnPolicy');

    const benefitsLabel = labelFor(benefits);
    if (benefitsLabel) benefitsLabel.textContent = 'Results / What This Helps With';
    addHelpText(benefits, 'This appears near the top of the product page under “Results”. Add the clear outcomes or benefits here. Do not create a separate custom section named “Results”.', 'results-field-help');

    const ingredientsLabel = labelFor(ingredients);
    if (ingredientsLabel) ingredientsLabel.textContent = 'Key Ingredients';
    addHelpText(ingredients, 'This appears in the Key Ingredients section on the customer product page.', 'ingredients-field-help');

    const directionsLabel = labelFor(directions);
    if (directionsLabel) directionsLabel.textContent = 'How To Use';
    addHelpText(directions, 'This appears in the How To Use section on the customer product page.', 'howto-field-help');

    const policyLabel = labelFor(policy);
    if (policyLabel) policyLabel.textContent = 'Return / Refund Policy';
    addHelpText(policy, 'This appears as the full Return / Refund Policy on the customer product page.', 'policy-field-help');

    const contentHeading = [...document.querySelectorAll('h3')].find((heading) => heading.textContent.includes('Product Page Content Blocks'));
    if (contentHeading && !contentHeading.parentElement.querySelector('.product-page-map-help')) {
      const map = document.createElement('p');
      map.className = 'product-page-map-help text-sm text-stone-600 mb-4';
      map.textContent = 'These labels match the customer-facing product page in the same order: Results, Key Ingredients, How To Use, and Return / Refund Policy.';
      contentHeading.insertAdjacentElement('afterend', map);
    }
  }

  function moveLegacyResultsIntoCorrectField() {
    const benefits = field('productBenefits');
    const rows = [...document.querySelectorAll('.info-section-row')];
    let moved = false;

    rows.forEach((row) => {
      const titleInput = row.querySelector('[data-field="title"]');
      const bodyInput = row.querySelector('[data-field="body"]');
      const title = titleInput?.value.trim().toLowerCase() || '';
      const body = bodyInput?.value.trim() || '';
      if (!/^results?$/i.test(title) || !body) return;

      const current = benefits?.value.trim() || '';
      if (benefits) {
        benefits.value = current ? `${current}\n${body}` : body;
        benefits.dispatchEvent(new Event('input', { bubbles: true }));
      }
      row.remove();
      moved = true;
    });

    if (moved) {
      const toastMessage = document.getElementById('toastMessage');
      if (toastMessage) toastMessage.textContent = 'Moved legacy Results content to the correct Results field before saving.';
    }
  }

  function addLegacyResultsWarning() {
    document.querySelectorAll('.info-section-row').forEach((row) => {
      const titleInput = row.querySelector('[data-field="title"]');
      const title = titleInput?.value.trim().toLowerCase() || '';
      if (!/^results?$/i.test(title) || row.querySelector('.legacy-results-warning')) return;
      const warning = document.createElement('p');
      warning.className = 'legacy-results-warning md:col-span-12 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2';
      warning.textContent = '“Results” belongs in the Results / What This Helps With field above. It will be moved automatically when you save this product.';
      row.appendChild(warning);
    });
  }

  function observeEditor() {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) {
        improveLabels();
        addLegacyResultsWarning();
      }
    });
    observer.observe(modal, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  onReady(() => {
    improveLabels();
    observeEditor();

    // Capture phase guarantees this correction happens before the existing form handler
    // serializes the fields into Supabase.
    document.addEventListener('submit', (event) => {
      if (event.target?.id === 'productForm') moveLegacyResultsIntoCorrectField();
    }, true);

    document.addEventListener('input', (event) => {
      if (event.target?.matches?.('.info-section-row [data-field="title"]')) addLegacyResultsWarning();
    });
  });
})();
