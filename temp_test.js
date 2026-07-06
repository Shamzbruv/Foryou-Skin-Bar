
    const supabase = window.supabase;

    document.addEventListener('DOMContentLoaded', () => {

      // Mobile menu toggle
      document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('-translate-x-full');
      });
      document.getElementById('closeMenuBtn').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.add('-translate-x-full');
      });

      const supabase = window.supabase;

    function escapeHTML(str) {
      if (!str) return '';
      return str.replace(/[&<>'"]/g, 
        tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag] || tag)
      );
    }

    async function loadAllReviews() {
      if (!supabase) return;
      
      const { data, error } = await supabase
        .from('product_reviews')
        .select(`
          id,
          customer_name,
          rating,
          review_text,
          created_at,
          product_id,
          products ( name )
        `)
        .eq('approved', true)
        .order('created_at', { ascending: false });
        
      const list = document.getElementById('allReviewsList');
      
      if (error || !data || data.length === 0) {
        list.innerHTML = '<div class="text-center py-20 text-stone-500 bg-white rounded-3xl border border-stone-100">No reviews yet. Be the first to share your experience!</div>';
        return;
      }

      list.innerHTML = data.map(r => {
        const productName = r.products ? r.products.name : 'General Experience';
        const isGeneral = !r.product_id;
        
        return `
          <div class="bg-white rounded-3xl p-8 border border-stone-100 shadow-sm relative overflow-hidden group">
            <div class="absolute top-0 right-0 bg-stone-50 px-4 py-1 rounded-bl-xl text-xs font-semibold text-stone-500">
              ${isGeneral ? '<i class="fas fa-heart text-amber-700 mr-1"></i> Store Review' : '<i class="fas fa-box-open text-stone-400 mr-1"></i> Product Review'}
            </div>
            <div class="flex items-center justify-between mb-4 mt-2">
              <div>
                <h4 class="font-bold text-stone-900 text-lg">${escapeHTML(r.customer_name)}</h4>
                <p class="text-xs font-medium text-amber-800/70 uppercase tracking-wider mt-1">${escapeHTML(productName)}</p>
              </div>
              <div class="text-amber-500 flex gap-1">
                ${'<i class="fas fa-star"></i>'.repeat(r.rating)}${'<i class="far fa-star"></i>'.repeat(5 - r.rating)}
              </div>
            </div>
            <p class="text-stone-700 text-base leading-relaxed italic">"${escapeHTML(r.review_text)}"</p>
            <p class="text-xs font-medium text-stone-400 mt-6">${new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        `;
      }).join('');
    }

    loadAllReviews();

    const form = document.getElementById('generalReviewForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitReviewBtn');
        const msg = document.getElementById('reviewMessage');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        msg.classList.add('hidden');

        const name = document.getElementById('reviewName').value.trim();
        const rating = parseInt(document.getElementById('reviewRating').value, 10);
        const text = document.getElementById('reviewText').value.trim();

        if (!name || !text || !rating) return;

        try {
          const { error } = await supabase.from('product_reviews').insert({
            product_id: null, // General review
            customer_name: name,
            rating: rating,
            review_text: text,
            approved: false // Admin must approve
          });

          if (error) throw error;

          msg.innerText = 'Thank you! Your review was submitted and will appear once approved.';
          msg.className = 'text-sm font-medium text-green-600 mt-4 block p-3 bg-green-50 rounded-lg border border-green-100';
          form.reset();
        } catch (err) {
          console.error(err);
          msg.innerText = 'Error submitting review. Please try again.';
          msg.className = 'text-sm font-medium text-red-600 mt-4 block p-3 bg-red-50 rounded-lg border border-red-100';
        } finally {
          btn.disabled = false;
          btn.innerHTML = 'Submit Review';
        }
      });
    }
    
    });
  