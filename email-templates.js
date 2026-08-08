const COMMON_VARIABLES = [
  { key: 'recipient_email', label: 'Recipient email', description: 'Email address receiving the message.' },
  { key: 'site_url', label: 'Website URL', description: 'Link to the website home page.' },
  { key: 'shop_url', label: 'Shop URL', description: 'Link to the online shop.' },
  { key: 'contact_url', label: 'Contact URL', description: 'Link to the contact page.' },
  { key: 'policy_url', label: 'Store policies URL', description: 'Link to the current store policies.' },
  { key: 'current_year', label: 'Current year', description: 'The current four-digit year.' }
];

const EMAIL_TEMPLATE_DEFINITIONS = Object.freeze({
  newsletter_welcome: {
    name: 'Glow Letters welcome',
    category: 'Marketing',
    audience: 'Customer',
    description: 'Sent once when a customer subscribes to the newsletter.',
    defaultSubject: 'Welcome to Glow Letters',
    defaultBody: `
      <p>Welcome to Glow Letters.</p>
      <p>You are now subscribed to skincare guidance, product updates, new articles, and occasional offers from Foryou Skin Bar.</p>
      <p>Thank you for joining us.</p>
      <hr>
      <p style="font-size:12px;color:#666;">To unsubscribe, reply to this email with "unsubscribe".</p>
    `,
    variables: [
      { key: 'signup_source', label: 'Signup source', description: 'Where the customer subscribed, such as website or checkout.' }
    ],
    sampleVariables: { signup_source: 'website' }
  },
  newsletter_broadcast: {
    name: 'Newsletter broadcast',
    category: 'Marketing',
    audience: 'Subscribers',
    description: 'Wraps newsletters composed in Journal & Content before they are sent to all active subscribers.',
    defaultSubject: '{{broadcast_subject}}',
    defaultBody: `
      {{{message_html}}}
      <hr>
      <p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters from Foryou Skin Bar. To unsubscribe, reply to this email with "unsubscribe".</p>
    `,
    variables: [
      { key: 'broadcast_subject', label: 'Campaign subject', description: 'Subject entered when the newsletter is composed.' },
      { key: 'message_html', label: 'Campaign message', description: 'Formatted newsletter message entered by the admin.', html: true }
    ],
    sampleVariables: {
      broadcast_subject: 'A little glow for your week',
      message_html: '<p>Here is this week\'s skincare note, created for healthy and confident skin.</p><p>Explore the latest routines and product updates from Foryou Skin Bar.</p>'
    }
  },
  blog_published: {
    name: 'New blog article',
    category: 'Marketing',
    audience: 'Subscribers',
    description: 'Sent to newsletter subscribers when a published blog post is announced.',
    defaultSubject: 'New from Foryou Skin Bar: {{post_title}}',
    defaultBody: `
      <p>A new article is now available from Foryou Skin Bar.</p>
      <h2>{{post_title}}</h2>
      <p>{{post_excerpt}}</p>
      <p><a href="{{article_url}}">Read the article</a></p>
      <hr>
      <p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters. To unsubscribe, reply with "unsubscribe".</p>
    `,
    variables: [
      { key: 'post_title', label: 'Article title', description: 'Published blog post title.' },
      { key: 'post_excerpt', label: 'Article excerpt', description: 'Short summary of the article.' },
      { key: 'article_url', label: 'Article URL', description: 'Direct link to the article.' }
    ],
    sampleVariables: {
      post_title: 'How to Build a Consistent Glow Routine',
      post_excerpt: 'Simple steps for choosing products that support your skin goals.',
      article_url: 'https://foryouskinbar.com/blog-post.html?slug=glow-routine'
    }
  },
  payment_pending: {
    name: 'Payment pending',
    category: 'Orders',
    audience: 'Customer',
    description: 'Sent after checkout details are saved and before Fygaro payment is confirmed.',
    defaultSubject: 'Complete payment for Foryou Skin Bar order {{order_number}}',
    defaultBody: `
      <p>Hi {{customer_name}},</p>
      <p>Your checkout is saved, but <strong>your order is not confirmed until Fygaro payment is complete.</strong></p>
      {{{payment_button}}}
      <p><strong>Reference:</strong> {{order_number}}<br><strong>Delivery:</strong> {{delivery_method}}<br><strong>Amount due:</strong> {{amount_due}}</p>
      {{{items_html}}}
      <p><strong>Ship to:</strong><br>{{shipping_address}}</p>
      <p>This is a payment reminder, not a paid-order receipt.</p>
    `,
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Name entered at checkout.' },
      { key: 'order_number', label: 'Order reference', description: 'Website checkout reference.' },
      { key: 'payment_url', label: 'Payment URL', description: 'Secure Fygaro payment link.' },
      { key: 'payment_button', label: 'Payment button', description: 'Ready-made secure payment button.', html: true },
      { key: 'amount_due', label: 'Amount due', description: 'Formatted payment amount and currency.' },
      { key: 'delivery_method', label: 'Delivery method', description: 'Selected delivery service.' },
      { key: 'shipping_address', label: 'Shipping address', description: 'Customer delivery address.' },
      { key: 'items_html', label: 'Order items', description: 'Formatted list of products and quantities.', html: true }
    ],
    sampleVariables: {
      customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042',
      payment_url: 'https://www.fygaro.com/',
      payment_button: '<p style="margin:24px 0;"><a href="https://www.fygaro.com/" style="display:inline-block;background:#344633;color:#fff;text-decoration:none;padding:13px 20px;font-weight:700;">Complete secure payment</a></p>',
      amount_due: 'J$4,500', delivery_method: 'Bearer - Kingston',
      shipping_address: '12 Hope Road, Kingston 6, Jamaica',
      items_html: '<div style="margin:20px 0;padding:12px 0;border-top:1px solid #eee5d6;border-bottom:1px solid #eee5d6;"><strong>1. Clear Skin Serum</strong><br>Qty 1 &middot; J$1,500<br><br><strong>2. Whipped Body Butter</strong><br>Qty 1 &middot; J$3,000</div>'
    }
  },
  owner_payment_pending: {
    name: 'New checkout awaiting payment',
    category: 'Orders',
    audience: 'Store owner',
    description: 'Alerts the store owner that a customer reached Fygaro but payment is not yet confirmed.',
    defaultSubject: 'Payment pending - {{order_number}}',
    defaultBody: `
      <p>A customer reached Fygaro checkout. <strong>Do not fulfil this checkout until payment is marked Paid.</strong></p>
      <p><strong>Customer:</strong> {{customer_name}}<br>{{customer_email}}<br>{{customer_phone}}</p>
      <p><strong>Amount awaiting payment:</strong> {{amount_due}}<br><strong>JMD accounting total:</strong> {{accounting_total}}<br><strong>Delivery:</strong> {{delivery_method}}</p>
      {{{items_html}}}
      <p><strong>Address:</strong><br>{{shipping_address}}</p>
      <p><strong>Notes:</strong> {{customer_notes}}</p>
    `,
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Name entered at checkout.' },
      { key: 'customer_email', label: 'Customer email', description: 'Customer contact email.' },
      { key: 'customer_phone', label: 'Customer phone', description: 'Customer contact number.' },
      { key: 'order_number', label: 'Order reference', description: 'Website checkout reference.' },
      { key: 'amount_due', label: 'Amount due', description: 'Amount awaiting payment.' },
      { key: 'accounting_total', label: 'JMD accounting total', description: 'Order total in Jamaican dollars.' },
      { key: 'delivery_method', label: 'Delivery method', description: 'Selected delivery service.' },
      { key: 'shipping_address', label: 'Shipping address', description: 'Customer delivery address.' },
      { key: 'customer_notes', label: 'Customer notes', description: 'Checkout notes or None.' },
      { key: 'items_html', label: 'Order items', description: 'Formatted product list.', html: true }
    ],
    sampleVariables: {
      customer_name: 'Danielle Brown', customer_email: 'danielle@example.com', customer_phone: '+1 876 555 0142',
      order_number: 'FSB-20260729-1042', amount_due: 'J$4,500', accounting_total: 'J$4,500',
      delivery_method: 'Bearer - Kingston', shipping_address: '12 Hope Road, Kingston 6, Jamaica', customer_notes: 'Call on arrival',
      items_html: '<div style="margin:20px 0;padding:12px 0;border-top:1px solid #eee5d6;border-bottom:1px solid #eee5d6;"><strong>Clear Skin Serum</strong> &middot; Qty 1<br><strong>Whipped Body Butter</strong> &middot; Qty 1</div>'
    }
  },
  payment_confirmed: {
    name: 'Order confirmation',
    category: 'Orders',
    audience: 'Customer',
    description: 'Sent to the customer as their order confirmation after Fygaro payment is successfully matched.',
    defaultSubject: 'Order confirmed - Foryou Skin Bar order {{order_number}}',
    defaultBody: `
      <p>Hi {{customer_name}},</p>
      <p>Your Fygaro payment for <strong>{{order_number}}</strong> is confirmed.</p>
      {{{items_html}}}
      <p><strong>Amount paid:</strong> {{amount_paid}}</p>
      <p>We are preparing your order now. You will receive another update when it is ready for pickup or dispatch.</p>
      {{{cancellation_action}}}
    `,
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Customer receiving the confirmation.' },
      { key: 'order_number', label: 'Order number', description: 'Confirmed order reference.' },
      { key: 'payment_reference', label: 'Payment reference', description: 'Fygaro transaction reference when available.' },
      { key: 'amount_paid', label: 'Amount paid', description: 'Formatted amount and currency.' },
      { key: 'items_html', label: 'Order items', description: 'Formatted list of paid items.', html: true },
      { key: 'cancellation_url', label: 'Cancellation request URL', description: 'Signed link for this order.' },
      { key: 'cancellation_action', label: 'Cancellation request box', description: 'Formatted secure cancellation-request link.', html: true }
    ],
    sampleVariables: {
      customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042', payment_reference: 'O-8KBSZY84EX8', amount_paid: 'J$4,500',
      items_html: '<div style="margin:20px 0;padding:12px 0;border-top:1px solid #eee5d6;border-bottom:1px solid #eee5d6;"><strong>Clear Skin Serum</strong><br>Qty 1<br><br><strong>Whipped Body Butter</strong><br>Qty 1</div>',
      cancellation_url: 'https://foryouskinbar.com/cancel-order.html?order=FSB-20260729-1042&token=sample',
      cancellation_action: '<div style="margin:22px 0;padding:16px;background:#f8f3e9;border-left:4px solid #c89b3c;"><strong>Need to change this order?</strong><p style="margin:8px 0 0;"><a href="#">Request a cancellation</a>. Requests are reviewed before an order is cancelled.</p></div>'
    }
  },
  owner_payment_confirmed: {
    name: 'Paid order notification',
    category: 'Orders',
    audience: 'Store owner',
    description: 'Notifies the store owner that payment is confirmed and fulfilment can begin.',
    defaultSubject: 'Payment received - {{order_number}}',
    defaultBody: `
      <p>Payment was confirmed for <strong>{{order_number}}</strong>.</p>
      <p><strong>Payment reference:</strong> {{payment_reference}}<br><strong>Amount:</strong> {{amount_paid}}<br><strong>JMD accounting total:</strong> {{accounting_total}}</p>
      <p>Please prepare this order for fulfilment.</p>
    `,
    variables: [
      { key: 'order_number', label: 'Order number', description: 'Paid order reference.' },
      { key: 'payment_reference', label: 'Payment reference', description: 'Fygaro transaction reference when available.' },
      { key: 'amount_paid', label: 'Amount paid', description: 'Formatted amount and currency.' },
      { key: 'accounting_total', label: 'JMD accounting total', description: 'Order total in Jamaican dollars.' }
    ],
    sampleVariables: { order_number: 'FSB-20260729-1042', payment_reference: 'O-8KBSZY84EX8', amount_paid: 'J$4,500', accounting_total: 'J$4,500' }
  },
  shipping_update: {
    name: 'Order shipped',
    category: 'Fulfilment',
    audience: 'Customer',
    description: 'Sent when an admin changes an order status to Shipped.',
    defaultSubject: 'Your Foryou Skin Bar order {{order_number}} is on the way',
    defaultBody: `
      <p>Hi {{customer_name}},</p>
      <p>Your order has been prepared and is now <strong>on the way</strong>.</p>
      <div style="margin:22px 0;padding:18px;border-left:4px solid #c89b3c;background:#f8f3e9;">
        <strong>Order:</strong> {{order_number}}<br>
        <strong>Delivery method:</strong> {{delivery_method}}<br>
        <strong>Delivery address:</strong> {{shipping_address}}
      </div>
      {{{tracking_details}}}
      {{{items_html}}}
      <p>Please keep your phone available in case the delivery provider needs to contact you. We will update the order record once delivery is complete.</p>
    `,
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Customer receiving the shipment.' },
      { key: 'order_number', label: 'Order number', description: 'Order being delivered.' },
      { key: 'delivery_method', label: 'Delivery method', description: 'Courier or collection method.' },
      { key: 'shipping_address', label: 'Shipping address', description: 'Delivery destination.' },
      { key: 'tracking_carrier', label: 'Tracking carrier', description: 'Courier responsible for the shipment.' },
      { key: 'tracking_number', label: 'Tracking number', description: 'Shipment reference entered on the order.' },
      { key: 'tracking_url', label: 'Tracking web address', description: 'Secure customer-facing tracking page.' },
      { key: 'tracking_details', label: 'Tracking box', description: 'Formatted carrier, tracking number, and track-shipment button. Empty until tracking is added.', html: true },
      { key: 'items_html', label: 'Order items', description: 'Formatted list of shipped items.', html: true }
    ],
    sampleVariables: {
      customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042', delivery_method: 'Bearer - Kingston', shipping_address: '12 Hope Road, Kingston 6, Jamaica',
      tracking_carrier: 'DHL', tracking_number: '1234567890', tracking_url: 'https://www.dhl.com/',
      tracking_details: '<div style="margin:22px 0;padding:18px;border:1px solid #dfc98f;background:#fffaf0;"><strong style="font-size:17px;">Shipment tracking</strong><p style="margin:10px 0 16px;"><strong>Carrier:</strong> DHL<br><strong>Tracking number:</strong> 1234567890<br><strong>Tracking web address:</strong> https://www.dhl.com/</p><a href="https://www.dhl.com/" style="display:inline-block;padding:11px 18px;background:#344633;color:#ffffff;text-decoration:none;font-weight:700;">Track your shipment</a></div>',
      items_html: '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;"><tr><td style="padding:10px 0;border-bottom:1px solid #eee5d6;">Clear Skin Serum</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eee5d6;">Qty 1</td></tr></table>'
    }
  },
  order_cancelled: {
    name: 'Cancellation request received',
    category: 'Orders',
    audience: 'Customer',
    description: 'Confirms that a cancellation request is waiting for store review.',
    defaultSubject: 'Cancellation request received - {{order_number}}',
    defaultBody: `
      <p>Hi {{customer_name}},</p>
      <p>We received your request to cancel <strong>{{order_number}}</strong>.</p>
      <p><strong>Your order has not been cancelled yet.</strong> Our team will review the request and email you with the decision.</p>
      <p><strong>Reason submitted:</strong> {{cancellation_reason}}</p>
      {{{refund_message}}}
      <p>Contact us immediately if you did not request this cancellation.</p>
    `,
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Customer who requested cancellation.' },
      { key: 'order_number', label: 'Order number', description: 'Cancelled order reference.' },
      { key: 'payment_status', label: 'Payment status', description: 'Payment state when cancellation occurred.' },
      { key: 'cancellation_reason', label: 'Cancellation reason', description: 'Reason supplied by the customer.' },
      { key: 'refund_message', label: 'Refund guidance', description: 'Payment-aware refund instructions.', html: true }
    ],
    sampleVariables: {
      customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042', payment_status: 'Paid', cancellation_reason: 'Ordered the wrong item',
      refund_message: '<p>If approved, a paid order will also require a separate refund review.</p>'
    }
  },
  owner_order_cancelled: {
    name: 'Cancellation request alert',
    category: 'Orders',
    audience: 'Store owner',
    description: 'Alerts the store owner that a cancellation request needs review.',
    defaultSubject: 'Cancellation review needed - {{order_number}}',
    defaultBody: `
      <p>A customer cancellation request needs review for <strong>{{order_number}}</strong>.</p>
      <p><strong>Customer:</strong> {{customer_name}} ({{customer_email}})<br><strong>Submitted from:</strong> {{request_source}}<br><strong>Reason:</strong> {{cancellation_reason}}<br><strong>Payment status:</strong> {{payment_status}}</p>
      {{{refund_action}}}
      <p><a href="{{admin_orders_url}}">Review this request in Admin Orders</a></p>
    `,
    variables: [
      { key: 'order_number', label: 'Order number', description: 'Cancelled order reference.' },
      { key: 'customer_name', label: 'Customer name', description: 'Customer who cancelled.' },
      { key: 'customer_email', label: 'Customer email', description: 'Customer contact email.' },
      { key: 'cancellation_reason', label: 'Cancellation reason', description: 'Reason supplied by the customer.' },
      { key: 'payment_status', label: 'Payment status', description: 'Payment state at cancellation.' },
      { key: 'request_source', label: 'Request source', description: 'Account or guest email link.' },
      { key: 'admin_orders_url', label: 'Admin orders URL', description: 'Link to the admin review queue.' },
      { key: 'refund_action', label: 'Refund action', description: 'Payment-aware action for the store owner.', html: true }
    ],
    sampleVariables: {
      order_number: 'FSB-20260729-1042', customer_name: 'Danielle Brown', customer_email: 'danielle@example.com',
      cancellation_reason: 'Ordered the wrong item', payment_status: 'Paid', request_source: 'Customer account', admin_orders_url: 'https://foryouskinbar.com/admin/orders.html',
      refund_action: '<p><strong>Action required:</strong> review and process the refund in Fygaro.</p>'
    }
  },
  cancellation_request_approved: {
    name: 'Cancellation approved', category: 'Orders', audience: 'Customer',
    description: 'Sent after an admin approves a cancellation request.',
    defaultSubject: 'Cancellation approved - {{order_number}}',
    defaultBody: '<p>Hi {{customer_name}},</p><p>Your request to cancel <strong>{{order_number}}</strong> was approved. The order is now cancelled.</p>{{{refund_message}}}<p><strong>Store note:</strong> {{admin_note}}</p><p>Please contact us if you need any further help.</p>',
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Customer receiving the decision.' },
      { key: 'order_number', label: 'Order number', description: 'Cancelled order reference.' },
      { key: 'admin_note', label: 'Store note', description: 'Explanation entered by the reviewing admin.' },
      { key: 'refund_message', label: 'Refund guidance', description: 'Payment-aware refund guidance.', html: true }
    ],
    sampleVariables: { customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042', admin_note: 'Your request has been approved.', refund_message: '<p>We will contact you separately once the Fygaro refund is processed.</p>' }
  },
  cancellation_request_declined: {
    name: 'Cancellation not approved', category: 'Orders', audience: 'Customer',
    description: 'Sent after an admin declines a cancellation request.',
    defaultSubject: 'Update on your cancellation request - {{order_number}}',
    defaultBody: '<p>Hi {{customer_name}},</p><p>We reviewed your request to cancel <strong>{{order_number}}</strong>, but the cancellation could not be approved.</p><p><strong>Store note:</strong> {{admin_note}}</p><p>Your order remains active. Please contact us if you need help.</p>',
    variables: [
      { key: 'customer_name', label: 'Customer name', description: 'Customer receiving the decision.' },
      { key: 'order_number', label: 'Order number', description: 'Order reference.' },
      { key: 'admin_note', label: 'Store note', description: 'Explanation entered by the reviewing admin.' }
    ],
    sampleVariables: { customer_name: 'Danielle Brown', order_number: 'FSB-20260729-1042', admin_note: 'The parcel has already been collected by the courier.' }
  }
});

function escapeTemplateValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailTemplate(source, variables = {}) {
  return String(source || '')
    .replace(/<p>\s*({{{\s*[a-zA-Z0-9_]+\s*}}})\s*<\/p>/gi, '$1')
    .replace(/{{{\s*([a-zA-Z0-9_]+)\s*}}}/g, (_, key) => String(variables[key] ?? ''))
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => escapeTemplateValue(variables[key] ?? ''));
}

function renderEmailSubject(source, variables = {}) {
  return renderEmailTemplate(source, variables)
    .replace(/<[^>]+>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function templateVariablesFor(definition) {
  return [...(definition.variables || []), ...COMMON_VARIABLES];
}

module.exports = {
  COMMON_VARIABLES,
  EMAIL_TEMPLATE_DEFINITIONS,
  renderEmailTemplate,
  renderEmailSubject,
  templateVariablesFor
};
