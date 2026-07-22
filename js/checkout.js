document.addEventListener('DOMContentLoaded', () => {
  // Read cart data
  const STORAGE_KEY = 'foryou_cart';
  let cart = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  
  const FREE_SHIPPING_THRESHOLD = 10000;

  // ── Handle return states from Fygaro ──
  const urlParams = new URLSearchParams(window.location.search);
  const returnStatus = urlParams.get('status');
  const returnRef    = urlParams.get('ref');

  if (returnStatus === 'cancelled') {
    let pendingPayment = null;
    try { pendingPayment = JSON.parse(sessionStorage.getItem('foryou_pending_payment') || 'null'); } catch (_) {}
    let resumePaymentUrl = '';
    try {
      const candidate = new URL(pendingPayment?.fygaroUrl || '', window.location.href);
      if (candidate.protocol === 'https:' || candidate.origin === window.location.origin) resumePaymentUrl = candidate.href;
    } catch (_) {}
    // Customer cancelled payment on Fygaro — show a friendly message
    const cancelBanner = document.createElement('div');
    cancelBanner.id = 'cancelledBanner';
    cancelBanner.className = 'fixed top-0 left-0 right-0 z-[200] bg-amber-800 text-white text-center py-3 px-4 text-sm font-medium';
    cancelBanner.innerHTML = `
      <i class="fas fa-info-circle mr-2"></i>
      Your payment was not completed. Your cart is still here if you would like to try again.
      ${resumePaymentUrl ? `<a href="${resumePaymentUrl}" class="ml-4 underline font-bold opacity-90 hover:opacity-100">Resume payment</a>` : ''}
      <button onclick="this.parentElement.remove()" class="ml-4 underline opacity-80 hover:opacity-100">Dismiss</button>
    `;
    document.body.prepend(cancelBanner);
    // Clean the URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  const orderItemsContainer = document.getElementById('orderItems');
  const subtotalEl = document.getElementById('checkoutSubtotal');
  const shippingEl = document.getElementById('checkoutShipping');
  const totalEl = document.getElementById('checkoutTotal');
  const emptyStateEl = document.getElementById('emptyCartState');
  const checkoutFormEl = document.getElementById('checkoutFormWrapper');
  const form = document.getElementById('checkoutForm');
  
  // Dynamic Elements
  const countrySelect = document.getElementById('countrySelect');
  const deliveryRadios = document.getElementsByName('deliveryMethod');
  const addressFieldsWrapper = document.getElementById('addressFieldsWrapper');
  const parishWrapper = document.getElementById('parishWrapper');
  const stateWrapper = document.getElementById('stateWrapper');
  const cityLabel = document.getElementById('cityLabel');
  const postalCodeOptional = document.getElementById('postalCodeOptional');
  
  const localDeliveries = document.querySelectorAll('.delivery-local');
  const overseasDelivery = document.querySelector('.delivery-overseas');
  const overseasRadio = document.querySelector('input[name="deliveryMethod"][value="Overseas"]');

  const errorMessage = document.getElementById('errorMessage');
  const checkoutSummaryPanel = document.getElementById('checkoutSummaryPanel');
  const mobileSummaryMount = document.getElementById('mobileSummaryMount');
  const desktopSummaryMount = document.getElementById('desktopSummaryMount');
  const mobileSummaryQuery = window.matchMedia('(max-width: 767px)');

  function syncSummaryPosition() {
    const target = mobileSummaryQuery.matches ? mobileSummaryMount : desktopSummaryMount;
    if (checkoutSummaryPanel && target && checkoutSummaryPanel.parentElement !== target) {
      target.appendChild(checkoutSummaryPanel);
    }
  }

  syncSummaryPosition();
  mobileSummaryQuery.addEventListener?.('change', syncSummaryPosition);

  async function prefillUserData() {
    try {
      if (!window.supabase) return;
      const { data } = await window.supabase.auth.getSession();
      if (!data?.session) return;
      
      const response = await fetch('/api/customer-portal', {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (!response.ok) return;
      
      const { profile } = await response.json();
      if (!profile) return;
      
      const safelySet = (selector, val) => {
        const el = document.querySelector(selector);
        if (el && !el.value && val) {
          el.value = val;
          el.dispatchEvent(new Event('change'));
        }
      };
      
      safelySet('input[name="fullName"]', profile.fullName);
      safelySet('input[name="email"]', profile.email);
      safelySet('input[name="phone"]', profile.phone);
      
      if (profile.country && countrySelect && !countrySelect.value) {
        countrySelect.value = profile.country;
        countrySelect.dispatchEvent(new Event('change'));
      }
      
      safelySet('#addressLine1', profile.addressLine1);
      safelySet('#addressLine2', profile.addressLine2);
      safelySet('#city', profile.city);
      safelySet('#parish', profile.parish);
      safelySet('#stateProvince', profile.stateProvince);
      safelySet('#postalCode', profile.postalCode);
      
    } catch (e) {
      console.warn("Could not prefill user data", e);
    }
  }
  
  prefillUserData();

  function getSubtotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  }

  function getShipping() {
    const method = document.querySelector('input[name="deliveryMethod"]:checked')?.value;
    if (!method || method === 'Pickup') return 0;
    if (method === 'Overseas') return 0; // TBD
    
    let cost = 0;
    if (method === 'Zipmail') cost = 500;
    else if (method === 'Knutsford') cost = 700;
    else if (method === 'Bearer') cost = 750;
    
    return getSubtotal() >= FREE_SHIPPING_THRESHOLD ? 0 : cost;
  }

  function renderOrderSummary() {
    if (cart.length === 0) {
      emptyStateEl.classList.remove('hidden');
      checkoutFormEl.classList.add('hidden');
      return;
    }

    emptyStateEl.classList.add('hidden');
    checkoutFormEl.classList.remove('hidden');

    orderItemsContainer.innerHTML = cart.map(item => `
      <div class="flex gap-4 mb-4">
        <div class="relative shrink-0">
          <img src="${item.image}" class="w-16 h-16 rounded-xl object-cover border border-stone-200">
          <span class="absolute -top-2 -right-2 bg-stone-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">${item.qty}</span>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-bold text-stone-800 leading-tight">${item.name}</h4>
          <p class="text-stone-500 text-sm mt-1">J$${item.price.toLocaleString()}</p>
        </div>
        <div class="font-bold text-stone-800 text-sm shrink-0">
          J$${(item.price * item.qty).toLocaleString()}
        </div>
      </div>
    `).join('');

    const subtotal = getSubtotal();
    const method = document.querySelector('input[name="deliveryMethod"]:checked')?.value;
    
    // Apply discount
    let discountAmount = 0;
    if (window.appliedDiscount) {
      if (window.appliedDiscount.type === 'percent') {
        discountAmount = subtotal * (window.appliedDiscount.value / 100);
      } else {
        discountAmount = window.appliedDiscount.value;
      }
      if (discountAmount > subtotal) discountAmount = subtotal;
    }

    const subtotalAfterDiscount = subtotal - discountAmount;
    
    const shipping = getShipping();
    const total = subtotalAfterDiscount + shipping;

    // Update Subtotal HTML to show discount if applied
    if (window.appliedDiscount) {
      subtotalEl.innerHTML = `
        <span class="line-through text-stone-400 mr-2">J$${subtotal.toLocaleString()}</span>
        J$${subtotalAfterDiscount.toLocaleString()}
      `;
    } else {
      subtotalEl.innerText = 'J$' + subtotal.toLocaleString();
    }
    
    if (method === 'Overseas') {
        shippingEl.innerText = 'To be confirmed';
        totalEl.innerText = 'Pending confirmation';
    } else {
        shippingEl.innerText = shipping === 0 ? (method === 'Pickup' ? 'J$0' : 'Free') : 'J$' + shipping.toLocaleString();
        totalEl.innerText = 'J$' + total.toLocaleString();
    }
  }

  function toggleCountryFields() {
    const isJamaica = countrySelect.value === 'Jamaica';
    
    if (isJamaica) {
        parishWrapper.classList.remove('hidden');
        document.getElementById('parish').required = true;
        stateWrapper.classList.add('hidden');
        document.getElementById('stateProvince').required = false;
        cityLabel.innerHTML = 'City / Town <span class="req-star">*</span>';
        postalCodeOptional.classList.remove('hidden');
        document.getElementById('postalCode').required = false;

        localDeliveries.forEach(el => el.classList.remove('hidden'));
        overseasDelivery.classList.add('hidden');
        overseasRadio.checked = false;
        
        // Auto-select first local if none selected
        if (!document.querySelector('input[name="deliveryMethod"]:checked')) {
            document.querySelector('input[value="Zipmail"]').checked = true;
        }
    } else {
        parishWrapper.classList.add('hidden');
        document.getElementById('parish').required = false;
        stateWrapper.classList.remove('hidden');
        document.getElementById('stateProvince').required = true;
        cityLabel.innerHTML = 'City <span class="req-star">*</span>';
        postalCodeOptional.classList.add('hidden');
        document.getElementById('postalCode').required = true;

        localDeliveries.forEach(el => el.classList.add('hidden'));
        overseasDelivery.classList.remove('hidden');
        overseasRadio.checked = true;
    }
    renderOrderSummary();
  }

  // Event Listeners
  if (countrySelect) {
      countrySelect.addEventListener('change', toggleCountryFields);
  }

  const applyDiscountBtn = document.getElementById('applyDiscountBtn');
  const discountCodeInput = document.getElementById('discountCodeInput');
  const discountMessage = document.getElementById('discountMessage');

  if (applyDiscountBtn) {
    applyDiscountBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const code = discountCodeInput.value.trim().toUpperCase();
      if (!code) return;

      applyDiscountBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      applyDiscountBtn.disabled = true;

      try {
        if (!window.supabase) {
          throw new Error("Supabase client is not initialized.");
        }

        const supabaseUrl = window.supabase.supabaseUrl;
        const supabaseAnonKey = window.supabase.supabaseKey;
        const subtotal = getSubtotal();

        const response = await fetch('/api/validate-discount', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: code, subtotal: subtotal })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Invalid or inactive discount code.');
        }

        const data = await response.json();

        // Apply it
        window.appliedDiscount = {
          code: data.code,
          type: data.discountType,
          value: Number(data.discountValue)
        };

        discountMessage.innerText = `Discount applied: ${data.code}`;
        discountMessage.className = 'text-sm mt-2 font-medium text-green-400';
        discountCodeInput.disabled = true;
        applyDiscountBtn.innerHTML = 'Applied';
        
        renderOrderSummary();
      } catch (err) {
        discountMessage.innerText = err.message || 'Invalid code.';
        discountMessage.className = 'text-sm mt-2 font-medium text-red-400';
        applyDiscountBtn.innerHTML = 'Apply';
        applyDiscountBtn.disabled = false;
        window.appliedDiscount = null;
        renderOrderSummary();
      }
      
      discountMessage.classList.remove('hidden');
    });
  }

  Array.from(deliveryRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isPickup = e.target.value === 'Pickup';
      const inputs = addressFieldsWrapper.querySelectorAll('input, select');
      
      if (isPickup) {
        addressFieldsWrapper.classList.add('opacity-50', 'pointer-events-none');
        inputs.forEach(input => input.required = false);
      } else {
        addressFieldsWrapper.classList.remove('opacity-50', 'pointer-events-none');
        inputs.forEach(input => {
            if (input.id === 'addressLine2' || input.id === 'postalCode') {
                if (input.id === 'postalCode' && countrySelect.value !== 'Jamaica') {
                    input.required = true;
                }
            } else if (input.id === 'stateProvince' && countrySelect.value === 'Jamaica') {
                input.required = false;
            } else if (input.id === 'parish' && countrySelect.value !== 'Jamaica') {
                input.required = false;
            } else {
                input.required = true;
            }
        });
      }
      renderOrderSummary();
    });
  });

  // Handle form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (cart.length === 0) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting your order...';
      submitBtn.disabled = true;
      errorMessage.classList.add('hidden');

      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      if (data.termsAccepted !== 'yes') {
        errorMessage.innerText = 'Please read and accept the Terms and Conditions before continuing to payment.';
        errorMessage.classList.remove('hidden');
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        return;
      }

      // Prepare payload exactly as requested
      const payload = {
        customer: {
          fullName: data.fullName,
          phone: data.phone,
          email: data.email
        },
        shipping: {
          country: data.country,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          parish: data.parish,
          stateProvince: data.stateProvince,
          postalCode: data.postalCode,
          deliveryMethod: data.deliveryMethod,
          notes: data.notes
        },
        termsAccepted: true,
        newsletterOptIn: data.newsletterOptIn === 'yes',
        discountCode: window.appliedDiscount ? window.appliedDiscount.code : null,
        cart: cart.map(item => ({
          productId: item.productId,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          cartItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.qty,
          image: item.image
        }))
      };

      try {
        if (!window.supabase) {
          throw new Error("Supabase client is not initialized.");
        }

        const response = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to submit order.');
        }

        const result = await response.json();
        const orderNumber = result.order_number || result.orderNumber || 'PENDING';

        if (result.fygaro_url) {
          // ── Fygaro redirect flow ──
          sessionStorage.setItem('foryou_pending_payment', JSON.stringify({
            orderNumber,
            fygaroUrl: result.fygaro_url,
            paymentAccessToken: result.payment_access_token || ''
          }));
          submitBtn.innerHTML = '<i class="fas fa-lock mr-2"></i> Redirecting to secure payment...';

          // Show a friendly redirect UI
          const redirectState = document.createElement('div');
          redirectState.className = 'mt-6 p-6 bg-amber-50 border border-amber-200 rounded-xl text-center text-stone-800';
          redirectState.innerHTML = `
            <div class="flex flex-col items-center gap-4">
              <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                <i class="fas fa-lock text-amber-800 text-xl"></i>
              </div>
              <div>
                <h4 class="font-bold text-lg mb-1">Secure payment is ready</h4>
                <p class="text-stone-600 text-sm mb-1">Reference <strong>${orderNumber}</strong> will be confirmed only after payment.</p>
                <p class="text-stone-500 text-xs">You are being redirected to our secure payment page…</p>
              </div>
              <div class="flex gap-2 items-center text-amber-800 text-xs">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Redirecting to Fygaro secure checkout…</span>
              </div>
            </div>
          `;
          form.appendChild(redirectState);
          submitBtn.classList.add('hidden');

          // Redirect after a brief moment so the user sees the state
          setTimeout(() => {
            window.location.href = result.fygaro_url;
          }, 1800);

        } else {
          throw new Error('Secure payment could not be started. Your cart has not been cleared.');
        }
        
      } catch (err) {
        console.error(err);
        errorMessage.innerText = 'Something went wrong while submitting your order. Please try again or contact us on WhatsApp. (' + err.message + ')';
        errorMessage.classList.remove('hidden');
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
      }
    });
  }

  // Initial render
  toggleCountryFields();
  renderOrderSummary();
});
