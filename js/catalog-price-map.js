(function(){
  const normalize = value => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const catalogPriceMap = [{"name":"Island Vybz Bundle - Big Vybz Collection","price":4500.0,"variants":{}},{"name":"In Your Dreams Bundle – Pink Chiffon Collection","price":4500.0,"variants":{}},{"name":"Bold Touch Bundle – Black Woman Collection","price":4500.0,"variants":{}},{"name":"Body Oil Jamaican Made Natural Botanical Infused","price":1500.0,"variants":{"Island Vybz":1500.0,"Vanilla Bae":1500.0,"Bold Touch":1500.0,"Favoured":1500.0,"In Your Dreams":1500.0}},{"name":"Grace and Glow Self Care – Handmade Bath and Body Gift Sets","price":10000.0,"variants":{"Wrapped in Grace":10000.0,"Praise and Glow":10000.0,"Bold by Design":10000.0,"Chosen and Covered":10000.0,"Covered While You Rest":10000.0}},{"name":"Favoured Jamaican Handmade Natural Body Butter","price":1500.0,"variants":{"8.5oz":2700.0,"4oz":1500.0}},{"name":"Facial Sponge for Mild Exfoliation","price":200.0,"variants":{"6":1000.0,"3":500.0,"1":200.0}},{"name":"Soap Saver Mesh Bag","price":350.0,"variants":{}},{"name":"Goddess Relief Feminine Oil","price":1500.0,"variants":{}},{"name":"Root Theory Beard Balm","price":1500.0,"variants":{"2oz":1500.0,"4oz":2800.0}},{"name":"Hyperpigmentation Fix Targeted Skincare for Dark Spots & Uneven Skin Tone","price":4800.0,"variants":{"Glow Getter Bundle":4800.0,"Yaad Glow Essentials":7200.0,"Spotless Radiance Set":6350.0,"Even Glow Kit":6800.0}},{"name":"Calm Theory Soap Bar with Moringa and Neem for Even Skin Tone","price":1500.0,"variants":{"4.7oz":1500.0}},{"name":"Roots Beard Oil","price":1900.0,"variants":{}},{"name":"ClariTone Brightening and Balancing Toner for Acne Spots and Dark Marks","price":2000.0,"variants":{}},{"name":"Clear Era Vanishing Cream Spot and Hyperpigmentation Corrector","price":2000.0,"variants":{}},{"name":"Exfoliation Glove","price":750.0,"variants":{"#90EEB1:Light Green":750.0,"#FB0649:Rose Pink":750.0,"#ffff00:Yellow":750.0,"#ff0000:Red":750.0,"#800080:Purple":750.0,"#ffa500:Orange":750.0,"#add8e6:Light Blue":750.0,"#c8a2c8:Lilac":750.0,"#0000ff:Blue":750.0,"#00ff00:Lime Green":750.0}},{"name":"In Your Dreams All Natural Jamaican Handmade Body Butter","price":1500.0,"variants":{"8.5oz":2500.0,"4oz":1500.0}},{"name":"Glow Reset Emulsifying Sugar Scrub","price":1500.0,"variants":{}},{"name":"Bold Touch Natural Handmade Body Butter","price":1500.0,"variants":{"8oz":2700.0,"4oz":1500.0}},{"name":"Body Mist Jamaican Made Natural Alcohol Free","price":1800.0,"variants":{"Bold Touch":1800.0,"Island Vybz":1800.0,"Vanilla Bae":1800.0,"In Your Dreams":1800.0,"Favoured":1800.0}},{"name":"Rose Radiance Toner","price":1800.0,"variants":{}},{"name":"Plump N Glow Elixir","price":1900.0,"variants":{}},{"name":"Protect and Glow Vitamin C Serum","price":2100.0,"variants":{}},{"name":"Glow and Clear Essentials","price":6150.0,"variants":{}},{"name":"Eco Friendly Bamboo Soap Dish","price":600.0,"variants":{}},{"name":"Flawless Body Scrub with Hibiscus","price":2250.0,"variants":{}},{"name":"Firm Skin Coffee  Face Cream","price":2250.0,"variants":{}},{"name":"Skinfidence Blemish Cream","price":1800.0,"variants":{}},{"name":"Niaskin Boost Elixir Handmade with Niacinamide","price":1500.0,"variants":{"With Cinnamon Essential Oil":1500.0,"With/O Cinnamon Essential Oil":1500.0}},{"name":"Fluff and Flair Facial Spa Headband","price":1200.0,"variants":{"#FB0649:Rose Pink":1200.0,"#ffffff:White":1200.0,"#ffff00:Yellow":1200.0,"#ff0000:Red":1200.0,"#90EEB1:Light Green":1200.0,"#ffa500:Orange":1200.0,"#800080:Purple":1200.0}},{"name":"Neem Turmeric Acne Soap","price":1500.0,"variants":{"4.7oz":1500.0,"Melt & Pour 4.5oz":1000.0}},{"name":"Coffee Rush Glow Body Scrub","price":2400.0,"variants":{}},{"name":"Skin Balance Handmade Toner for Spots and Hyperpigmentation","price":1800.0,"variants":{}},{"name":"Vanilla Bae All Natural Nourishing Body Butter For Dry Skin","price":1500.0,"variants":{"Light Vanilla":2700.0,"Very Vanilla":2700.0}},{"name":"Island Vybz All Natural Jamaican Body Butter","price":1500.0,"variants":{"4oz":1500.0,"8.02oz":2750.0}},{"name":"Revive Oil Serum Handmade Brightening Moisturizer","price":1250.0,"variants":{}},{"name":"Kojie Fade Bar Handmade soap with Kojic Acid","price":1950.0,"variants":{"7.5oz":1950.0}},{"name":"TruGlow Turmeric Scrub for Spots and Uneven Skin Tone","price":1700.0,"variants":{"6oz":1700.0,"8oz":2000.0,"11oz":2700.0}},{"name":"Glow Therapy Soap All Natural with Hibiscus","price":1200.0,"variants":{}},{"name":"Clear Skin Serum with 2% Salicylic Acid for Acne","price":900.0,"variants":{"1oz":900.0,"2oz":1500.0}},{"name":"Kojie Fade Skin Brightening Serum","price":1500.0,"variants":{}},{"name":"Hydrating Serum","price":50.0,"variants":{"30ml":50.0,"50ml":50.0}},{"name":"Repairing Night Cream","price":60.0,"variants":{"50ml":60.0,"100ml":60.0}},{"name":"Brightening Cream","price":55.0,"variants":{"50ml":55.0,"100ml":55.0}},{"name":"Brightening Serum","price":45.0,"variants":{"30ml":45.0,"50ml":45.0}},{"name":"Hydrating Cleanser","price":32.0,"variants":{"150ml":32.0,"250ml":32.0}},{"name":"Moisturizing Day Cream","price":40.0,"variants":{}},{"name":"Anti-Acne Serum","price":55.0,"variants":{}},{"name":"Gentle Foaming Cleanser","price":30.0,"variants":{"150ml":30.0,"250ml":30.0}},{"name":"Exfoliating Cleanser","price":35.0,"variants":{}}];
  const byName = new Map(catalogPriceMap.map(item => [normalize(item.name), item]));

  function applyCatalogPrices(products) {
    if (!Array.isArray(products)) return products;
    products.forEach(product => {
      const match = byName.get(normalize(product.name));
      if (!match) return;

      product.price = Number(match.price || product.price || 0);

      if (Array.isArray(product.variants) && product.variants.length) {
        product.variants = product.variants.map(variant => {
          const variantName = normalize(variant.name);
          const matchedVariantKey = Object.keys(match.variants || {}).find(name => normalize(name) === variantName);
          const correctedPrice = matchedVariantKey ? match.variants[matchedVariantKey] : match.price;
          return { ...variant, price: Number(correctedPrice || product.price || variant.price || 0) };
        });
      }
    });
    return products;
  }

  window.applyCatalogPrices = applyCatalogPrices;

  if (window.loadProductsData && !window.loadProductsData.__catalogPricePatched) {
    const originalLoadProductsData = window.loadProductsData;
    const patchedLoadProductsData = async function(...args) {
      const products = await originalLoadProductsData.apply(this, args);
      applyCatalogPrices(products);
      applyCatalogPrices(window.productsData);
      return window.productsData || products;
    };
    patchedLoadProductsData.__catalogPricePatched = true;
    window.loadProductsData = patchedLoadProductsData;
  }
})();
