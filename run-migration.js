// no dotenv required, relying on node --env-file or fallback
const fs = require('fs');
const { Client } = require('pg');

async function runMigration() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL environment variable.");
    process.exit(1);
  }
  console.log("Connecting to the database...");
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log("Connected successfully.");
    
    const migrationFile = process.argv[2] || 'supabase/migrations/20260618_recommendation_engine.sql';
    const migrationSql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log(`Running migration from ${migrationFile}...`);
    await client.query(migrationSql);
    console.log("Migration executed successfully!");
    
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    await client.end();
  }
}

runMigration();
