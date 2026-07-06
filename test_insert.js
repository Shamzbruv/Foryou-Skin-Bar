const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://xftnfbeembjrhezvzquu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G6Y_BilXMYBxKY99SeIARQ_rl_ZMsgt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('product_reviews').insert({
    product_id: null,
    customer_name: 'Test Name',
    rating: 5,
    review_text: 'Test Review',
    approved: false
  });
  if (error) {
    console.error('INSERT FAILED:', error);
  } else {
    console.log('INSERT SUCCESS:', data);
  }
}
testInsert();
