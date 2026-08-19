// Secure customer dashboard routes. This file is loaded before server.js from boot.js.
const expressModulePath = require.resolve('express');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const loyaltyEngine = require('./loyalty-engine');

const nativeExpress = express;
const db = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { realtime: { transport: WebSocket } }
);

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Builds the account-page loyalty summary from the ledger engine (loyalty-engine.js), the
// single source of truth for balance/tier math shared with the admin dashboard. Marketing
// copy (tier rank label + summary) is layered in from the Page Content editor when present,
// purely for nicer wording — never for the numbers themselves.
async function loyaltySummaryFor(customer, programmeCopy) {
  const policy = await loyaltyEngine.loadPolicy();
  if (!customer) {
    const tier = loyaltyEngine.tierFor(0, policy);
    return { policy, tier, balance: 0, lifetimeEarned: 0, lifetimePurchaseJmd: 0 };
  }
  const balance = await loyaltyEngine.getBalance(customer.id);
  const tier = loyaltyEngine.tierFor(customer.lifetime_purchase_jmd, policy);
  const copyTiers = Array.isArray(programmeCopy?.tiers) ? programmeCopy.tiers : [];
  const copyTier = copyTiers[tier.index] || {};
  return {
    policy, tier, balance,
    lifetimeEarned: number(customer.lifetime_earned_points),
    lifetimePurchaseJmd: number(customer.lifetime_purchase_jmd),
    rank: copyTier.rank || tier.name,
    summary: copyTier.summary || `Earning ${tier.multiplier}× ${policy.creditLabel} on every eligible purchase.`
  };
}

function labelFor(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'refunded' || order.payment_status === 'refunded') return 'Refunded';
  if (order.fulfillment_status === 'delivered' || order.status === 'delivered') return 'Delivered';
  if (order.fulfillment_status === 'shipped' || order.status === 'shipped') return 'On the way';
  if (order.status === 'ready_for_pickup') return 'Ready for pickup';
  if (order.payment_status === 'awaiting_confirmation') return 'Awaiting payment confirmation';
  if (order.payment_status === 'unpaid') return 'Payment pending';
  if (order.status === 'processing' || order.fulfillment_status === 'packed') return 'Being prepared';
  if (order.status === 'confirmed') return 'Order confirmed';
  return 'Order received';
}

function policyUpdatesFrom(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { source = []; }
  }
  const updates = Array.isArray(source) ? source : (Array.isArray(source?.items) ? source.items : []);
  return updates
    .filter((update) => update && update.id && update.title)
    .slice(0, 20)
    .map((update) => ({
      id: String(update.id),
      title: String(update.title || 'Policy updated'),
      message: String(update.message || 'A store policy has been updated.'),
      href: String(update.href || `/policies.html#${update.policyId || ''}`),
      policyId: String(update.policyId || ''),
      updatedAt: String(update.updatedAt || '')
    }));
}

async function authenticatedUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('Please sign in to access your account.'), { status: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Your session has expired. Please sign in again.'), { status: 401 });
  return data.user;
}

async function customerForEmail(email, user = null) {
  if (!email) return null;
  const customerFields = 'id, full_name, email, phone, whatsapp, created_at, loyalty_points_balance, lifetime_earned_points, lifetime_purchase_jmd, date_of_birth, referral_code, quiz_bonus_awarded_at, default_country, default_address_line1, default_address_line2, default_city, default_parish, default_state_province, default_postal_code, customer_origin, was_imported, imported_at, account_user_id, account_created_at';
  const { data, error } = await db.from('customers').select(customerFields).ilike('email', email).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  
  if (!data?.[0] && user) {
    // Lazily insert customer record so they appear in Admin
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
    const phone = user.user_metadata?.phone || null;
    const { data: newData, error: insertError } = await db.from('customers').insert({
      email: email,
      full_name: fullName,
      phone: phone,
      created_at: user.created_at,
      customer_origin: 'account',
      account_user_id: user.id,
      account_created_at: user.created_at
    }).select(customerFields).single();

    if (!insertError && newData) {
      try { await loyaltyEngine.awardSignupBonusIfEligible(newData.id); } catch (err) { console.warn('[Glow Rewards] Signup bonus failed:', err.message); }
      return newData;
    }
  }

  if (data?.[0] && user && (data[0].account_user_id !== user.id || data[0].customer_origin !== 'account')) {
    const { data: linkedCustomer, error: linkError } = await db.from('customers').update({
      account_user_id: user.id,
      account_created_at: user.created_at || new Date().toISOString(),
      customer_origin: 'account',
      updated_at: new Date().toISOString()
    }).eq('id', data[0].id).select(customerFields).single();
    if (!linkError && linkedCustomer) {
      try { await loyaltyEngine.awardSignupBonusIfEligible(linkedCustomer.id); } catch (err) { console.warn('[Glow Rewards] Signup bonus failed:', err.message); }
      return linkedCustomer;
    }
  }

  return data?.[0] || null;
}

async function dashboardFor(user) {
  const customer = await customerForEmail(user.email, user);
  let orders = [];
  if (customer) {
    const { data, error } = await db.from('orders')
      .select('id, order_number, status, payment_status, fulfillment_status, delivery_method, delivery_service, shipping_address, parish, city, country, tracking_carrier, tracking_number, tracking_url, tracking_updated_at, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd, created_at, points_earned')
      .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    orders = data || [];
  }

  const ids = orders.map((order) => order.id);
  let items = [];
  let cancellationRequests = [];
  if (ids.length) {
    const { data, error } = await db.from('order_items')
      .select('order_id, product_name, variant_name, sku, quantity, unit_price_jmd, line_total_jmd')
      .in('order_id', ids);
    if (error) throw error;
    items = data || [];

    const { data: requestRows, error: requestError } = await db.from('order_cancellation_requests')
      .select('id,order_id,status,reason,request_source,created_at,reviewed_at,admin_note')
      .in('order_id', ids)
      .order('created_at', { ascending: false });
    if (requestError) throw requestError;
    cancellationRequests = requestRows || [];
  }

  const { data: settingsRows, error: settingsError } = await db.from('store_settings').select('key, value').in('key', ['loyalty_program', 'policy_updates']);
  if (settingsError) throw settingsError;
  const settings = (settingsRows || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
  let programmeCopy = settings.loyalty_program;
  if (typeof programmeCopy === 'string') { try { programmeCopy = JSON.parse(programmeCopy); } catch (_) { programmeCopy = null; } }
  const loyalty = await loyaltySummaryFor(customer, programmeCopy);

  const itemsByOrder = items.reduce((all, item) => {
    if (!all[item.order_id]) all[item.order_id] = [];
    all[item.order_id].push({ productName: item.product_name, variantName: item.variant_name || '', sku: item.sku || '', quantity: number(item.quantity), unitPriceJmd: number(item.unit_price_jmd), lineTotalJmd: number(item.line_total_jmd) });
    return all;
  }, {});
  const cancellationByOrder = cancellationRequests.reduce((all, request) => {
    if (!all[request.order_id]) all[request.order_id] = request;
    return all;
  }, {});

  const responseOrders = orders.map((order) => {
    const trackingVisible = ['shipped', 'delivered'].includes(String(order.status || '').toLowerCase())
      || ['shipped', 'delivered'].includes(String(order.fulfillment_status || '').toLowerCase());
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      statusLabel: labelFor(order),
      deliveryMethod: order.delivery_method,
      deliveryService: order.delivery_service || '',
      deliveryAddress: order.shipping_address || '',
      trackingCarrier: trackingVisible ? (order.tracking_carrier || '') : '',
      trackingNumber: trackingVisible ? (order.tracking_number || '') : '',
      trackingUrl: trackingVisible ? (order.tracking_url || '') : '',
      trackingUpdatedAt: trackingVisible ? (order.tracking_updated_at || null) : null,
      parish: order.parish || '',
      city: order.city || '',
      country: order.country || '',
      subtotalJmd: number(order.subtotal_jmd),
      discountTotalJmd: number(order.discount_total_jmd),
      shippingTotalJmd: number(order.shipping_total_jmd),
      grandTotalJmd: number(order.grand_total_jmd),
      createdAt: order.created_at,
      pointsEarned: number(order.points_earned),
      cancellationRequest: cancellationByOrder[order.id] ? {
        id: cancellationByOrder[order.id].id,
        status: cancellationByOrder[order.id].status,
        reason: cancellationByOrder[order.id].reason,
        source: cancellationByOrder[order.id].request_source,
        createdAt: cancellationByOrder[order.id].created_at,
        reviewedAt: cancellationByOrder[order.id].reviewed_at,
        adminNote: cancellationByOrder[order.id].admin_note || ''
      } : null,
      items: itemsByOrder[order.id] || []
    };
  });

  return {
    profile: {
      fullName: customer?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      email: user.email || '',
      phone: customer?.phone || user.user_metadata?.phone || '',
      whatsapp: customer?.whatsapp || '',
      country: customer?.default_country || 'Jamaica',
      addressLine1: customer?.default_address_line1 || '',
      addressLine2: customer?.default_address_line2 || '',
      city: customer?.default_city || '',
      parish: customer?.default_parish || '',
      stateProvince: customer?.default_state_province || '',
      postalCode: customer?.default_postal_code || '',
      joinedAt: customer?.created_at || user.created_at || ''
    },
    summary: {
      orderCount: responseOrders.length,
      paidOrderCount: orders.filter((order) => order.payment_status === 'paid').length,
      totalOrderSpend: orders.reduce((total, order) => total + Math.max(0, number(order.grand_total_jmd)), 0),
      recentOrder: responseOrders[0] || null
    },
    loyalty: {
      creditLabel: loyalty.policy.creditLabel,
      pointsBalance: loyalty.balance,
      lifetimeEarned: loyalty.lifetimeEarned,
      lifetimePurchaseJmd: loyalty.lifetimePurchaseJmd,
      currentTier: {
        name: loyalty.tier.name, rank: loyalty.rank || loyalty.tier.name, summary: loyalty.summary || '',
        threshold: loyalty.tier.threshold, multiplier: loyalty.tier.multiplier
      },
      nextTier: loyalty.tier.nextThreshold != null ? { name: loyalty.tier.nextName, threshold: loyalty.tier.nextThreshold } : null,
      spendToNextTierJmd: loyalty.tier.nextThreshold != null ? Math.max(0, loyalty.tier.nextThreshold - loyalty.lifetimePurchaseJmd) : 0,
      redemptionDenominations: loyalty.policy.redemptionDenominations,
      creditToJmdRatio: loyalty.policy.creditToJmdRatio,
      rewards: loyalty.policy.redemptionDenominations.map((credits) => ({
        title: `${credits.toLocaleString()} ${loyalty.policy.creditLabel}`,
        points: String(credits),
        requiredPoints: credits,
        description: `J$${(credits * loyalty.policy.creditToJmdRatio).toLocaleString()} off your next eligible order`,
        eligible: loyalty.balance >= credits
      })),
      expirationMonths: loyalty.policy.expirationMonths,
      referralCredits: loyalty.policy.referralCredits,
      referralFriendDiscountPercent: loyalty.policy.referralFriendDiscountPercent,
      calculationNote: `${loyalty.policy.creditLabel} are earned on eligible paid orders (1 credit per J$100 spent, no discount code applied) at your active tier's earning rate, and expire ${loyalty.policy.expirationMonths} months after they're earned.`,
      rewardsContactUrl: String(programmeCopy?.hero?.primaryHref || 'https://wa.me/18763094374')
    },
    notifications: policyUpdatesFrom(settings.policy_updates),
    orders: responseOrders
  };
}

function register(app) {
  app.get('/api/customer-portal', async (req, res) => {
    try { return res.status(200).json(await dashboardFor(await authenticatedUser(req))); }
    catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to load your account.' }); }
  });

  app.patch('/api/customer-portal/profile', nativeExpress.json(), async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const fullName = String(req.body?.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Foryou Customer').trim().slice(0, 120);
      const phone = String(req.body?.phone || '').trim().slice(0, 40);
      const whatsapp = String(req.body?.whatsapp || '').trim().slice(0, 40);
      const country = String(req.body?.country || '').trim().slice(0, 60);
      const addressLine1 = String(req.body?.addressLine1 || '').trim().slice(0, 150);
      const addressLine2 = String(req.body?.addressLine2 || '').trim().slice(0, 150);
      const city = String(req.body?.city || '').trim().slice(0, 100);
      const parish = String(req.body?.parish || '').trim().slice(0, 100);
      const stateProvince = String(req.body?.stateProvince || '').trim().slice(0, 100);
      const postalCode = String(req.body?.postalCode || '').trim().slice(0, 40);
      const dateOfBirthRaw = String(req.body?.dateOfBirth || '').trim();
      const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthRaw) ? dateOfBirthRaw : null;
      let customer = await customerForEmail(user.email, user);
      const record = {
        full_name: fullName,
        phone: phone || null,
        whatsapp: whatsapp || null,
        default_country: country || null,
        default_address_line1: addressLine1 || null,
        default_address_line2: addressLine2 || null,
        default_city: city || null,
        default_parish: parish || null,
        default_state_province: stateProvince || null,
        default_postal_code: postalCode || null,
        updated_at: new Date().toISOString()
      };
      if (dateOfBirth) record.date_of_birth = dateOfBirth;
      if (customer) {
        const { data, error } = await db.from('customers').update(record).eq('id', customer.id).select('id').single();
        if (error) throw error;
      } else {
        const { data, error } = await db.from('customers').insert({ ...record, email: user.email }).select('id').single();
        if (error) throw error;
      }
      customer = await customerForEmail(user.email);
      await db.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, full_name: customer.full_name, phone: customer.phone || '' } });
      return res.status(200).json({ profile: {
        fullName: customer.full_name, email: user.email, phone: customer.phone || '', whatsapp: customer.whatsapp || '',
        country: customer.default_country || 'Jamaica', addressLine1: customer.default_address_line1 || '', addressLine2: customer.default_address_line2 || '',
        city: customer.default_city || '', parish: customer.default_parish || '', stateProvince: customer.default_state_province || '', postalCode: customer.default_postal_code || '',
        dateOfBirth: customer.date_of_birth || '',
        joinedAt: customer.created_at || user.created_at
      } });
    } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to update your profile.' }); }
  });

  // Glow & Go rewards: redeem credits, fetch/generate a referral code, and award the
  // one-time skin quiz bonus. All reuse the same authenticated-customer pattern above.
  app.post('/api/rewards/redeem', nativeExpress.json(), async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const customer = await customerForEmail(user.email, user);
      if (!customer) return res.status(404).json({ error: 'We could not find your customer account.' });
      const credits = Number(req.body?.credits);
      const result = await loyaltyEngine.redeemCredits(customer.id, credits);
      return res.status(200).json({ success: true, ...result });
    } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to redeem Glow Credits right now.' }); }
  });

  app.get('/api/rewards/referral-code', async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const customer = await customerForEmail(user.email, user);
      if (!customer) return res.status(404).json({ error: 'We could not find your customer account.' });
      const code = await loyaltyEngine.getOrCreateReferralCode(customer.id);
      return res.status(200).json({ referralCode: code });
    } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to load your referral code.' }); }
  });

  app.post('/api/rewards/quiz-complete', nativeExpress.json(), async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const customer = await customerForEmail(user.email, user);
      if (!customer) return res.status(200).json({ awarded: false });
      const result = await loyaltyEngine.awardQuizCreditsIfEligible(customer.id);
      return res.status(200).json({ awarded: !!result, amount: result?.amount || 0 });
    } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to record your quiz bonus.' }); }
  });
}

function patchedExpress(...args) {
  const app = nativeExpress(...args);
  register(app);
  return app;
}
Object.assign(patchedExpress, nativeExpress);
require.cache[expressModulePath].exports = patchedExpress;
