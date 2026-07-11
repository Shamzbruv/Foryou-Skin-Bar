require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
// Raw body middleware needed for Fygaro webhook signature verification
app.use((req, res, next) => {
  if (req.path === '/api/fygaro-webhook') {
    const chunks = [];
    req.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try { req.body = JSON.parse(req.rawBody.toString('utf8')); } catch(e) { req.body = {}; }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// ── Fygaro Helpers ──
const FYGARO_API_KEY    = process.env.FYGARO_API_KEY    || '';
const FYGARO_API_SECRET = process.env.FYGARO_API_SECRET || '';
const FYGARO_BUTTON_URL = process.env.FYGARO_BUTTON_URL || '';
const SERVER_BASE_URL   = (process.env.SERVER_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function orderAccessToken(orderNumber) {
  const secret = FYGARO_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-order-access-token';
  return crypto.createHmac('sha256', secret).update(String(orderNumber), 'utf8').digest('hex');
}

function verifyOrderAccessToken(orderNumber, token) {
  if (!orderNumber || !token) return false;
  try {
    const expected = Buffer.from(orderAccessToken(orderNumber), 'hex');
    const received = Buffer.from(String(token), 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch (_) {
    return false;
  }
}

/**
 * Generates a JWT-signed Fygaro payment URL.
 * Amount is locked server-side so the customer cannot tamper with it.
 */
function buildFygaroPaymentUrl(orderNumber, amountJmd) {
  if (!FYGARO_BUTTON_URL || FYGARO_BUTTON_URL.includes('BUTTON_ID_HERE')) {
    return null;
  }
  if (!FYGARO_API_KEY || !FYGARO_API_SECRET) {
    console.warn('[Fygaro] Payment URL disabled because FYGARO_API_KEY or FYGARO_API_SECRET is missing.');
    return null;
  }
  const nowSec  = Math.floor(Date.now() / 1000);
  const payload = {
    amount: Number(amountJmd || 0).toFixed(2),
    currency: 'JMD',
    custom_reference: orderNumber,
    exp: nowSec + 3600,
    nbf: nowSec,
    success_url: `${SERVER_BASE_URL}/payment-success.html?ref=${encodeURIComponent(orderNumber)}&token=${orderAccessToken(orderNumber)}`,
    cancel_url:  `${SERVER_BASE_URL}/checkout.html?status=cancelled&ref=${encodeURIComponent(orderNumber)}`,
    hook_url:    `${SERVER_BASE_URL}/api/fygaro-webhook`,
  };
  const token = jwt.sign(payload, FYGARO_API_SECRET, {
    algorithm: 'HS256',
    header: { alg: 'HS256', typ: 'JWT', kid: FYGARO_API_KEY },
  });
  return `${FYGARO_BUTTON_URL}?jwt=${token}`;
}

/**
 * Verifies the Fygaro-Signature header on incoming webhook calls.
 */
function verifyFygaroSignature(rawBody, signatureHeader, keyIdHeader) {
  if (!FYGARO_API_SECRET || !signatureHeader) return false;
  const keyId = String(keyIdHeader || '').trim();
  if (FYGARO_API_KEY && keyId && keyId !== FYGARO_API_KEY) return false;

  const parts = String(signatureHeader).split(',').map(part => part.trim()).filter(Boolean);
  let timestamp = '';
  const hashes = [];
  parts.forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1') hashes.push(value);
  });

  if (timestamp && hashes.length) {
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;
    const expected = crypto
      .createHmac('sha256', FYGARO_API_SECRET)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')]))
      .digest('hex');
    return hashes.some((hash) => {
      try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const receivedBuffer = Buffer.from(hash, 'hex');
        return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
      } catch (_) {
        return false;
      }
    });
  }

  const legacyHash = String(signatureHeader).replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(legacyHash)) return false;
  const expected = crypto.createHmac('sha256', FYGARO_API_SECRET).update(rawBody).digest('hex');
  try {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(legacyHash, 'hex');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (_) {
    return false;
  }
}

// ── API Routes ──
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '', // Railway provides this via environment variables
  { realtime: { transport: WebSocket } }
);

// ── API Routes ──

app.post('/api/validate-discount', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) throw new Error('Code is required');

    const { data: discountData, error } = await supabaseAdmin
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('active', true)
      .single();

    if (error) {
      console.error('Supabase Error:', error);
      throw new Error(`Database error: ${error.message} (Check Railway environment variables)`);
    }

    if (!discountData) {
      throw new Error('Invalid or inactive discount code');
    }

    const now = new Date();
    const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null;
    const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null;

    if (discountData.usage_limit && discountData.used_count >= discountData.usage_limit) {
      throw new Error('Discount code has reached its usage limit');
    }
    if (startsAt && startsAt > now) {
      throw new Error('Discount code is not active yet');
    }
    if (endsAt && endsAt < now) {
      throw new Error('Discount code has expired');
    }
    if (discountData.minimum_subtotal && (subtotal || 0) < discountData.minimum_subtotal) {
      throw new Error(`This code requires a minimum order of J$${discountData.minimum_subtotal.toLocaleString()}`);
    }

    let discountAmount = 0;
    if (discountData.discount_type === 'percent') {
      discountAmount = (subtotal || 0) * (Number(discountData.discount_value) / 100);
    } else {
      discountAmount = Number(discountData.discount_value);
    }
    if (subtotal && discountAmount > subtotal) discountAmount = subtotal;

    res.status(200).json({
      valid: true,
      code: discountData.code,
      discountType: discountData.discount_type,
      discountValue: Number(discountData.discount_value),
      discountAmount: discountAmount
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/create-order', async (req, res) => {
  try {
    const payload = req.body;
    const { customer, shipping, cart, discountCode } = payload;

    if (!customer || !shipping || !cart || cart.length === 0) {
      throw new Error('Invalid order payload');
    }

    let subtotal = 0;
    const validatedCart = [];
    for (const item of cart) {
      let realPrice = 0;
      let name = item.name;
      let variantId = item.variantId || null;
      let variantName = item.variantName || null;

      if (variantId) {
        const { data: variantData } = await supabaseAdmin
          .from('product_variants')
          .select('id, price_jmd, name, products(name)')
          .eq('id', variantId)
          .maybeSingle();

        if (variantData) {
          realPrice = Number(variantData.price_jmd) || 0;
          name = `${variantData.products.name} - ${variantData.name}`;
          variantName = variantData.name;
        } else {
          throw new Error(`Invalid variant ID in cart: ${item.name}`);
        }
      } else if (variantName) {
        const { data: variantData } = await supabaseAdmin
          .from('product_variants')
          .select('id, price_jmd, name, products(name)')
          .eq('product_id', item.productId)
          .eq('name', variantName)
          .maybeSingle();

        if (variantData) {
          realPrice = Number(variantData.price_jmd) || 0;
          name = `${variantData.products.name} - ${variantData.name}`;
          variantId = variantData.id;
        } else {
          throw new Error(`Invalid variant name in cart: ${item.name}`);
        }
      } else {
        const { data: productData } = await supabaseAdmin
          .from('products')
          .select('price_jmd, name')
          .eq('id', item.productId)
          .maybeSingle();

        if (productData) {
          realPrice = Number(productData.price_jmd) || 0;
          name = productData.name;
        } else {
          throw new Error(`Invalid item in cart: ${item.name}`);
        }
      }

      subtotal += (realPrice * item.quantity);
      validatedCart.push({
        ...item,
        price: realPrice,
        name: name,
        variantId: variantId,
        variantName: variantName
      });
    }

    let discountAmount = 0;
    let appliedDiscountCode = null;

    if (discountCode) {
      const { data: discountData } = await supabaseAdmin
        .from('discount_codes')
        .select('*')
        .eq('code', discountCode.toUpperCase())
        .eq('active', true)
        .single();

      if (discountData) {
        const now = new Date();
        const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null;
        const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null;
        
        let isValid = true;
        if (discountData.usage_limit && discountData.used_count >= discountData.usage_limit) isValid = false;
        if (startsAt && startsAt > now) isValid = false;
        if (endsAt && endsAt < now) isValid = false;
        if (discountData.minimum_subtotal && subtotal < discountData.minimum_subtotal) isValid = false;

        if (isValid) {
          if (discountData.discount_type === 'percent') {
            discountAmount = subtotal * (Number(discountData.discount_value) / 100);
          } else {
            discountAmount = Number(discountData.discount_value);
          }
          if (discountAmount > subtotal) discountAmount = subtotal;
          appliedDiscountCode = discountData.code;
          
          await supabaseAdmin.from('discount_codes').update({ used_count: discountData.used_count + 1 }).eq('id', discountData.id);
        }
      }
    }

    const subtotalAfterDiscount = subtotal - discountAmount;

    let shippingCost = 0;
    let shippingStatus = 'confirmed';
    let deliveryMethod = 'delivery';
    let deliveryService = shipping.deliveryMethod;

    if (deliveryService === 'Zipmail') shippingCost = 500;
    else if (deliveryService === 'Knutsford') shippingCost = 700;
    else if (deliveryService === 'Bearer') shippingCost = 750;
    else if (deliveryService === 'Overseas') {
      shippingStatus = 'pending_quote';
    } else if (deliveryService === 'Pickup') {
      deliveryMethod = 'pickup';
      shippingCost = 0;
    }

    if (subtotalAfterDiscount >= 10000 || deliveryService === 'Overseas') {
      shippingCost = 0;
    }

    const total = subtotalAfterDiscount + shippingCost;

    let customerId = null;
    if (customer.email) {
      const { data: existingByEmail } = await supabaseAdmin.from('customers').select('id').eq('email', customer.email).maybeSingle();
      if (existingByEmail) customerId = existingByEmail.id;
    }
    if (!customerId && customer.phone) {
      const { data: existingByPhone } = await supabaseAdmin.from('customers').select('id').eq('phone', customer.phone).maybeSingle();
      if (existingByPhone) customerId = existingByPhone.id;
    }
    
    if (!customerId) {
      const { data: newCustomer, error: custError } = await supabaseAdmin
        .from('customers')
        .insert({
          full_name: customer.fullName,
          phone: customer.phone,
          email: customer.email
        })
        .select('id')
        .single();
      if (custError) throw custError;
      customerId = newCustomer.id;
    }

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `FSB-${dateStr}-${randomNum}`;
    
    let formattedAddress = shipping.addressLine1;
    if (shipping.addressLine2) formattedAddress += `, ${shipping.addressLine2}`;
    if (shipping.city) formattedAddress += `, ${shipping.city}`;
    if (shipping.parish) formattedAddress += `, ${shipping.parish}`;
    if (shipping.stateProvince) formattedAddress += `, ${shipping.stateProvince}`;
    if (shipping.country) formattedAddress += `, ${shipping.country}`;

    let pointsEarned = Math.floor(subtotalAfterDiscount);
    try {
        const { data: customerData } = await supabaseAdmin.from('customers').select('lifetime_earned_points').eq('id', customerId).maybeSingle();
        const lifetimePoints = customerData ? (Number(customerData.lifetime_earned_points) || 0) : 0;
        
        const { data: settingsRows } = await supabaseAdmin.from('store_settings').select('key, value').in('key', ['loyalty_program', 'loyalty_point_policy']);
        const settings = (settingsRows || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
        
        const policy = settings.loyalty_point_policy;
        let policyObj = {};
        if (typeof policy === 'string') { try { policyObj = JSON.parse(policy); } catch(e){} } else if (policy) { policyObj = policy; }
        
        const pointsPerJmd = typeof policyObj.pointsPerJmd === 'number' ? policyObj.pointsPerJmd : 1;
        const tierMultipliers = Array.isArray(policyObj.tierMultipliers) ? policyObj.tierMultipliers : [1, 2, 3];

        const prog = settings.loyalty_program;
        let progObj = {};
        if (typeof prog === 'string') { try { progObj = JSON.parse(prog); } catch(e){} } else if (prog) { progObj = prog; }
        
        const tiers = Array.isArray(progObj.tiers) ? progObj.tiers : [];
        let tierIndex = 0;
        
        for (let i = 0; i < tiers.length; i++) {
            let threshold = 0;
            if (tiers[i].minimumLifetimePoints !== undefined) threshold = Number(tiers[i].minimumLifetimePoints);
            else if (tiers[i].requiredPoints !== undefined) threshold = Number(tiers[i].requiredPoints);
            else {
                const match = String(tiers[i].threshold || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
                if (match) threshold = Number(match[0]);
            }
            if (!isNaN(threshold) && lifetimePoints >= threshold) tierIndex = i;
        }
        
        const multiplier = typeof tiers[tierIndex]?.pointsMultiplier === 'number' ? tiers[tierIndex].pointsMultiplier : (tierMultipliers[tierIndex] || 1);
        pointsEarned = Math.floor(subtotalAfterDiscount * pointsPerJmd * multiplier);
    } catch (e) {
        console.error("Error calculating loyalty multiplier", e);
    }

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        country: shipping.country,
        address_line_1: shipping.addressLine1,
        address_line_2: shipping.addressLine2,
        city: shipping.city,
        parish: shipping.parish,
        state_province: shipping.stateProvince,
        postal_code: shipping.postalCode,
        shipping_address: formattedAddress,
        delivery_method: deliveryMethod,
        delivery_service: deliveryService,
        customer_notes: shipping.notes,
        subtotal_jmd: subtotal,
        discount_code: appliedDiscountCode,
        discount_total_jmd: discountAmount,
        shipping_total_jmd: shippingCost,
        grand_total_jmd: total,
        points_earned: pointsEarned,
        payment_method: 'Fygaro',
        status: 'pending',
        payment_status: 'unpaid',
        fulfillment_status: 'unfulfilled'
      })
      .select('id')
      .single();

    if (orderError) throw orderError;
    const orderId = orderData.id;

    const orderItems = validatedCart.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      variant_id: item.variantId,
      variant_name: item.variantName,
      product_name: item.name,
      unit_price_jmd: item.price,
      quantity: item.quantity,
      line_total_jmd: item.price * item.quantity
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Resend Email Logic
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL = process.env.OWNER_EMAIL || 'clientemail@example.com';
    const FROM_EMAIL = process.env.FROM_EMAIL || 'For You Skin Bar <orders@orders.foryouskinbar.com>';

    if (RESEND_API_KEY) {
      const itemsListText = validatedCart.map((item, idx) => `${idx + 1}. ${item.name} × ${item.quantity} — J$${(item.price * item.quantity).toLocaleString()}`).join('\n');

      const customerHtml = `
        <p>Hi ${customer.fullName},</p>
        <p>Thank you for your order with For You Skin Bar.</p>
        <p><b>Order Number:</b> ${orderNumber}<br>
        <b>Payment Status:</b> Awaiting Fygaro payment<br>
        <b>Delivery Method:</b> ${deliveryService}</p>
        <p><b>Items:</b><br>${itemsListText.replace(/\n/g, '<br>')}</p>
        <p><b>Subtotal:</b> J$${subtotal.toLocaleString()}<br>
        ${discountAmount > 0 ? `<b>Discount (${appliedDiscountCode}):</b> -J$${discountAmount.toLocaleString()}<br>` : ''}
        <b>Shipping:</b> ${deliveryService === 'Overseas' ? 'To be confirmed' : 'J$' + shippingCost.toLocaleString()}<br>
        <b>Final Total:</b> ${deliveryService === 'Overseas' ? 'Pending shipping confirmation' : 'J$' + total.toLocaleString()}</p>
        <p><b>Delivery Address:</b><br>
        ${shipping.addressLine1}<br>
        ${shipping.addressLine2 ? shipping.addressLine2 + '<br>' : ''}
        ${shipping.city}${shipping.stateProvince ? ', ' + shipping.stateProvince : ''}<br>
        ${shipping.parish ? shipping.parish + '<br>' : ''}
        ${shipping.postalCode ? shipping.postalCode + '<br>' : ''}
        ${shipping.country}</p>
        <p>Please note: this is an order confirmation, not a tax invoice. Card payment is completed securely through Fygaro.</p>
        <p>Thank you for shopping with us.</p>
      `;

      const ownerHtml = `
        <p>A new order was submitted.</p>
        <p><b>Customer:</b><br>
        Name: ${customer.fullName}<br>
        Phone: ${customer.phone}<br>
        Email: ${customer.email}</p>
        <p><b>Delivery:</b><br>
        Method: ${deliveryService}<br>
        Address: ${shipping.addressLine1}, ${shipping.city}, ${shipping.country}<br>
        Postal / ZIP Code: ${shipping.postalCode || 'N/A'}</p>
        <p><b>Order:</b><br>${itemsListText.replace(/\n/g, '<br>')}</p>
        <p>Subtotal: J$${subtotal.toLocaleString()}<br>
        ${discountAmount > 0 ? `Discount (${appliedDiscountCode}): -J$${discountAmount.toLocaleString()}<br>` : ''}
        Shipping: ${deliveryService === 'Overseas' ? 'To be confirmed' : 'J$' + shippingCost.toLocaleString()}<br>
        Total: ${deliveryService === 'Overseas' ? 'Pending shipping confirmation' : 'J$' + total.toLocaleString()}</p>
        <p><b>Notes:</b><br>${shipping.notes || 'None'}</p>
      `;

      let resCustomerOk = false;
      let customerErrorMsg = null;
      try {
        const resCustomer = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customer.email,
            subject: `Your For You Skin Bar order has been received — ${orderNumber}`,
            html: customerHtml
          })
        });
        resCustomerOk = resCustomer.ok;
        if (!resCustomer.ok) customerErrorMsg = JSON.stringify(await resCustomer.json());
      } catch (err) {
        customerErrorMsg = String(err);
      }

      await supabaseAdmin.from('email_logs').insert({
        order_id: orderId,
        recipient: customer.email,
        email_type: 'customer_confirmation',
        status: resCustomerOk ? 'sent' : 'error',
        error_message: customerErrorMsg
      });

      let resOwnerOk = false;
      let ownerErrorMsg = null;
      try {
        const resOwner = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `New For You Skin Bar order — ${orderNumber}`,
            html: ownerHtml
          })
        });
        resOwnerOk = resOwner.ok;
        if (!resOwner.ok) ownerErrorMsg = JSON.stringify(await resOwner.json());
      } catch (err) {
        ownerErrorMsg = String(err);
      }

      await supabaseAdmin.from('email_logs').insert({
        order_id: orderId,
        recipient: OWNER_EMAIL,
        email_type: 'owner_notification',
        status: resOwnerOk ? 'sent' : 'error',
        error_message: ownerErrorMsg
      });
    } else {
      await supabaseAdmin.from('email_logs').insert({ order_id: orderId, recipient: customer.email, email_type: 'customer_confirmation', status: 'pending_resend_setup', error_message: 'RESEND_API_KEY missing' });
      await supabaseAdmin.from('email_logs').insert({ order_id: orderId, recipient: OWNER_EMAIL, email_type: 'owner_notification', status: 'pending_resend_setup', error_message: 'RESEND_API_KEY missing' });
    }

    // ── Build Fygaro Payment URL ──
    const fygaroUrl = buildFygaroPaymentUrl(orderNumber, total);

    res.status(200).json({ 
      success: true, 
      order_number: orderNumber,
      grand_total: total,
      shipping_status: shippingStatus,
      email_status: RESEND_API_KEY ? 'processed' : 'pending_setup',
      // Frontend will redirect the customer here to complete payment
      fygaro_url: fygaroUrl,
      fygaro_configured: !!fygaroUrl,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Fygaro Webhook Handler ──
// Fygaro calls this URL after a successful payment.
// The Fygaro-Signature header is verified before any DB changes.
app.post('/api/fygaro-webhook', async (req, res) => {
  try {
    const signature = req.headers['fygaro-signature'] || req.headers['x-fygaro-signature'] || '';
    const keyId     = req.headers['fygaro-key-id'] || '';
    const rawBody   = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');

    // Verify the request is genuinely from Fygaro
    if (!FYGARO_API_SECRET) {
      console.error('[Fygaro Webhook] FYGARO_API_SECRET is not configured.');
      return res.status(503).json({ error: 'Fygaro webhook is not configured' });
    }
    if (!verifyFygaroSignature(rawBody, signature, keyId)) {
      console.warn('[Fygaro Webhook] Signature verification failed.');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    console.log('[Fygaro Webhook] Received:', JSON.stringify(payload));

    // Extract the order reference (we set this as custom_reference in the JWT).
    // Fygaro hook payloads use customReference; return URLs may use custom_reference.
    const orderRef = payload.customReference || payload.custom_reference || payload.client_reference || payload.order_ref;
    const paymentRef = payload.transactionId || payload.reference || payload.id || payload.payment_id || null;
    const paymentStatus = String(payload.status || payload.paymentStatus || '').toLowerCase();
    const amountPaid = parseMoney(payload.amount ?? payload.total ?? payload.totalAmount);
    const currency = String(payload.currency || 'JMD').toUpperCase();

    if (!orderRef) {
      return res.status(400).json({ error: 'No order reference in payload' });
    }

    // Fygaro payment hooks are sent after successful payments. If a status is
    // included, only process confirmed successful values.
    if (paymentStatus && !['paid', 'success', 'completed', 'approved', 'captured'].includes(paymentStatus)) {
      console.log(`[Fygaro Webhook] Ignoring non-success status: ${paymentStatus}`);
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    // Fetch the order
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, payment_status, grand_total_jmd, customer_id, delivery_service, admin_notes')
      .eq('order_number', orderRef)
      .maybeSingle();

    if (fetchErr || !order) {
      console.error('[Fygaro Webhook] Order not found:', orderRef, fetchErr);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Idempotency — skip if already marked paid
    if (order.payment_status === 'paid') {
      console.log('[Fygaro Webhook] Already paid, skipping:', orderRef);
      return res.status(200).json({ received: true, action: 'already_paid' });
    }

    if (currency !== 'JMD') {
      console.error('[Fygaro Webhook] Currency mismatch:', currency, orderRef);
      return res.status(400).json({ error: 'Currency mismatch' });
    }

    const expectedTotal = Number(order.grand_total_jmd || 0);
    if (amountPaid !== null && amountPaid + 1 < expectedTotal) {
      console.error('[Fygaro Webhook] Amount mismatch:', { orderRef, expectedTotal, amountPaid });
      return res.status(400).json({ error: 'Payment amount does not match order total' });
    }

    const paymentNote = [
      '[Fygaro Payment Confirmed]',
      `Transaction: ${paymentRef || 'N/A'}`,
      `Amount: ${amountPaid === null ? 'N/A' : `J$${amountPaid.toLocaleString()}`}`,
      `Received: ${new Date().toISOString()}`
    ].join(' ');

    // Mark order as paid
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'Fygaro',
        status: order.status === 'pending' ? 'confirmed' : order.status,
        admin_notes: order.admin_notes ? `${paymentNote}\n\n${order.admin_notes}` : paymentNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateErr) throw updateErr;

    console.log(`[Fygaro Webhook] Order ${orderRef} marked as PAID.`);

    // Fetch customer details for confirmation email
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('full_name, email, phone')
      .eq('id', order.customer_id)
      .maybeSingle();

    // Fetch order items for email
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, unit_price_jmd, line_total_jmd')
      .eq('order_id', order.id);

    // Send payment confirmation email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL    = process.env.OWNER_EMAIL || 'clientemail@example.com';
    const FROM_EMAIL     = process.env.FROM_EMAIL  || 'For You Skin Bar <orders@orders.foryouskinbar.com>';

    if (RESEND_API_KEY && customer?.email) {
      const itemsHtml = (items || []).map((item, i) =>
        `${i + 1}. ${escapeHtml(item.product_name)} x ${escapeHtml(item.quantity)} - J$${Number(item.line_total_jmd).toLocaleString()}`
      ).join('<br>');

      const confirmHtml = `
        <p>Hi ${escapeHtml(customer.full_name)},</p>
        <p>Great news - your payment has been <strong>confirmed</strong>.</p>
        <p><b>Order Number:</b> ${escapeHtml(order.order_number)}<br>
        <b>Amount Paid:</b> J$${Number(order.grand_total_jmd).toLocaleString()}<br>
        <b>Payment Method:</b> Fygaro (Card)</p>
        <p><b>Items:</b><br>${itemsHtml}</p>
        <p>We are now preparing your order. You will receive a shipping update soon.</p>
        <p>Thank you for shopping with For You Skin Bar.</p>
      `;

      const ownerConfirmHtml = `
        <p>Payment confirmed for order <strong>${escapeHtml(order.order_number)}</strong>.</p>
        <p>Customer: ${escapeHtml(customer.full_name)} (${escapeHtml(customer.email)}, ${escapeHtml(customer.phone)})<br>
        Amount: J$${Number(order.grand_total_jmd).toLocaleString()}<br>
        Delivery: ${escapeHtml(order.delivery_service)}</p>
        <p><b>Items:</b><br>${itemsHtml}</p>
        <p>Please prepare and dispatch this order.</p>
      `;

      // Email customer
      try {
        const r1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customer.email,
            subject: `Payment Confirmed - Your For You Skin Bar order ${order.order_number}`,
            html: confirmHtml,
          }),
        });
        await supabaseAdmin.from('email_logs').insert({
          order_id: order.id, recipient: customer.email,
          email_type: 'payment_confirmed', status: r1.ok ? 'sent' : 'error',
        });
      } catch (e) { console.error('[Fygaro Webhook] Customer email error:', e); }

      // Notify owner
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `Payment Received - ${order.order_number} (J$${Number(order.grand_total_jmd).toLocaleString()})`,
            html: ownerConfirmHtml,
          }),
        });
      } catch (e) { console.error('[Fygaro Webhook] Owner email error:', e); }
    }

    res.status(200).json({ received: true, action: 'paid', order: orderRef });
  } catch (err) {
    console.error('[Fygaro Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/payment-status', async (req, res) => {
  try {
    const ref = String(req.query.ref || req.query.customReference || req.query.custom_reference || '').trim();
    const token = String(req.query.token || '').trim();
    if (!ref) return res.status(400).json({ error: 'Order reference is required.' });
    if (!verifyOrderAccessToken(ref, token)) return res.status(403).json({ error: 'Invalid order access token.' });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, payment_status, delivery_service, shipping_address, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd')
      .eq('order_number', ref)
      .maybeSingle();

    if (orderError || !order) return res.status(404).json({ error: 'Order not found.' });

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, unit_price_jmd, line_total_jmd')
      .eq('order_id', order.id);
    if (itemsError) throw itemsError;

    return res.status(200).json({ order, items: items || [] });
  } catch (err) {
    console.error('[Payment Status] API Error:', err);
    return res.status(500).json({ error: 'Unable to load payment status.' });
  }
});

// ── Order Cancellation Endpoint (EU Compliance) ──
app.post('/api/orders/cancel', async (req, res) => {
  try {
    const { orderNumber, email } = req.body;
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    if (!orderNumber || !email) {
      return res.status(400).json({ error: 'Order number and email are required.' });
    }

    // 1. Fetch order and customer
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('*, customers(full_name, email, phone)')
      .eq('order_number', orderNumber.trim())
      .maybeSingle();

    if (fetchErr || !order) {
      console.error('[Cancel Order] Fetch error or order not found:', fetchErr);
      return res.status(404).json({ error: 'Order not found. Please verify the order number.' });
    }

    // 2. Validate email matches
    const customerEmail = order.customers?.email || order.email || '';
    if (customerEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'The email address provided does not match this order.' });
    }

    // 3. Verify cancellation eligibility
    const orderStatus = String(order.status || '').toLowerCase();
    const fulfillmentStatus = String(order.fulfillment_status || '').toLowerCase();
    if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(orderStatus) || ['shipped', 'delivered', 'picked_up'].includes(fulfillmentStatus)) {
      return res.status(400).json({
        error: `This order cannot be cancelled because its current status is "${order.status || order.fulfillment_status}".`
      });
    }

    // 4. Perform database updates
    const updateFields = {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    };

    // Prepend customer cancellation note to admin notes
    const paymentNote = order.payment_status === 'paid'
      ? 'Order was already paid. Admin refund review is required before marking payment as refunded.'
      : `Payment status at cancellation: ${order.payment_status || 'unknown'}.`;
    let newAdminNotes = [
      '[Customer Cancellation Request]',
      `Reason: ${reason || 'No reason provided'}`,
      paymentNote,
      `Requested: ${new Date().toISOString()}`
    ].join('\n');
    if (order.admin_notes) {
      newAdminNotes = `${newAdminNotes}\n\n${order.admin_notes}`;
    }
    updateFields.admin_notes = newAdminNotes;

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(updateFields)
      .eq('id', order.id);

    if (updateErr) throw updateErr;

    console.log(`[Cancel Order] Order ${orderNumber} cancelled successfully by customer.`);

    // 5. Send confirmation emails via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL    = process.env.OWNER_EMAIL || 'clientemail@example.com';
    const FROM_EMAIL     = process.env.FROM_EMAIL  || 'For You Skin Bar <orders@orders.foryouskinbar.com>';

    if (RESEND_API_KEY && customerEmail) {
      const customerHtml = `
        <p>Hi ${escapeHtml(order.customers?.full_name || 'Valued Customer')},</p>
        <p>Your request to cancel For You Skin Bar order <strong>${escapeHtml(order.order_number)}</strong> has been received and the order has been marked cancelled.</p>
        ${order.payment_status === 'paid' ? `<p>Since this order was paid, our team will review and process the refund manually. Please allow 3-5 business days after refund processing for your bank to reflect it.</p>` : ''}
        <p>If you did not make this request or have any questions, please contact us on WhatsApp immediately.</p>
        <p>Thank you,<br>For You Skin Bar Team</p>
      `;

      const ownerHtml = `
        <p><strong>Order Cancellation Request</strong></p>
        <p>Order <strong>${escapeHtml(order.order_number)}</strong> has been cancelled by the customer.</p>
        <p><b>Customer:</b> ${escapeHtml(order.customers?.full_name || 'N/A')} (${escapeHtml(customerEmail)})</p>
        <p><b>Reason:</b> ${escapeHtml(reason || 'No reason provided')}</p>
        <p><b>Payment Status:</b> ${escapeHtml(order.payment_status)}<br>
        <b>Total Order Value:</b> J$${Number(order.grand_total_jmd).toLocaleString()}</p>
        ${order.payment_status === 'paid' ? '<p><strong>Action needed:</strong> process the refund in Fygaro, then mark the payment as refunded in the admin dashboard.</p>' : '<p>No payment refund is needed unless payment was collected outside the website.</p>'}
      `;

      // Customer email
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customerEmail,
            subject: `Order Cancellation Received - ${order.order_number}`,
            html: customerHtml,
          }),
        });
      } catch (e) { console.error('[Cancel Order] Customer email error:', e); }

      // Owner email
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `Order Cancelled by Customer - ${order.order_number}`,
            html: ownerHtml,
          }),
        });
      } catch (e) { console.error('[Cancel Order] Owner email error:', e); }
    }

    return res.status(200).json({ success: true, orderNumber });

  } catch (err) {
    console.error('[Cancel Order] API Error:', err);
    return res.status(500).json({ error: 'Failed to request order cancellation. Please try again.' });
  }
});


// ── Static Files serving ──
// Serve all files from current directory
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Fallback to index.html for SPA-like behavior (optional, if using client side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
