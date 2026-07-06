const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xftnfbeembjrhezvzquu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G6Y_BilXMYBxKY99SeIARQ_rl_ZMsgt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkReviews() {
  const { data, error } = await supabase.from('product_reviews').select('*');
  if (error) console.error("Error:", error);
  else console.log("Reviews:", data);
}
checkReviews();
