const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function check() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT p.name, count(v.id) as c 
    FROM products p 
    LEFT JOIN product_variants v ON p.id = v.product_id 
    GROUP BY p.name 
    HAVING count(v.id) > 15
  `);
  console.log("Products with >15 variants:");
  for (let r of res.rows) {
     console.log(r.name, r.c);
     if (r.c == 47) {
       console.log("Found another with 47 variants!", r.name);
     }
  }
  await client.end();
}
check().catch(console.error);
