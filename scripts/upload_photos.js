const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Added path resolve in case run from scripts dir
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config(); // Load again from cwd just in case
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIRS = [
  'C:\\Users\\Shamz\\Desktop\\For you skin bar\\productphotos',
  'C:\\Users\\Shamz\\Desktop\\For you skin bar\\secondsetofphotos'
];

// Manual overrides for tricky names
const PRODUCT_MAP = {
  'island vybz body butter': 'island-vybz-all-natural-jamaican-body-butter',
  'island vybz body oil': 'body-oil-jamaican-made-natural-botanical-infused',
  'skin balance toner': 'skin-balance-handmade-toner-for-spots-and-hyperpigmentation',
  'skinfidence blemish cream': 'skinfidence-blemish-cream',
  'tru glow sugar scrub': 'truglow-turmeric-scrub-for-spots-and-uneven-skin-tone',
  'true glow sugar scrub': 'truglow-turmeric-scrub-for-spots-and-uneven-skin-tone',
  'wooden soap dish': 'eco-friendly-bamboo-soap-dish',
  'bold touch': 'bold-touch-natural-handmade-body-butter',
  'coffee glow scrub': 'coffee-rush-glow-body-scrub',
  'coffee rush glow': 'coffee-rush-glow-body-scrub',
  'flavored body oil': 'body-oil-jamaican-made-natural-botanical-infused', 
  'glow reset sugar scrub': 'glow-reset-emulsifying-sugar-scrub',
  'glow rush coffee scrub': 'coffee-rush-glow-body-scrub',
  'calm & clear sugar scrub': 'glow-reset-emulsifying-sugar-scrub', // user has no calm clear scrub, mapping to glow reset based on previous heuristic
  'calm and clear sugar scrub': 'glow-reset-emulsifying-sugar-scrub'
};

async function run() {
  const { data: products } = await db.from('products').select('id, name, slug');
  const slugToId = {};
  for (const p of products) slugToId[p.slug] = p.id;
  
  let filesToProcess = [];
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg')) {
        filesToProcess.push({ dir, file, path: path.join(dir, file) });
      }
    }
  }

  const matchedProducts = new Map(); // productId -> [files]

  for (const fileObj of filesToProcess) {
    const fileName = fileObj.file.toLowerCase();
    let matchedSlug = null;
    
    // Check manual map first
    for (const [key, slug] of Object.entries(PRODUCT_MAP)) {
      if (fileName.includes(key)) {
        matchedSlug = slug;
        break;
      }
    }
    
    let matchedProductId = matchedSlug ? slugToId[matchedSlug] : null;

    // Fallback heuristic matching if no manual map
    if (!matchedProductId) {
        let bestMatch = null;
        let bestScore = 0;
        
        for (const p of products) {
          const pName = p.name.toLowerCase();
          const fileWords = fileName.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          const pWords = pName.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          
          let score = 0;
          for (const fw of fileWords) {
            if (pWords.includes(fw)) score++;
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
          }
        }
        if (bestMatch && bestScore >= 2) {
            matchedProductId = bestMatch.id;
        }
    }

    if (matchedProductId) {
      if (!matchedProducts.has(matchedProductId)) matchedProducts.set(matchedProductId, []);
      matchedProducts.get(matchedProductId).push(fileObj);
    } else {
      console.log(`Skipping file: no product match for [${fileObj.file}]`);
    }
  }

  console.log(`Found matches for ${matchedProducts.size} products.`);

  for (const [productId, files] of matchedProducts.entries()) {
    console.log(`\nProcessing product ID: ${productId} (${files.length} images)`);
    
    // 1. Delete old images for this product to prevent duplicate Wix placeholders
    await db.from('product_images').delete().eq('product_id', productId);
    console.log(`- Deleted old images for product ${productId}`);
    
    // 2. Sort files (put "front", "1 of", etc first)
    files.sort((a, b) => {
      const isA1 = a.file.includes('1 of') || a.file.toLowerCase().includes('front');
      const isB1 = b.file.includes('1 of') || b.file.toLowerCase().includes('front');
      if (isA1 && !isB1) return -1;
      if (!isA1 && isB1) return 1;
      return a.file.localeCompare(b.file);
    });

    for (let i = 0; i < files.length; i++) {
      const fileObj = files[i];
      const ext = path.extname(fileObj.file);
      const safeName = fileObj.file.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `${productId}/${Date.now()}_${safeName}`;
      
      const fileBuffer = fs.readFileSync(fileObj.path);
      
      console.log(`- Uploading ${fileObj.file}...`);
      const { data, error } = await db.storage.from('product-images').upload(storagePath, fileBuffer, {
        contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
        upsert: true
      });
      
      if (error) {
        console.error(`- Upload failed for ${fileObj.file}:`, error.message);
        continue;
      }

      const { data: publicUrlData } = db.storage.from('product-images').getPublicUrl(storagePath);
      const publicUrl = publicUrlData.publicUrl;

      const { error: insertError } = await db.from('product_images').insert({
        product_id: productId,
        image_url: publicUrl,
        sort_order: i,
        is_primary: i === 0
      });
      
      if (insertError) {
        console.error(`- DB Insert failed for ${fileObj.file}:`, insertError.message);
      } else {
        console.log(`- Successfully added ${fileObj.file} as ${i===0 ? 'primary' : 'secondary'} image.`);
      }
    }
  }
  
  console.log('\nAll done syncing product photos!');
}

run().catch(console.error);
