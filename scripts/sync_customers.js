require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Get all users from Auth
  const { data: { users }, error: authError } = await db.auth.admin.listUsers();
  if (authError) {
    console.error("Error fetching auth users:", authError.message);
    return;
  }

  // Get all existing customers
  const { data: customers, error: custError } = await db.from('customers').select('email, id');
  if (custError) {
    console.error("Error fetching customers:", custError.message);
    return;
  }

  const existingEmails = new Set(customers.map(c => c.email.toLowerCase()));

  let inserted = 0;
  for (const user of users) {
    if (!existingEmails.has(user.email.toLowerCase())) {
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
      const phone = user.user_metadata?.phone || null;
      
      const { error: insertError } = await db.from('customers').insert({
        email: user.email,
        full_name: fullName,
        phone: phone,
        created_at: user.created_at
      });

      if (insertError) {
        console.error(`Failed to insert ${user.email}:`, insertError.message);
      } else {
        console.log(`Synced missing customer: ${user.email}`);
        inserted++;
      }
    }
  }

  console.log(`\nCustomer Sync Complete! Inserted ${inserted} new customers into the database.`);
}

run().catch(console.error);
