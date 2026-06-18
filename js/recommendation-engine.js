window.RecommendationEngine = {
  normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },

  scoreProduct(product, answers, ingredientRules = []) {
    let score = 0;
    const reasons = [];
    const warnings = [];

    const concerns = product.skinConcern || [];
    const ingredientsText = [
      product.ingredientsHtml,
      product.description,
      product.shortDescription,
      product.bestForHtml
    ].join(' ').toLowerCase();

    const goal = answers.goal;

    // 1. Goal matching
    if (concerns.includes(goal)) {
      score += 40;
      reasons.push('Matches your main skin goal.');
    }

    // 2. Ingredient Rules
    for (const rule of ingredientRules) {
      if (ingredientsText.includes(rule.ingredient_name.toLowerCase()) || 
         (product.ingredients || []).some(i => i.toLowerCase().includes(rule.ingredient_name.toLowerCase()))) {
        
        if ((rule.helps_concerns || []).includes(goal)) {
          score += rule.strength_score * 3;
          reasons.push(`${rule.ingredient_name} supports your selected concern.`);
        }

        if ((rule.avoid_for_skin_types || []).includes(answers.skinType)) {
          score -= 25;
          warnings.push(`${rule.ingredient_name} may not be ideal for your skin type.`);
        }
      }
    }

    // 3. Skin Type Match
    if ((product.skinType || []).includes(answers.skinType) || (product.skinType || []).length === 0) {
      score += 20;
      reasons.push('Suitable for your skin type.');
    } else if (answers.skinType && product.skinType && product.skinType.length > 0 && !product.skinType.includes(answers.skinType)) {
      // If product has explicit skin types and ours isn't one of them
      score -= 5;
    }

    // 4. Sensitivity check
    if (answers.sensitivity === 'very-sensitive') {
      if (product.isSensitiveFriendly) {
        score += 15;
      } else {
        score -= 5;
      }
    }

    // 5. Area Check
    if (answers.focus === 'Mostly body care' && product.productUse === 'face') {
        score -= 50;
    } else if (answers.focus === 'Mostly face care' && product.productUse === 'body') {
        score -= 50;
    }

    // 6. Routine step matching for routine building (just a slight boost if it's the expected product type)
    const productTypeMap = {
        'Soap / cleanser': 'cleanse',
        'Serum / treatment': 'treat',
        'Toner / mist': 'tone',
        'Cream / moisturizer': 'moisturize',
        'Scrub / exfoliation': 'exfoliate',
        'Body butter / body oil': 'moisturize'
    };
    if (answers.productPreference && answers.productPreference !== 'No preference') {
        if (product.routineStep === productTypeMap[answers.productPreference]) {
            score += 15;
        }
    }

    // 7. Inventory
    if (product.trackInventory && product.stockQuantity <= 0 && !product.allowBackorder) {
      score -= 100;
      warnings.push('This product may be out of stock.');
    }

    return {
      product,
      score,
      reasons,
      warnings
    };
  },

  recommend(products, answers, ingredientRules = []) {
    return products
      .filter(p => p && p.id && p.name && p.status === 'active')
      .map(product => this.scoreProduct(product, answers, ingredientRules))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }
};
