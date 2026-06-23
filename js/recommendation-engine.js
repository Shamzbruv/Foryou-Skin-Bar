window.RecommendationEngine = {
  normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },

  goalToConcern(goal) {
    const value = this.normalize(goal);
    if (value.includes('acne') || value.includes('breakout')) return 'acne';
    if (value.includes('dark') || value.includes('hyperpigmentation') || value.includes('spot')) return 'dark-spots';
    if (value.includes('texture') || value.includes('rough') || value.includes('smooth')) return 'texture';
    if (value.includes('moistur') || value.includes('dry')) return 'dryness';
    return 'glow';
  },

  getProductText(product) {
    return [
      product.name,
      product.category,
      product.description,
      product.shortDescription,
      product.ingredientsHtml,
      product.bestForHtml,
      product.routineStep
    ].join(' ').toLowerCase();
  },

  isAccessory(product) {
    return /soap saver|mesh bag|soap dish|facial sponge|exfoliation glove|spa headband|bamboo dish|display|tool/.test(this.getProductText(product));
  },

  inferredUse(product) {
    const explicit = this.normalize(product.productUse);
    if (explicit === 'face' || explicit === 'body') return explicit;
    const text = this.getProductText(product);
    if (/body butter|body oil|body mist|body scrub|coffee rush|island vybz|vanilla bae|bold touch|in your dreams/.test(text)) return 'body';
    if (/serum|toner|vanishing cream|face cream|blemish|acne|hyperpigmentation|niacinamide|salicylic/.test(text)) return 'face';
    return 'both';
  },

  isAvailable(product) {
    if (product.allowBackorder) return true;
    if (product.trackInventory === false) return true;
    if (product.stockQuantity === null || product.stockQuantity === undefined || product.stockQuantity === '') return true;
    return Number(product.stockQuantity) > 0;
  },

  scoreProduct(product, answers, ingredientRules = []) {
    let score = 0;
    const reasons = [];
    const warnings = [];
    const targetConcern = this.goalToConcern(answers.goal);
    const targetType = this.normalize(answers.type || answers.skinType);
    const focus = answers.focus || 'Both face and body';
    const concerns = (product.skinConcern || []).map((value) => this.normalize(value));
    const skinTypes = (product.skinType || []).map((value) => this.normalize(value));
    const ingredientsText = [
      product.ingredientsHtml,
      product.description,
      product.shortDescription,
      product.bestForHtml,
      ...(product.ingredients || [])
    ].join(' ').toLowerCase();
    const use = this.inferredUse(product);

    if (!product?.id || !product?.name || product.status !== 'active') {
      return { product, score: -10000, reasons, warnings: ['This product is not available for recommendation.'] };
    }
    if (!this.isAvailable(product)) {
      return { product, score: -10000, reasons, warnings: ['This product is currently out of stock.'] };
    }
    if (this.isAccessory(product)) {
      return { product, score: -10000, reasons, warnings: ['Accessories are not included as skincare routine recommendations.'] };
    }

    if (concerns.includes(targetConcern)) {
      score += 65;
      reasons.push('Matches your main skin goal.');
    } else if (targetConcern === 'glow' && (concerns.includes('dark-spots') || concerns.includes('dryness'))) {
      score += 25;
      reasons.push('Supports a healthy, brighter-looking glow.');
    } else {
      score -= 18;
    }

    if (focus === 'Mostly face care') {
      if (use === 'body') return { product, score: -10000, reasons, warnings: ['Body-care product excluded for a face-care routine.'] };
      if (use === 'face') score += 28;
    }
    if (focus === 'Mostly body care') {
      if (use === 'face') return { product, score: -10000, reasons, warnings: ['Face-care product excluded for a body-care routine.'] };
      if (use === 'body') score += 28;
    }

    if (targetType && targetType !== 'not-sure') {
      if (skinTypes.includes(targetType)) {
        score += 22;
        reasons.push('Suitable for your skin type.');
      } else if (!skinTypes.length) {
        score += 5;
      } else {
        score -= 8;
      }
    }

    const avoidFor = (product.avoidFor || []).map((value) => this.normalize(value));
    if (targetType && avoidFor.includes(targetType)) {
      return { product, score: -10000, reasons, warnings: ['This product is not recommended for your skin type.'] };
    }

    if (/very-sensitive|somewhat-sensitive/.test(this.normalize(answers.sensitivity))) {
      if (product.isSensitiveFriendly) {
        score += 14;
        reasons.push('Marked as sensitive-friendly.');
      } else if (this.normalize(answers.sensitivity) === 'very-sensitive') {
        score -= 12;
      }
    }

    const preferenceMap = {
      'soap-cleanser': 'cleanse',
      'serum-treatment': 'treat',
      'toner-mist': 'tone',
      'cream-moisturizer': 'moisturize',
      'scrub-exfoliation': 'exfoliate',
      'body-butter-body-oil': 'moisturize'
    };
    const preference = preferenceMap[this.normalize(answers.productPreference)];
    if (preference && this.normalize(product.routineStep) === preference) score += 14;

    for (const rule of ingredientRules) {
      const ingredient = String(rule?.ingredient_name || '').toLowerCase();
      if (!ingredient || !ingredientsText.includes(ingredient)) continue;
      if ((rule.helps_concerns || []).map((value) => this.normalize(value)).includes(targetConcern)) {
        score += Number(rule.strength_score || 0) * 3;
        reasons.push(`${rule.ingredient_name} supports your selected concern.`);
      }
    }

    return { product, score, reasons, warnings };
  },

  recommend(products, answers, ingredientRules = []) {
    return (products || [])
      .map((product) => this.scoreProduct(product, answers, ingredientRules))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }
};
