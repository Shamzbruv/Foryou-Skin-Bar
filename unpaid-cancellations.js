// Admin cancellation keeps the sale and audit trail; the database serializes changes.
function registerUnpaidCancellations(app, { db, requireAdmin, queueEmail, escapeHtml }) {
  async function cancel(req, res) {
    try {
      const admin = await requireAdmin(req);
      const kind = req.params.kind;
      const reference = String(req.params.reference || '').trim();
      const reason = String(req.body?.reason || '').trim();
      if (!['order', 'checkout'].includes(kind) || !reference || reason.length < 3 || reason.length > 500) {
        return res.status(400).json({ error: 'Choose an unpaid entry and enter a reason (3–500 characters).' });
      }
      const { data, error } = await db.rpc('admin_cancel_unpaid_sale', {
        p_kind: kind, p_reference: reference, p_reason: reason, p_admin_id: admin.id
      });
      if (error?.code === 'PGRST202') return res.status(503).json({ error: 'Cancellation setup is pending. Please contact your website administrator.' });
      if (error) throw Object.assign(new Error(error.message), { status: error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 409 });
      if (!data.changed) return res.json({ success: true, already_cancelled: true, email_status: 'already_requested' });
      let emailStatus = 'no_email';
      if (data.customer_email) {
        try {
          const result = await queueEmail({
            orderId: data.order_id,
            recipient: data.customer_email,
            emailType: 'admin_unpaid_cancellation',
            subject: `Order cancelled - ${data.reference}`,
            html: `<p>Hi ${escapeHtml(data.customer_name || 'there')},</p><p>Your unpaid order / checkout <strong>${escapeHtml(data.reference)}</strong> has been cancelled.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>No confirmed payment is recorded for this order. Please do not use the previous payment link. If you have already paid, reply with your payment reference so we can review it.</p><p>You are welcome to place a new order when ready.</p>`,
            metadata: { order_number: data.reference, cancellation_reason: reason, cancelled_by: admin.id },
            templateVariables: { customer_name: data.customer_name || 'there', order_number: data.reference, cancellation_reason: reason }
          });
          emailStatus = result.sent ? 'sent' : result.pendingSetup ? 'pending_setup' : result.queued ? 'queued' : 'failed';
        } catch (error) {
          console.error('[Admin Cancellation Email]', error.message);
          emailStatus = 'failed';
        }
      }
      return res.json({ success: true, status: 'cancelled', email_status: emailStatus });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Unable to cancel this entry.' });
    }
  }
  app.post('/api/admin/unpaid-sales/:kind/:reference/cancel', cancel);
}
module.exports = { registerUnpaidCancellations };
