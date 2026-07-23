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
app.set('trust proxy', 1);

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
const FYGARO_BUTTON_URL = process.env.FYGARO_BUTTON_URL || 'https://www.fygaro.com/en/pb/00c0f5ec-24aa-4069-97ce-9495f7798ab4/';
const SERVER_BASE_URL   = (process.env.SERVER_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const RESEND_API_KEY    = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL       = process.env.OWNER_EMAIL || 'clientemail@example.com';
const FROM_EMAIL        = process.env.FROM_EMAIL || 'For You Skin Bar <orders@orders.foryouskinbar.com>';

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
 * Builds an order-specific Fygaro payment URL. When API credentials are
 * configured, the amount and reference are protected by a signed JWT. Until
 * then, Fygaro's documented URL parameters keep checkout operational and the
 * webhook still verifies the paid amount before confirming an order.
 */
function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');
  return host ? `${protocol}://${host}`.replace(/\/+$/, '') : SERVER_BASE_URL;
}

function paymentCallbackUrls(origin, orderNumber) {
  const safeOrigin = String(origin || SERVER_BASE_URL).replace(/\/+$/, '');
  const token = orderAccessToken(orderNumber);
  const encodedRef = encodeURIComponent(orderNumber);
  const encodedToken = encodeURIComponent(token);
  return {
    returnUrl: `${safeOrigin}/api/fygaro-return?ref=${encodedRef}&token=${encodedToken}`,
    cancelUrl: `${safeOrigin}/checkout.html?status=cancelled&ref=${encodedRef}`,
    webhookUrl: `${safeOrigin}/api/fygaro-webhook`
  };
}

function buildFygaroPaymentUrl(orderNumber, amountJmd) {
  const amount = Number(amountJmd);
  if (!FYGARO_BUTTON_URL || !orderNumber || !Number.isFinite(amount) || amount <= 0) return null;
  if (!FYGARO_API_SECRET) {
    console.error('[Fygaro] Checkout blocked because FYGARO_API_SECRET is not configured.');
    return null;
  }

  try {
    const paymentUrl = new URL(FYGARO_BUTTON_URL);
    if (FYGARO_API_KEY && FYGARO_API_SECRET) {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = jwt.sign({
        amount: amount.toFixed(2),
        currency: 'JMD',
        custom_reference: orderNumber,
        exp: nowSec + 3600,
        nbf: nowSec
      }, FYGARO_API_SECRET, {
        algorithm: 'HS256',
        header: { alg: 'HS256', typ: 'JWT', kid: FYGARO_API_KEY },
      });
      paymentUrl.searchParams.set('jwt', token);
      return { url: paymentUrl.toString(), mode: 'signed_jwt' };
    }

    paymentUrl.searchParams.set('amount', amount.toFixed(2));
    paymentUrl.searchParams.set('client_reference', orderNumber);
    paymentUrl.searchParams.set('client_note', `For You Skin Bar order ${orderNumber}`);
    return { url: paymentUrl.toString(), mode: 'payment_link' };
  } catch (error) {
    console.error('[Fygaro] Invalid payment button URL:', error.message);
    return null;
  }
}

function jamaicaDateStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}${parts.month}${parts.day}`;
}

/**
 * Verifies the Fygaro-Signature header on incoming webhook calls.
 */
function verifyFygaroSignature(rawBody, signatureHeader, keyIdHeader) {
  if (!FYGARO_API_SECRET || !signatureHeader) return false;
  const keyId = String(keyIdHeader || '').trim();
  if (FYGARO_API_KEY && keyId !== FYGARO_API_KEY) return false;

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function deliverEmailLog(logId, message) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: message.recipient,
        subject: message.subject,
        html: message.html
      })
    });
    const responseBody = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
    await supabaseAdmin.from('email_logs').update({
      status: response.ok ? 'sent' : 'error',
      resend_email_id: responseBody?.id || null,
      error_message: response.ok ? null : JSON.stringify(responseBody),
      updated_at: new Date().toISOString()
    }).eq('id', logId);
    return { sent: response.ok, error: response.ok ? null : responseBody };
  } catch (error) {
    await supabaseAdmin.from('email_logs').update({
      status: 'error',
      error_message: error.message || String(error),
      updated_at: new Date().toISOString()
    }).eq('id', logId);
    return { sent: false, error: error.message || String(error) };
  }
}

async function queueEmail({ orderId = null, recipient, emailType, subject, html, metadata = {}, scheduledFor = null }) {
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  if (!isValidEmail(normalizedRecipient)) return { queued: false, sent: false, error: 'Invalid recipient' };

  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
  const isScheduled = scheduledDate && Number.isFinite(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now();
  const initialStatus = isScheduled ? 'scheduled' : (RESEND_API_KEY ? 'queued' : 'pending_resend_setup');
  const { data: log, error: logError } = await supabaseAdmin.from('email_logs').insert({
    order_id: orderId,
    recipient: normalizedRecipient,
    email_type: emailType,
    subject,
    html_body: html,
    metadata,
    scheduled_for: isScheduled ? scheduledDate.toISOString() : null,
    status: initialStatus,
    error_message: RESEND_API_KEY ? null : 'RESEND_API_KEY missing'
  }).select('id').single();

  if (logError) {
    console.error('[Email Outbox] Could not queue email:', logError.message);
    return { queued: false, sent: false, error: logError.message };
  }
  if (isScheduled) return { queued: true, sent: false, scheduled: true };
  if (!RESEND_API_KEY) return { queued: true, sent: false, pendingSetup: true };

  const result = await deliverEmailLog(log.id, { recipient: normalizedRecipient, subject, html });
  return { queued: true, ...result };
}

async function processPendingEmails(limit = 50) {
  if (!RESEND_API_KEY) return;
  const { data: pending, error } = await supabaseAdmin
    .from('email_logs')
    .select('id,recipient,subject,html_body')
    .in('status', ['pending_resend_setup', 'scheduled'])
    .not('subject', 'is', null)
    .not('html_body', 'is', null)
    .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[Email Outbox] Could not load pending messages:', error.message);
    return;
  }
  for (const message of pending || []) {
    await supabaseAdmin.from('email_logs').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('id', message.id);
    await deliverEmailLog(message.id, {
      recipient: message.recipient,
      subject: message.subject,
      html: message.html_body
    });
  }
}

async function materializePaidCheckoutSession(session) {
  const shipping = session.shipping_data || {};
  const cart = Array.isArray(session.cart_data) ? session.cart_data : [];
  if (!cart.length) throw new Error('Paid checkout session has no items.');

  const { data: order, error: orderError } = await supabaseAdmin.from('orders').insert({
    order_number: session.checkout_reference,
    customer_id: session.customer_id,
    country: shipping.country,
    address_line_1: shipping.addressLine1,
    address_line_2: shipping.addressLine2,
    city: shipping.city,
    parish: shipping.parish,
    state_province: shipping.stateProvince,
    postal_code: shipping.postalCode,
    shipping_address: shipping.formattedAddress,
    delivery_method: shipping.deliveryMethod,
    delivery_service: shipping.deliveryService,
    customer_notes: shipping.notes,
    subtotal_jmd: session.subtotal_jmd,
    discount_code: session.discount_code,
    discount_total_jmd: session.discount_total_jmd,
    shipping_total_jmd: session.shipping_total_jmd,
    grand_total_jmd: session.grand_total_jmd,
    points_earned: session.points_earned,
    payment_method: 'Fygaro',
    status: 'pending',
    payment_status: 'awaiting_confirmation',
    fulfillment_status: 'unfulfilled'
  }).select('id,order_number,status,payment_status,grand_total_jmd,customer_id,delivery_service,admin_notes').single();
  if (orderError) throw orderError;

  const orderItems = cart.map((item) => ({
    order_id: order.id,
    product_id: item.productId,
    variant_id: item.variantId || null,
    variant_name: item.variantName || null,
    product_name: item.name,
    unit_price_jmd: item.price,
    quantity: item.quantity,
    line_total_jmd: item.price * item.quantity
  }));
  const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
  if (itemsError) {
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    throw itemsError;
  }

  if (session.discount_code) {
    const { data: discount } = await supabaseAdmin
      .from('discount_codes')
      .select('id,used_count')
      .eq('code', session.discount_code)
      .maybeSingle();
    if (discount) {
      await supabaseAdmin.from('discount_codes')
        .update({ used_count: (Number(discount.used_count) || 0) + 1 })
        .eq('id', discount.id);
    }
  }

  return order;
}

async function reconcileCheckoutSessionPayment(orderRef, paymentReference, source = 'admin') {
  const { data: reusedPayment, error: reusedPaymentError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .select('checkout_reference')
    .eq('fygaro_transaction_id', paymentReference)
    .neq('checkout_reference', orderRef)
    .maybeSingle();
  if (reusedPaymentError) throw reusedPaymentError;
  if (reusedPayment) {
    const error = new Error(`This Fygaro reference is already linked to ${reusedPayment.checkout_reference}.`);
    error.status = 409;
    throw error;
  }

  const { data: checkoutSession, error: sessionError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .select('*')
    .eq('checkout_reference', orderRef)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!checkoutSession) {
    const error = new Error('Saved checkout session was not found.');
    error.status = 404;
    throw error;
  }

  const { data: existingOrder, error: orderFetchError } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,payment_status,grand_total_jmd,customer_id,delivery_service,admin_notes')
    .eq('order_number', orderRef)
    .maybeSingle();
  if (orderFetchError) throw orderFetchError;

  let order = existingOrder;
  if (!order) order = await materializePaidCheckoutSession(checkoutSession);

  if (order.payment_status !== 'paid') {
    const paymentNote = [
      `[Fygaro Payment Confirmed - ${source === 'webhook' ? 'Webhook' : 'Admin Reconciliation'}]`,
      `Reference: ${paymentReference}`,
      `Recorded: ${new Date().toISOString()}`
    ].join(' ');
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'Fygaro',
        status: order.status === 'pending' ? 'confirmed' : order.status,
        admin_notes: order.admin_notes ? `${paymentNote}\n\n${order.admin_notes}` : paymentNote,
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)
      .select('id,order_number,status,payment_status,grand_total_jmd,customer_id,delivery_service,admin_notes')
      .single();
    if (updateError) throw updateError;
    order = updatedOrder;
  }

  const { error: checkoutUpdateError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .update({
      status: 'paid',
      order_id: order.id,
      fygaro_transaction_id: paymentReference,
      updated_at: new Date().toISOString()
    })
    .eq('id', checkoutSession.id);
  if (checkoutUpdateError) throw checkoutUpdateError;

  return order;
}

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Admin authentication is required.');
    error.status = 401;
    throw error;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    const error = new Error('Invalid admin session.');
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !['owner', 'admin', 'staff'].includes(profile.role)) {
    const error = new Error('Admin privileges are required.');
    error.status = 403;
    throw error;
  }

  return userData.user;
}

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

app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const source = String(req.body?.source || 'website').trim().slice(0, 80);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const { data: existingSubscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email,is_active')
      .eq('email', email)
      .maybeSingle();

    const { error } = await supabaseAdmin.from('newsletter_subscribers').upsert({
      email,
      source,
      is_active: true
    }, { onConflict: 'email' });
    if (error) throw error;

    if (existingSubscriber?.is_active) {
      return res.status(200).json({ success: true, email_status: 'already_subscribed' });
    }

    const welcomeHtml = `
      <p>Welcome to Glow Letters.</p>
      <p>You are now subscribed to skincare guidance, product updates, new articles, and occasional offers from For You Skin Bar.</p>
      <p>Thank you for joining us.</p>
      <hr>
      <p style="font-size:12px;color:#666;">To unsubscribe, reply to this email with "unsubscribe".</p>
    `;
    const emailResult = await queueEmail({
      recipient: email,
      emailType: 'newsletter_welcome',
      subject: 'Welcome to Glow Letters',
      html: welcomeHtml,
      metadata: { source }
    });

    return res.status(201).json({
      success: true,
      email_status: emailResult.sent ? 'sent' : (emailResult.queued ? 'queued' : 'not_queued')
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/newsletter/send', async (req, res) => {
  try {
    await requireAdmin(req);
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    if (!subject) throw new Error('Subject is required.');
    if (!message) throw new Error('Message is required.');

    const { data: subscribers, error: subscribersError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (subscribersError) throw subscribersError;

    const uniqueEmails = [...new Set((subscribers || [])
      .map((row) => String(row.email || '').trim().toLowerCase())
      .filter(isValidEmail))];
    if (uniqueEmails.length === 0) {
      return res.status(200).json({ success: true, sent: 0, queued: 0, failed: 0, message: 'No active subscribers found.' });
    }

    const htmlMessage = escapeHtml(message)
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
    const html = `${htmlMessage}<hr><p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters from For You Skin Bar. To unsubscribe, reply to this email with "unsubscribe".</p>`;

    let sent = 0;
    let queued = 0;
    const failures = [];
    for (const email of uniqueEmails) {
      const result = await queueEmail({ recipient: email, emailType: 'newsletter_broadcast', subject, html });
      if (result.sent) sent += 1;
      else if (result.queued) queued += 1;
      else failures.push({ email, error: result.error });
    }

    return res.status(failures.length ? 207 : (RESEND_API_KEY ? 200 : 202)).json({
      success: failures.length === 0,
      sent,
      queued,
      failed: failures.length,
      resend_configured: !!RESEND_API_KEY,
      failures: failures.slice(0, 10)
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/blogs/:postId/notify-subscribers', async (req, res) => {
  try {
    await requireAdmin(req);
    const { data: post, error: postError } = await supabaseAdmin
      .from('blog_posts')
      .select('id,title,slug,excerpt,status,published_at,newsletter_notified_at')
      .eq('id', req.params.postId)
      .maybeSingle();
    if (postError || !post) return res.status(404).json({ error: 'Blog post not found.' });
    if (post.status !== 'published') return res.status(400).json({ error: 'Only published posts can notify subscribers.' });
    if (post.newsletter_notified_at) {
      return res.status(200).json({ success: true, already_notified: true, sent: 0, queued: 0 });
    }
    const publishTime = post.published_at ? new Date(post.published_at) : null;
    const scheduledFor = publishTime && publishTime.getTime() > Date.now() ? publishTime.toISOString() : null;

    const { data: subscribers, error: subscribersError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email')
      .eq('is_active', true);
    if (subscribersError) throw subscribersError;

    const emails = [...new Set((subscribers || []).map((row) => String(row.email || '').trim().toLowerCase()).filter(isValidEmail))];
    const articleUrl = `${SERVER_BASE_URL}/blog-post.html?slug=${encodeURIComponent(post.slug)}`;
    const html = `
      <p>A new article is now available from For You Skin Bar.</p>
      <h2>${escapeHtml(post.title)}</h2>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
      <p><a href="${escapeHtml(articleUrl)}">Read the article</a></p>
      <hr>
      <p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters. To unsubscribe, reply with "unsubscribe".</p>
    `;
    let sent = 0;
    let queued = 0;
    const failures = [];
    for (const email of emails) {
      const result = await queueEmail({
        recipient: email,
        emailType: 'blog_published',
        subject: `New from For You Skin Bar: ${post.title}`,
        html,
        metadata: { post_id: post.id, slug: post.slug },
        scheduledFor
      });
      if (result.sent) sent += 1;
      else if (result.queued) queued += 1;
      else failures.push({ email, error: result.error });
    }
    if (failures.length === 0) {
      await supabaseAdmin.from('blog_posts').update({ newsletter_notified_at: new Date().toISOString() }).eq('id', post.id);
    }
    return res.status(failures.length ? 207 : (RESEND_API_KEY ? 200 : 202)).json({
      success: failures.length === 0,
      sent,
      queued,
      failed: failures.length,
      resend_configured: !!RESEND_API_KEY,
      scheduled_for: scheduledFor
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/create-order', async (req, res) => {
  try {
    const payload = req.body;
    const { customer, shipping, cart, discountCode, termsAccepted, newsletterOptIn } = payload;

    if (!customer || !shipping || !cart || cart.length === 0) {
      throw new Error('Invalid order payload');
    }
    if (termsAccepted !== true) {
      throw new Error('You must read and accept the Terms and Conditions before placing an order.');
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

    const dateStr = jamaicaDateStamp();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `FSB-${dateStr}-${randomNum}`;
    const checkoutOrigin = requestOrigin(req);
    const fygaroPayment = buildFygaroPaymentUrl(orderNumber, total);
    if (!fygaroPayment) {
      const error = new Error('Secure payment is temporarily unavailable. No order was created. Please try again shortly.');
      error.status = 503;
      throw error;
    }

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

    const { error: checkoutSessionError } = await supabaseAdmin
      .from('payment_checkout_sessions')
      .insert({
        checkout_reference: orderNumber,
        customer_id: customerId,
        customer_data: customer,
        shipping_data: {
          ...shipping,
          formattedAddress,
          deliveryMethod,
          deliveryService,
          shippingStatus
        },
        cart_data: validatedCart,
        subtotal_jmd: subtotal,
        discount_code: appliedDiscountCode,
        discount_total_jmd: discountAmount,
        shipping_total_jmd: shippingCost,
        grand_total_jmd: total,
        points_earned: pointsEarned,
        status: 'pending'
      });
    if (checkoutSessionError) throw checkoutSessionError;

    // There is deliberately no orders row until Fygaro confirms payment.
    const orderId = null;

    if (newsletterOptIn && customer.email) {
      const normalizedEmail = String(customer.email).trim().toLowerCase();
      const { data: existingSubscriber } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('email,is_active')
        .eq('email', normalizedEmail)
        .maybeSingle();
      const { error: newsletterError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .upsert({
          email: normalizedEmail,
          source: 'checkout',
          is_active: true
        }, { onConflict: 'email' });
      if (newsletterError) {
        console.warn('[Newsletter] Checkout opt-in could not be saved:', newsletterError.message);
      } else if (!existingSubscriber?.is_active) {
        await queueEmail({
          recipient: normalizedEmail,
          emailType: 'newsletter_welcome',
          subject: 'Welcome to Glow Letters',
          html: '<p>Welcome to Glow Letters.</p><p>You are now subscribed to skincare guidance, product updates, new articles, and occasional offers from For You Skin Bar.</p><p>Thank you for joining us.</p>'
        });
      }
    }

    // Resend Email Logic
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL = process.env.OWNER_EMAIL || 'clientemail@example.com';
    const FROM_EMAIL = process.env.FROM_EMAIL || 'For You Skin Bar <orders@orders.foryouskinbar.com>';

    if (RESEND_API_KEY) {
      const itemsListText = validatedCart.map((item, idx) => `${idx + 1}. ${item.name} × ${item.quantity} — J$${(item.price * item.quantity).toLocaleString()}`).join('\n');

      const customerHtml = `
        <p>Hi ${customer.fullName},</p>
        <p>Your checkout details have been saved with For You Skin Bar.</p>
        <p><strong>Your order is not confirmed until payment is completed through Fygaro.</strong></p>
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
        <p>This is a payment-pending notice, not an order confirmation or tax invoice. Card payment is completed securely through Fygaro.</p>
        <p>Thank you for shopping with us.</p>
      `;

      const ownerHtml = `
        <p>A customer started Fygaro checkout. Do not fulfil this order until its payment status changes to Paid.</p>
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
            subject: `Complete payment for For You Skin Bar order ${orderNumber}`,
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
            subject: `Payment pending - ${orderNumber}`,
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
      const pendingItemsHtml = validatedCart.map((item, index) =>
        `${index + 1}. ${escapeHtml(item.name)} x ${escapeHtml(item.quantity)} - J$${(item.price * item.quantity).toLocaleString()}`
      ).join('<br>');
      await queueEmail({
        orderId,
        recipient: customer.email,
        emailType: 'payment_pending',
        subject: `Complete payment for For You Skin Bar order ${orderNumber}`,
        html: `<p>Hi ${escapeHtml(customer.fullName)},</p><p>Your checkout details have been saved for <strong>${escapeHtml(orderNumber)}</strong>.</p><p><strong>Your order is not confirmed until payment is completed through Fygaro.</strong></p><p>${pendingItemsHtml}</p><p>Total due: J$${total.toLocaleString()}</p>`,
        metadata: { order_number: orderNumber }
      });
      await queueEmail({
        orderId,
        recipient: OWNER_EMAIL,
        emailType: 'owner_payment_pending',
        subject: `Payment pending - ${orderNumber}`,
        html: `<p>A customer started Fygaro checkout for <strong>${escapeHtml(orderNumber)}</strong>.</p><p>Amount awaiting payment: J$${total.toLocaleString()}</p><p>Do not fulfil this order until its payment status changes to Paid.</p>`,
        metadata: { order_number: orderNumber }
      });
    }

    // ── Build Fygaro Payment URL ──
    res.status(201).json({
      success: true, 
      order_number: orderNumber,
      grand_total: total,
      shipping_status: shippingStatus,
      email_status: RESEND_API_KEY ? 'processed' : 'queued',
      fygaro_url: fygaroPayment.url,
      fygaro_mode: fygaroPayment.mode,
      payment_access_token: orderAccessToken(orderNumber),
      payment_return_url: paymentCallbackUrls(checkoutOrigin, orderNumber).returnUrl
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// ── Payment confirmation routes ──
app.post('/api/admin/payment-checkouts/:reference/confirm', async (req, res) => {
  try {
    await requireAdmin(req);
    const orderRef = String(req.params.reference || '').trim();
    const paymentReference = String(req.body?.paymentReference || '').trim();
    if (!/^FSB-\d{8}-\d{4}$/.test(orderRef)) {
      return res.status(400).json({ error: 'A valid checkout reference is required.' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{4,159}$/.test(paymentReference)) {
      return res.status(400).json({ error: 'Enter the Fygaro payment or transaction reference.' });
    }

    const order = await reconcileCheckoutSessionPayment(orderRef, paymentReference, 'admin');
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('full_name,email')
      .eq('id', order.customer_id)
      .maybeSingle();

    if (customer?.email) {
      await queueEmail({
        orderId: order.id,
        recipient: customer.email,
        emailType: 'payment_confirmed',
        subject: `Payment confirmed - For You Skin Bar order ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(customer.full_name)},</p><p>Your Fygaro payment for <strong>${escapeHtml(order.order_number)}</strong> has been confirmed.</p><p>We are now preparing your order and will send a fulfilment update when it is ready.</p>`,
        metadata: { order_number: order.order_number, payment_reference: paymentReference, source: 'admin_reconciliation' }
      });
    }

    await queueEmail({
      orderId: order.id,
      recipient: OWNER_EMAIL,
      emailType: 'owner_payment_confirmed',
      subject: `Payment reconciled - ${order.order_number}`,
      html: `<p>Fygaro payment <strong>${escapeHtml(paymentReference)}</strong> was matched to <strong>${escapeHtml(order.order_number)}</strong>.</p><p>Amount: J$${Number(order.grand_total_jmd).toLocaleString()}</p>`,
      metadata: { order_number: order.order_number, payment_reference: paymentReference, source: 'admin_reconciliation' }
    });

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('[Payment Reconciliation]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to reconcile this payment.' });
  }
});

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

    // Paid orders are created from the saved checkout session only after this
    // signed webhook passes reference, currency, and amount validation.
    const { data: existingOrder, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, payment_status, grand_total_jmd, customer_id, delivery_service, admin_notes')
      .eq('order_number', orderRef)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    let order = existingOrder;
    let checkoutSession = null;

    if (!order) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('payment_checkout_sessions')
        .select('*')
        .eq('checkout_reference', orderRef)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) {
        console.error('[Fygaro Webhook] Checkout reference not found:', orderRef);
        return res.status(404).json({ error: 'Checkout reference not found' });
      }
      checkoutSession = session;
    }

    // Idempotency — skip if already marked paid
    if (order?.payment_status === 'paid') {
      console.log('[Fygaro Webhook] Already paid, skipping:', orderRef);
      return res.status(200).json({ received: true, action: 'already_paid' });
    }

    if (currency !== 'JMD') {
      console.error('[Fygaro Webhook] Currency mismatch:', currency, orderRef);
      return res.status(400).json({ error: 'Currency mismatch' });
    }

    const expectedTotal = Number(order?.grand_total_jmd ?? checkoutSession?.grand_total_jmd ?? 0);
    if (amountPaid === null) {
      console.error('[Fygaro Webhook] Payment amount missing:', orderRef);
      return res.status(400).json({ error: 'Payment amount is required' });
    }
    if (amountPaid + 1 < expectedTotal) {
      console.error('[Fygaro Webhook] Amount mismatch:', { orderRef, expectedTotal, amountPaid });
      return res.status(400).json({ error: 'Payment amount does not match order total' });
    }

    if (!order) {
      order = await materializePaidCheckoutSession(checkoutSession);
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

    await supabaseAdmin.from('payment_checkout_sessions').update({
      status: 'paid',
      order_id: order.id,
      fygaro_transaction_id: paymentRef,
      updated_at: new Date().toISOString()
    }).eq('checkout_reference', orderRef);

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
    } else if (customer?.email) {
      const pendingItemsHtml = (items || []).map((item, index) =>
        `${index + 1}. ${escapeHtml(item.product_name)} x ${escapeHtml(item.quantity)} - J$${Number(item.line_total_jmd).toLocaleString()}`
      ).join('<br>');
      await queueEmail({
        orderId: order.id,
        recipient: customer.email,
        emailType: 'payment_confirmed',
        subject: `Payment confirmed - For You Skin Bar order ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(customer.full_name)},</p><p>Your Fygaro payment for <strong>${escapeHtml(order.order_number)}</strong> has been confirmed.</p><p>${pendingItemsHtml}</p><p>Amount paid: J$${Number(order.grand_total_jmd).toLocaleString()}</p><p>We are now preparing your order.</p>`,
        metadata: { order_number: order.order_number }
      });
      await queueEmail({
        orderId: order.id,
        recipient: OWNER_EMAIL,
        emailType: 'owner_payment_confirmed',
        subject: `Payment received - ${order.order_number}`,
        html: `<p>Payment was confirmed for <strong>${escapeHtml(order.order_number)}</strong>.</p><p>Amount: J$${Number(order.grand_total_jmd).toLocaleString()}</p><p>Please prepare this order for fulfilment.</p>`,
        metadata: { order_number: order.order_number }
      });
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

    if (orderError) throw orderError;
    if (!order) {
      const { data: checkoutSession, error: sessionError } = await supabaseAdmin
        .from('payment_checkout_sessions')
        .select('checkout_reference,status,shipping_data,cart_data,subtotal_jmd,discount_total_jmd,shipping_total_jmd,grand_total_jmd')
        .eq('checkout_reference', ref)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!checkoutSession) return res.status(404).json({ error: 'Checkout reference not found.' });
      const shipping = checkoutSession.shipping_data || {};
      const items = (Array.isArray(checkoutSession.cart_data) ? checkoutSession.cart_data : []).map((item) => ({
        product_name: item.name,
        quantity: item.quantity,
        unit_price_jmd: item.price,
        line_total_jmd: item.price * item.quantity
      }));
      return res.status(200).json({
        order: {
          order_number: checkoutSession.checkout_reference,
          status: 'pending',
          payment_status: 'awaiting_confirmation',
          delivery_service: shipping.deliveryService,
          shipping_address: shipping.formattedAddress,
          subtotal_jmd: checkoutSession.subtotal_jmd,
          discount_total_jmd: checkoutSession.discount_total_jmd,
          shipping_total_jmd: checkoutSession.shipping_total_jmd,
          grand_total_jmd: checkoutSession.grand_total_jmd
        },
        items
      });
    }

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
    } else if (customerEmail) {
      await queueEmail({
        orderId: order.id,
        recipient: customerEmail,
        emailType: 'order_cancelled',
        subject: `Order cancellation received - ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(order.customers?.full_name || 'Valued Customer')},</p><p>Your request to cancel <strong>${escapeHtml(order.order_number)}</strong> has been received.</p>${order.payment_status === 'paid' ? '<p>Our team will review the payment and process the refund manually.</p>' : ''}`,
        metadata: { order_number: order.order_number }
      });
      await queueEmail({
        orderId: order.id,
        recipient: OWNER_EMAIL,
        emailType: 'owner_order_cancelled',
        subject: `Order cancelled by customer - ${order.order_number}`,
        html: `<p>Order <strong>${escapeHtml(order.order_number)}</strong> was cancelled by the customer.</p><p>Reason: ${escapeHtml(reason || 'No reason provided')}</p><p>Payment status: ${escapeHtml(order.payment_status)}</p>`,
        metadata: { order_number: order.order_number }
      });
    }

    return res.status(200).json({ success: true, orderNumber });

  } catch (err) {
    console.error('[Cancel Order] API Error:', err);
    return res.status(500).json({ error: 'Failed to request order cancellation. Please try again.' });
  }
});


// ── Static Files serving ──
// Serve all files from current directory
// Fygaro redirects successful payments here. This must be registered before
// the static-site fallback or the customer will be sent to the home page.
app.get('/api/fygaro-return', (req, res) => {
  const suppliedOrderRef = String(
    req.query.customReference ||
    req.query.custom_reference ||
    req.query.client_reference ||
    req.query.ref ||
    ''
  ).trim();
  const orderRef = /^FSB-\d{8}-\d{4}$/.test(suppliedOrderRef) ? suppliedOrderRef : '';
  const paymentReference = String(req.query.reference || req.query.transactionId || '').trim().slice(0, 160);
  const destination = new URLSearchParams();

  if (orderRef) {
    destination.set('ref', orderRef);
    destination.set('token', orderAccessToken(orderRef));
  }
  if (paymentReference) destination.set('reference', paymentReference);

  const query = destination.toString();
  return res.redirect(303, `/payment-success.html${query ? `?${query}` : ''}`);
});

app.get('/api/fygaro-integration-info', (req, res) => {
  const origin = requestOrigin(req);
  return res.status(200).json({
    configured: Boolean(FYGARO_API_KEY && FYGARO_API_SECRET && FYGARO_BUTTON_URL),
    return_url: `${origin}/api/fygaro-return`,
    webhook_url: `${origin}/api/fygaro-webhook`
  });
});

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Fallback to index.html for SPA-like behavior (optional, if using client side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (RESEND_API_KEY) {
    setTimeout(() => processPendingEmails().catch((error) => {
      console.error('[Email Outbox] Startup processing failed:', error.message);
    }), 1500);
    const emailOutboxTimer = setInterval(() => processPendingEmails().catch((error) => {
      console.error('[Email Outbox] Scheduled processing failed:', error.message);
    }), 5 * 60 * 1000);
    emailOutboxTimer.unref();
  } else {
    console.log('[Email Outbox] Resend is prewired but inactive. Add RESEND_API_KEY, FROM_EMAIL, and OWNER_EMAIL to enable delivery.');
  }
});
