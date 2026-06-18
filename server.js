require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json());

// Initialize Supabase Admin Client using Service Role Key
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Railway provides this via environment variables
);

// ── API Routes ──

app.post('/api/validate-discount', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) throw new Error('Code is required');

    const { data: discountData } = await supabaseAdmin
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('active', true)
      .single();

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
        payment_method: 'WiPay',
        status: 'pending',
        payment_status: 'awaiting_confirmation',
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
        <b>Payment Status:</b> Awaiting confirmation<br>
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
        <p>Please note: this is an order confirmation, not a tax invoice. Payment and delivery will be confirmed by For You Skin Bar.</p>
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

    res.status(200).json({ 
      success: true, 
      order_number: orderNumber,
      grand_total: total,
      shipping_status: shippingStatus,
      email_status: RESEND_API_KEY ? 'processed' : 'pending_setup'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Static Files serving ──
// Serve all files from current directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA-like behavior (optional, if using client side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
