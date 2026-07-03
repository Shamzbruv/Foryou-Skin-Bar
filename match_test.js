require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIRS = [
  'C:\\Users\\Shamz\\Desktop\\For you skin bar\\productphotos',
  'C:\\Users\\Shamz\\Desktop\\For you skin bar\\secondsetofphotos'
];

async function run() {
  const { data: products } = await db.from('products').select('id, name');
  
  let filesToProcess = [];
  
  for (const dir of DIRS) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg')) {
        filesToProcess.push({ dir, file, path: path.join(dir, file) });
      }
    }
  }

  // Group files by product
  const matchedProducts = new Map();
  
  for (const fileObj of filesToProcess) {
    const fileName = fileObj.file.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    
    for (const p of products) {
      const pName = p.name.toLowerCase();
      // Simple heuristic: count matching words
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
    
    if (bestMatch && bestScore >= 2) { // Require at least 2 matching significant words
      console.log(`Matched [${fileObj.file}] -> [${bestMatch.name}] (Score: ${bestScore})`);
      if (!matchedProducts.has(bestMatch.id)) {
        matchedProducts.set(bestMatch.id, { product: bestMatch, files: [] });
      }
      matchedProducts.get(bestMatch.id).files.push(fileObj);
    } else {
      console.log(`NO STRONG MATCH for [${fileObj.file}] (Best was ${bestMatch?.name} with score ${bestScore})`);
    }
  }
}

run().catch(console.error);
