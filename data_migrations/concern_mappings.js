require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const mappings = {
  "dark-spots": [
    "Kojie Fade Soap",
    "Truglow Sugar Scrub",
    "Clear Era Vanishing Cream",
    "Skin Balance Toner",
    "Protect & Glow",
    "Niaskin Boost"
  ],
  "acne": [
    "Neem Turmeric Soap",
    "Clear Skin Serum",
    "Skinfidence Blemish Cream",
    "Neem Calm and Clear Mist",
    "Neem Calm and Clear Sugar Scrub"
  ],
  "body-care": [
    "body butters", // we'll use a match for this
    "body mists",
    "body oils",
    "Soaps",
    "Scrubs"
  ],
  "dryness": [
    "Glow Therapy Soap",
    "Calm Theory Soap",
    "Plump and Glow Elixir",
    "Rose Radiance Toner",
    "Niaskin Boost Elixir"
  ],
  "glow": [
    // Glow includes all dark-spots + dryness
    "Kojie Fade Soap",
    "Truglow Sugar Scrub",
    "Clear Era Vanishing Cream",
    "Skin Balance Toner",
    "Protect & Glow",
    "Niaskin Boost",
    "Glow Therapy Soap",
    "Calm Theory Soap",
    "Plump and Glow Elixir",
    "Rose Radiance Toner",
    "Niaskin Boost Elixir"
  ],
  "texture": [
    // All scrubs + these:
    "Scrubs",
    "Clear Skin Serum",
    "Niaskin Boost", // User pdf says "Niaskin Boost Serum", assuming it's "Niaskin Boost" or "Niaskin Boost Elixir"
    "Skinfidence Blemish Cream"
  ]
};

async function run() {
  console.log("Fetching products...");
  const { data: products, error } = await supabase.from('products').select('id, name');
  
  if (error) {
    console.error("Error fetching products:", error);
    process.exit(1);
  }

  const inserts = [];

  // Helper to find products
  const findProducts = (query) => {
    return products.filter(p => {
      const pName = p.name.toLowerCase();
      const q = query.toLowerCase();
      if (q === "body butters") return pName.includes("butter");
      if (q === "body mists") return pName.includes("mist");
      if (q === "body oils") return pName.includes("oil");
      if (q === "soaps") return pName.includes("soap");
      if (q === "scrubs") return pName.includes("scrub");
      if (q === "niaskin boost serum") return pName.includes("niaskin");
      return pName.includes(q);
    });
  };

  for (const [concernSlug, queries] of Object.entries(mappings)) {
    for (const q of queries) {
      const matched = findProducts(q);
      for (const m of matched) {
        inserts.push({
          product_id: m.id,
          concern_slug: concernSlug
        });
      }
    }
  }

  // Deduplicate
  const uniqueInserts = [];
  const seen = new Set();
  for (const ins of inserts) {
    const key = `${ins.product_id}_${ins.concern_slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueInserts.push(ins);
    }
  }

  console.log(`Found ${uniqueInserts.length} concern mappings to insert.`);

  // Clear old ones first
  await supabase.from('product_concerns').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert
  const { error: insertError } = await supabase.from('product_concerns').insert(uniqueInserts);
  
  if (insertError) {
    console.error("Failed to insert mappings:", insertError);
  } else {
    console.log("Successfully mapped product concerns.");
  }
}

run();
