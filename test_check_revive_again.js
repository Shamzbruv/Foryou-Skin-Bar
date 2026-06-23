const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function check() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT id, name FROM products WHERE name ILIKE '%Revive%'");
  for (let r of res.rows) {
     const vRes = await client.query("SELECT count(*) as c FROM product_variants WHERE product_id = $1", [r.id]);
     console.log(r.name, "variants:", vRes.rows[0].c);
  }
  await client.end();
}
check().catch(console.error);
