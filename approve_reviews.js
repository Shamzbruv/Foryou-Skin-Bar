const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xftnfbeembjrhezvzquu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G6Y_BilXMYBxKY99SeIARQ_rl_ZMsgt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function approveReviews() {
  const { data, error } = await supabase.from('product_reviews').update({ approved: true }).eq('approved', false);
  if (error) console.error("Error:", error);
  else console.log("Approved all pending reviews!");
}
approveReviews();
