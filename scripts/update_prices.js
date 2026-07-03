require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseCSVRow(text) {
  let inQuote = false;
  let currentWord = '';
  const result = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i+1] === '"') {
      currentWord += '"';
      i++;
    } else if (char === '"') {
      inQuote = !inQuote;
    } else if (char === ',' && !inQuote) {
      result.push(currentWord);
      currentWord = '';
    } else {
      currentWord += char;
    }
  }
  result.push(currentWord);
  return result;
}

async function run() {
  const content = fs.readFileSync('C:\\Users\\Shamz\\Desktop\\For you skin bar\\For you skin bar\\catalog_products (5).csv', 'utf8');
  const lines = content.split('\n');
  const header = parseCSVRow(lines[0]);
  const hmap = {};
  header.forEach((h, i) => hmap[h.trim()] = i);

  let currentProductName = null;
  let basePrice = 0;

  let productsUpdated = 0;
  let variantsUpdated = 0;

  for(let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = parseCSVRow(lines[i]);
    
    if (parts[hmap['fieldType']] === 'Product') {
      currentProductName = parts[hmap['name']];
      basePrice = parseFloat(parts[hmap['price']]) || 0;
      
      const { data, error } = await db.from('products').update({ price_jmd: basePrice }).eq('name', currentProductName);
      if (error) {
        console.error(`Failed to update product ${currentProductName}: ${error.message}`);
      } else {
        productsUpdated++;
      }
      
    } else if (parts[hmap['fieldType']] === 'Variant' && currentProductName) {
      const surcharge = parseFloat(parts[hmap['surcharge']]) || 0;
      const finalPrice = basePrice + surcharge;
      
      const vName1 = parts[hmap['productOptionDescription1']] || '';
      const vName2 = parts[hmap['productOptionDescription2']] || '';
      const variantName = vName1 + (vName2 ? ' / ' + vName2 : '');

      // We must find the variant by product name and variant name. 
      // Supabase does not support joins in update, so we select first:
      const { data: prodData } = await db.from('products').select('id').eq('name', currentProductName).maybeSingle();
      if (prodData) {
        const { error } = await db.from('product_variants')
          .update({ price_jmd: finalPrice })
          .eq('product_id', prodData.id)
          .eq('name', variantName);
          
        if (error) {
          console.error(`Failed to update variant ${variantName} for product ${currentProductName}: ${error.message}`);
        } else {
          variantsUpdated++;
          console.log(`Updated: ${currentProductName} - ${variantName} -> J$${finalPrice}`);
        }
      }
    }
  }

  console.log(`\nComplete! Updated ${productsUpdated} products and ${variantsUpdated} variants.`);
}

run().catch(console.error);
