// Secure customer dashboard routes. This file is loaded before server.js from boot.js.
const expressModulePath = require.resolve('express');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const nativeExpress = express;
const db = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { realtime: { transport: WebSocket } }
);

const DEFAULT_POLICY = {
  creditLabel: 'Glow Credits',
  pointsPerJmd: 1,
  tierMultipliers: [1, 2, 3],
  includeHistoricPaidOrders: true,
  historyStartDate: ''
};

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const object = (value) => {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch (_) { return {}; } }
  return value && typeof value === 'object' ? value : {};
};

function policyFrom(value) {
  const source = object(value);
  const multipliers = Array.isArray(source.tierMultipliers) ? source.tierMultipliers.map((item) => Math.max(0, number(item, 1))) : DEFAULT_POLICY.tierMultipliers;
  return {
    ...DEFAULT_POLICY,
    ...source,
    pointsPerJmd: Math.max(0, number(source.pointsPerJmd, DEFAULT_POLICY.pointsPerJmd)),
    tierMultipliers: multipliers.length ? multipliers : DEFAULT_POLICY.tierMultipliers,
    includeHistoricPaidOrders: source.includeHistoricPaidOrders !== false,
    historyStartDate: typeof source.historyStartDate === 'string' ? source.historyStartDate : ''
  };
}

function thresholdFor(tier, index) {
  const explicit = number(tier?.minimumLifetimePoints ?? tier?.requiredPoints, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const match = String(tier?.threshold || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, number(match[0])) : (index === 0 ? 0 : Number.MAX_SAFE_INTEGER);
}

function rewardPoints(reward) {
  const match = String(reward?.points || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, number(match[0])) : null;
}

function programmeFrom(value, policy) {
  const source = object(value);
  const tiers = (Array.isArray(source.tiers) ? source.tiers : []).map((tier, index) => ({
    name: String(tier.name || `Level ${index + 1}`),
    rank: String(tier.rank || `Level ${index + 1}`),
    threshold: thresholdFor(tier, index),
    multiplier: Math.max(0, number(tier.pointsMultiplier, policy.tierMultipliers[index] ?? 1)),
    summary: String(tier.summary || ''),
    rewards: (Array.isArray(tier.rewards) ? tier.rewards : []).map((reward) => ({
      title: String(reward.title || 'Reward'),
      points: String(reward.points || ''),
      requiredPoints: rewardPoints(reward),
      description: String(reward.description || '')
    }))
  })).sort((left, right) => left.threshold - right.threshold);

  return {
    name: String(source.name || 'Glow & Go Inner Circle'),
    hero: object(source.hero),
    tiers: tiers.length ? tiers : [{ name: 'Radiant Rookie', rank: 'Level One', threshold: 0, multiplier: 1, summary: '', rewards: [] }]
  };
}

function eligible(order, policy) {
  if (order.payment_status !== 'paid' || ['cancelled', 'refunded'].includes(order.status)) return false;
  if (!policy.includeHistoricPaidOrders && policy.historyStartDate) {
    const start = new Date(`${policy.historyStartDate}T00:00:00`);
    if (Number.isFinite(start.valueOf()) && new Date(order.created_at) < start) return false;
  }
  return true;
}

function loyaltyFor(customer, orders, programme, policy) {
  let balance = customer ? number(customer.loyalty_points_balance) : 0;
  let lifetime = customer ? number(customer.lifetime_earned_points) : 0;
  let spend = 0;
  const pointsByOrder = new Map();

  [...orders].sort((left, right) => new Date(left.created_at) - new Date(right.created_at)).forEach((order) => {
    pointsByOrder.set(order.id, number(order.points_earned));
    if (!eligible(order, policy)) return;
    const orderSpend = Math.max(0, number(order.subtotal_jmd, number(order.grand_total_jmd)));
    spend += orderSpend;
  });

  const tierIndex = programme.tiers.reduce((selected, tier, index) => lifetime >= tier.threshold ? index : selected, 0);
  const currentTier = programme.tiers[tierIndex] || programme.tiers[0];
  const nextTier = programme.tiers[tierIndex + 1] || null;
  const rewards = programme.tiers.slice(0, tierIndex + 1).flatMap((tier) => tier.rewards.map((reward) => ({
    ...reward,
    tierName: tier.name,
    eligible: reward.requiredPoints !== null && balance >= reward.requiredPoints
  })));

  return {
    creditLabel: String(policy.creditLabel || 'Glow Credits'),
    pointsBalance: balance,
    lifetimeEarned: lifetime,
    eligibleSpend: spend,
    currentTier,
    nextTier,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.threshold - lifetime) : 0,
    rewards,
    pointsByOrder
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
  const { data, error } = await db.from('customers').select('id, full_name, email, phone, whatsapp, created_at, loyalty_points_balance, lifetime_earned_points, default_country, default_address_line1, default_address_line2, default_city, default_parish, default_state_province, default_postal_code').ilike('email', email).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  
  if (!data?.[0] && user) {
    // Lazily insert customer record so they appear in Admin
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
    const phone = user.user_metadata?.phone || null;
    const { data: newData, error: insertError } = await db.from('customers').insert({
      email: email,
      full_name: fullName,
      phone: phone,
      created_at: user.created_at
    }).select('id, full_name, email, phone, whatsapp, created_at, loyalty_points_balance, lifetime_earned_points, default_country, default_address_line1, default_address_line2, default_city, default_parish, default_state_province, default_postal_code').single();
    
    if (!insertError && newData) return newData;
  }
  
  return data?.[0] || null;
}

async function dashboardFor(user) {
  const customer = await customerForEmail(user.email, user);
  let orders = [];
  if (customer) {
    const { data, error } = await db.from('orders')
      .select('id, order_number, status, payment_status, fulfillment_status, delivery_method, delivery_service, shipping_address, parish, city, country, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd, created_at, points_earned')
      .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    orders = data || [];
  }

  const ids = orders.map((order) => order.id);
  let items = [];
  if (ids.length) {
    const { data, error } = await db.from('order_items')
      .select('order_id, product_name, variant_name, sku, quantity, unit_price_jmd, line_total_jmd')
      .in('order_id', ids);
    if (error) throw error;
    items = data || [];
  }

  const { data: settingsRows, error: settingsError } = await db.from('store_settings').select('key, value').in('key', ['loyalty_program', 'loyalty_point_policy', 'policy_updates']);
  if (settingsError) throw settingsError;
  const settings = (settingsRows || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
  const policy = policyFrom(settings.loyalty_point_policy);
  const programme = programmeFrom(settings.loyalty_program, policy);
  const loyalty = loyaltyFor(customer, orders, programme, policy);

  const itemsByOrder = items.reduce((all, item) => {
    if (!all[item.order_id]) all[item.order_id] = [];
    all[item.order_id].push({ productName: item.product_name, variantName: item.variant_name || '', sku: item.sku || '', quantity: number(item.quantity), unitPriceJmd: number(item.unit_price_jmd), lineTotalJmd: number(item.line_total_jmd) });
    return all;
  }, {});

  const responseOrders = orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    statusLabel: labelFor(order),
    deliveryMethod: order.delivery_method,
    deliveryService: order.delivery_service || '',
    deliveryAddress: order.shipping_address || '',
    parish: order.parish || '',
    city: order.city || '',
    country: order.country || '',
    subtotalJmd: number(order.subtotal_jmd),
    discountTotalJmd: number(order.discount_total_jmd),
    shippingTotalJmd: number(order.shipping_total_jmd),
    grandTotalJmd: number(order.grand_total_jmd),
    createdAt: order.created_at,
    pointsEarned: loyalty.pointsByOrder.get(order.id) || 0,
    items: itemsByOrder[order.id] || []
  }));

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
      paidOrderCount: orders.filter((order) => eligible(order, policy)).length,
      totalOrderSpend: orders.reduce((total, order) => total + Math.max(0, number(order.grand_total_jmd)), 0),
      recentOrder: responseOrders[0] || null
    },
    loyalty: {
      creditLabel: loyalty.creditLabel,
      pointsBalance: loyalty.pointsBalance,
      lifetimeEarned: loyalty.lifetimeEarned,
      eligibleSpend: loyalty.eligibleSpend,
      currentTier: loyalty.currentTier,
      nextTier: loyalty.nextTier,
      pointsToNextTier: loyalty.pointsToNextTier,
      rewards: loyalty.rewards,
      calculationNote: `Credits are calculated from eligible paid orders at ${policy.pointsPerJmd} ${loyalty.creditLabel} per J$1 spent, with your active tier multiplier applied.`,
      rewardsContactUrl: String(programme.hero.primaryHref || 'https://wa.me/18763094374')
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
        joinedAt: customer.created_at || user.created_at 
      } });
    } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Unable to update your profile.' }); }
  });
}

function patchedExpress(...args) {
  const app = nativeExpress(...args);
  register(app);
  return app;
}
Object.assign(patchedExpress, nativeExpress);
require.cache[expressModulePath].exports = patchedExpress;
