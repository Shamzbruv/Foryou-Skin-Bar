const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function fix() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT id, name FROM products WHERE name ILIKE '%Revive%'");
  for (let r of res.rows) {
     console.log("Fixing variants for", r.name);
     await client.query("DELETE FROM product_variants WHERE product_id = $1", [r.id]);
     console.log("Variants deleted.");
  }
  await client.end();
}
fix().catch(console.error);
