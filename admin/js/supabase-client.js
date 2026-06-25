import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Initialize Supabase Client
const supabaseUrl = 'https://xftnfbeembjrhezvzquu.supabase.co';
const supabaseKey = 'sb_publishable_G6Y_BilXMYBxKY99SeIARQ_rl_ZMsgt';

// Use sessionStorage if user unchecked "Stay signed in"
const storage = window.localStorage.getItem('foryou_remember') === 'false' ? window.sessionStorage : window.localStorage;

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

function ensureAdminNavigation() {
    if (!window.location.pathname.startsWith('/admin/')) return;

    const links = Array.from(document.querySelectorAll('a'));
    const existingLoyalty = links.some(link => link.getAttribute('href') === '/admin/loyalty.html');
    if (existingLoyalty) return;

    const anchor = links.find(link => link.getAttribute('href') === '/admin/recommendation-rules.html')
        || links.find(link => link.getAttribute('href') === '/admin/discounts.html');
    if (!anchor || !anchor.parentElement) return;

    const loyaltyLink = document.createElement('a');
    loyaltyLink.href = '/admin/loyalty.html';
    loyaltyLink.className = 'block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition';
    loyaltyLink.textContent = 'Loyalty Program';
    anchor.insertAdjacentElement('afterend', loyaltyLink);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureAdminNavigation, { once: true });
} else {
    ensureAdminNavigation();
}

// Helper function to check if user is logged in
export async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/admin/login.html';
        return null;
    }
    
    // Verify admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
    if (!profile || !['owner', 'admin', 'staff'].includes(profile.role)) {
        alert('Access denied. Admin privileges required.');
        await supabase.auth.signOut();
        window.location.href = '/admin/login.html';
        return null;
    }
    return session;
}

// Helper to format currency
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-JM', {
        style: 'currency',
        currency: 'JMD'
    }).format(amount);
}

// Keep the product editor labels synchronized with the customer-facing product page.
if (window.location.pathname.endsWith('/admin/products.html')) {
    import('/admin/js/product-editor-assist.js').catch((error) => {
        console.warn('Product editor guidance could not be loaded.', error);
    });
}
