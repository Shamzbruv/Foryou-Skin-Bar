// Customer portal API.
// Registered before server.js creates its Express app so authenticated customers
// can view only their own orders, profile, and calculated loyalty information.
const expressModulePath = require.resolve('express');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const originalExpress = express;
const portalSupabase = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const DEFAULT_POINT_POLICY = {
  creditLabel: 'Glow Credits',
  pointsPerJmd: 1,
  tierMultipliers: [1, 2, 3],
  includeHistoricPaidOrders: true,
  historyStartDate: ''
};

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return null; }
  }
  return value && typeof value === 'object' ? value : null;
}

function normalizePolicy(value) {
  const policy = parseJson(value) || {};
  const tierMultipliers = Array.isArray(policy.tierMultipliers)
    ? policy.tierMultipliers.map((multiplier) => Math.max(0, asNumber(multiplier, 1)))
    : DEFAULT_POINT_POLICY.tierMultipliers;

  return {
    ...DEFAULT_POINT_POLICY,
    ...policy,
    pointsPerJmd: Math.max(0, asNumber(policy.pointsPerJmd, DEFAULT_POINT_POLICY.pointsPerJmd)),
    tierMultipliers: tierMultipliers.length ? tierMultipliers : DEFAULT_POINT_POLICY.tierMultipliers,
    includeHistoricPaidOrders: policy.includeHistoricPaidOrders !== false,
    historyStartDate: typeof policy.historyStartDate === 'string' ? policy.historyStartDate : ''
  };
}

function parseThreshold(tier, index) {
  const configured = asNumber(tier && (tier.minimumLifetimePoints ?? tier.requiredPoints), NaN);
  if (Number.isFinite(configured)) return Math.max(0, configured);
  const fromText = String((tier && tier.threshold) || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (fromText) return Math.max(0, asNumber(fromText[0], 0));
  return index === 0 ? 0 : Number.MAX_SAFE_INTEGER;
}

function parseRewardPoints(reward) {
  const match = String((reward && reward.points) || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, asNumber(match[0], 0)) : null;
}

function normalizeProgram(value, policy) {
  const raw = parseJson(value) || {};
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  const tiers = rawTiers.map((tier, index) => ({
    name: String(tier.name || `Level ${index + 1}`),
    rank: String(tier.rank || `Level ${index + 1}`),
    threshold: parseThreshold(tier, index),
    multiplier: Math.max(0, asNumber(tier.pointsMultiplier, policy.tierMultipliers[index] ?? 1)),
    summary: String(tier.summary || ''),
    perks: Array.isArray(tier.perks) ? tier.perks.map(String) : [],
    rewards: Array.isArray(tier.rewards) ? tier.rewards.map((reward) => ({
      title: String(reward.title || 'Reward'),
      points: String(reward.points || ''),
      requiredPoints: parseRewardPoints(reward),
      description: String(reward.description || '')
    })) : []
  })).sort((a, b) => a.threshold - b.threshold);

  return {
    name: String(raw.name || 'Glow & Go Inner Circle'),
    hero: raw.hero && typeof raw.hero === 'object' ? raw.hero : {},
    tiers: tiers.length ? tiers : [{ name: 'Radiant Rookie', rank: 'Level One', threshold: 0, multiplier: 1, summary: '', perks: [], rewards: [] }]
  };
}

function isEligiblePaidOrder(order, policy) {
  if (!order || order.payment_status !== 'paid') return false;
  if (['cancelled', 'refunded'].includes(order.status)) return false;
  if (!policy.includeHistoricPaidOrders && policy.historyStartDate) {
    const start = new Date(`${policy.historyStartDate}T00:00:00`);
    const orderedAt = new Date(order.created_at);
    if (Number.isFinite(start.valueOf()) && orderedAt < start) return false;
  }
  return true;
}

function calculateLoyalty(orders, program, policy) {
  const chronological = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let pointsBalance = 0;
  let lifetimeEarned = 0;
  let eligibleSpend = 0;
  const earnedByOrder = new Map();

  chronological.forEach((order) => {
    if (!isEligiblePaidOrder(order, policy)) {
      earnedByOrder.set(order.id, 0);
      return;
    }

    const activeTierIndex = program.tiers.reduce((selectedIndex, tier, index) => (
      lifetimeEarned >= tier.threshold ? index : selectedIndex
    ), 0);
    const activeTier = program.tiers[activeTierIndex] || program.tiers[0];
    const orderSpend = Math.max(0, asNumber(order.subtotal_jmd, asNumber(order.grand_total_jmd, 0)));
    const points = Math.max(0, Math.floor(orderSpend * policy.pointsPerJmd * activeTier.multiplier));

    eligibleSpend += orderSpend;
    lifetimeEarned += points;
    pointsBalance += points;
    earnedByOrder.set(order.id, points);
  });

  const tierIndex = program.tiers.reduce((selectedIndex, tier, index) => (
    lifetimeEarned >= tier.threshold ? index : selectedIndex
  ), 0);
  const currentTier = program.tiers[tierIndex] || program.tiers[0];
  const nextTier = program.tiers[tierIndex + 1] || null;
  const rewards = program.tiers
    .slice(0, tierIndex + 1)
    .flatMap((tier) => tier.rewards.map((reward) => ({ ...reward, tierName: tier.name, eligible: reward.requiredPoints === null ? false : pointsBalance >= reward.requiredPoints })));

  return {
    creditLabel: policy.creditLabel || 'Glow Credits',
    pointsBalance,
    lifetimeEarned,
    eligibleSpend,
    currentTier,
    nextTier,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.threshold - lifetimeEarned) : 0,
    earnedByOrder,
    rewards
  };
}

function orderStatusLabel(order) {
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

async function getAuthenticatedCustomer(req) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Please sign in to access your account.');
    error.status = 401;
    throw error;
  }
  const { data, error } = await portalSupabase.auth.getUser(token);
  if (error || !data || !data.user) {
    const authError = new Error('Your session has expired. Please sign in again.');
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

async function findCustomerByEmail(email) {
  if (!email) return null;
  const { data, error } = await portalSupabase
    .from('customers')
    .select('id, full_name, email, phone, whatsapp, created_at')
    .ilike('email', email)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function getPortalPayload(user) {
  const customer = await findCustomerByEmail(user.email);
  let orders = [];

  if (customer) {
    const { data, error } = await portalSupabase
      .from('orders')
      .select('id, order_number, status, payment_status, fulfillment_status, delivery_method, delivery_service, shipping_address, parish, city, country, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    orders = data || [];
  }

  const orderIds = orders.map((order) => order.id);
  let items = [];
  if (orderIds.length) {
    const { data, error } = await portalSupabase
      .from('order_items')
      .select('order_id, product_name, variant_name, sku, quantity, unit_price_jmd, line_total_jmd')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    items = data || [];
  }

  const { data: settingRows, error: settingsError } = await portalSupabase
    .from('store_settings')
    .select('key, value')
    .in('key', ['loyalty_program', 'loyalty_point_policy']);
  if (settingsError) throw settingsError;

  const settings = (settingRows || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
  const policy = normalizePolicy(settings.loyalty_point_policy);
  const program = normalizeProgram(settings.loyalty_program, policy);
  const loyalty = calculateLoyalty(orders, program, policy);

  const itemMap = items.reduce((map, item) => {
    if (!map[item.order_id]) map[item.order_id] = [];
    map[item.order_id].push({
      productName: item.product_name,
      variantName: item.variant_name || '',
      sku: item.sku || '',
      quantity: asNumber(item.quantity, 0),
      unitPriceJmd: asNumber(item.unit_price_jmd, 0),
      lineTotalJmd: asNumber(item.line_total_jmd, 0)
    });
    return map;
  }, {});

  const portalOrders = orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    statusLabel: orderStatusLabel(order),
    deliveryMethod: order.delivery_method,
    deliveryService: order.delivery_service || '',
    deliveryAddress: order.shipping_address || '',
    parish: order.parish || '',
    city: order.city || '',
    country: order.country || '',
    subtotalJmd: asNumber(order.subtotal_jmd, 0),
    discountTotalJmd: asNumber(order.discount_total_jmd, 0),
    shippingTotalJmd: asNumber(order.shipping_total_jmd, 0),
    grandTotalJmd: asNumber(order.grand_total_jmd, 0),
    createdAt: order.created_at,
    pointsEarned: loyalty.earnedByOrder.get(order.id) || 0,
    items: itemMap[order.id] || []
  }));

  const paidOrders = orders.filter((order) => isEligiblePaidOrder(order, policy));
  const totalOrderSpend = orders.reduce((sum, order) => sum + Math.max(0, asNumber(order.grand_total_jmd, 0)), 0);

  return {
    profile: {
      fullName: (customer && customer.full_name) || user.user_metadata?.full_name || user.user_metadata?.name || '',
      email: user.email || '',
      phone: (customer && customer.phone) || user.user_metadata?.phone || '',
      whatsapp: (customer && customer.whatsapp) || '',
      joinedAt: (customer && customer.created_at) || user.created_at || ''
    },
    summary: {
      orderCount: portalOrders.length,
      paidOrderCount: paidOrders.length,
      totalOrderSpend,
      recentOrder: portalOrders[0] || null
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
      rewardsContactUrl: String(program.hero.primaryHref || 'https://wa.me/18763094374')
    },
    orders: portalOrders
  };
}

function registerCustomerPortalRoutes(app) {
  app.use(originalExpress.json());

  app.get('/api/customer-portal', async (req, res) => {
    try {
      const user = await getAuthenticatedCustomer(req);
      const payload = await getPortalPayload(user);
      return res.status(200).json(payload);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Unable to load your account.' });
    }
  });

  app.patch('/api/customer-portal/profile', async (req, res) => {
    try {
      const user = await getAuthenticatedCustomer(req);
      const requestedName = String(req.body?.fullName || '').trim().slice(0, 120);
      const requestedPhone = String(req.body?.phone || '').trim().slice(0, 40);
      const requestedWhatsapp = String(req.body?.whatsapp || '').trim().slice(0, 40);
      const fallbackName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Foryou Customer').slice(0, 120);
      const fullName = requestedName || fallbackName;

      let customer = await findCustomerByEmail(user.email);
      if (customer) {
        const { data, error } = await portalSupabase
          .from('customers')
          .update({ full_name: fullName, phone: requestedPhone || null, whatsapp: requestedWhatsapp || null, updated_at: new Date().toISOString() })
          .eq('id', customer.id)
          .select('id, full_name, email, phone, whatsapp, created_at')
          .single();
        if (error) throw error;
        customer = data;
      } else {
        const { data, error } = await portalSupabase
          .from('customers')
          .insert({ full_name: fullName, email: user.email, phone: requestedPhone || null, whatsapp: requestedWhatsapp || null })
          .select('id, full_name, email, phone, whatsapp, created_at')
          .single();
        if (error) throw error;
        customer = data;
      }

      await portalSupabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, full_name: customer.full_name, phone: customer.phone || '' }
      });

      return res.status(200).json({
        profile: {
          fullName: customer.full_name,
          email: user.email,
          phone: customer.phone || '',
          whatsapp: customer.whatsapp || '',
          joinedAt: customer.created_at || user.created_at
        }
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Unable to update your profile.' });
    }
  });
}

function wrappedExpress(...args) {
  const app = originalExpress(...args);
  registerCustomerPortalRoutes(app);
  return app;
}

Object.assign(wrappedExpress, originalExpress);
require.cache[expressModulePath].exports = wrappedExpress;
