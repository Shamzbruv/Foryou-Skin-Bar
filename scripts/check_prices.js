const fs = require('fs');

const content = fs.readFileSync('C:\\Users\\Shamz\\Desktop\\For you skin bar\\For you skin bar\\catalog_products (5).csv', 'utf8');

// A very basic CSV parser that handles quotes correctly (rudimentary but works for most cases)
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

const lines = content.split('\n');
const header = parseCSVRow(lines[0]);
const hmap = {};
header.forEach((h, i) => hmap[h.trim()] = i);

let currentProduct = null;
let basePrice = 0;

for(let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const parts = parseCSVRow(lines[i]);
  
  if (parts[hmap['fieldType']] === 'Product') {
    currentProduct = parts[hmap['name']];
    basePrice = parseFloat(parts[hmap['price']]) || 0;
    console.log(`\nProduct: ${currentProduct} | Base Price: ${basePrice}`);
  } else if (parts[hmap['fieldType']] === 'Variant') {
    const surcharge = parseFloat(parts[hmap['surcharge']]) || 0;
    const vName1 = parts[hmap['productOptionDescription1']] || '';
    const vName2 = parts[hmap['productOptionDescription2']] || '';
    const vName = vName1 + (vName2 ? ' / ' + vName2 : '');
    const price = basePrice + surcharge;
    console.log(`  Variant: ${vName} | Surcharge: ${surcharge} | Final Price: ${price}`);
  }
}
