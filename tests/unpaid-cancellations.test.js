const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerUnpaidCancellations } = require('../unpaid-cancellations');
function setup({ authError, rpcData, rpcError, emailResult, emailError } = {}) {
  let handler; let rpcCalls = 0; let emails = 0;
  registerUnpaidCancellations({ post: (_, fn) => { handler = fn; } }, {
    db: { rpc: async () => { rpcCalls++; return { data: rpcData || { changed: true, reference: 'FSB-test', customer_email: 'test@example.invalid' }, error: rpcError }; } },
    requireAdmin: async () => { if (authError) throw authError; return { id: 'admin' }; },
    queueEmail: async () => { emails++; if (emailError) throw new Error('Delivery unavailable'); return emailResult || { sent: true }; },
    escapeHtml: x => String(x).replace(/</g, '&lt;')
  });
  return { async request(body = { reason: 'Payment not received' }) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { kind: 'checkout', reference: 'FSB-test' }, body }, res);
    return { ...res, rpcCalls, emails };
  } };
}
test('unauthenticated requests never reach the database', async () => {
  const r = await setup({ authError: Object.assign(new Error('Sign in'), { status: 401 }) }).request();
  assert.equal(r.code, 401); assert.equal(r.rpcCalls, 0); assert.equal(r.emails, 0);
});
test('requires a meaningful reason', async () => {
  const r = await setup().request({ reason: ' ' }); assert.equal(r.code, 400); assert.equal(r.rpcCalls, 0);
});
test('paid-order conflicts do not notify a customer', async () => {
  const r = await setup({ rpcError: { code: 'P0001', message: 'Paid orders cannot be cancelled' } }).request();
  assert.equal(r.code, 409); assert.equal(r.emails, 0);
});
test('repeat clicks do not send another notification', async () => {
  const r = await setup({ rpcData: { changed: false } }).request();
  assert.equal(r.code, 200); assert.equal(r.emails, 0); assert.equal(r.body.already_cancelled, true);
});
for (const [result, status] of [[{ sent: true }, 'sent'], [{ queued: true }, 'queued'], [{ queued: true, pendingSetup: true }, 'pending_setup'], [{ queued: false }, 'failed']]) {
  test(`reports notification status ${status}`, async () => {
    const r = await setup({ emailResult: result }).request(); assert.equal(r.body.email_status, status); assert.equal(r.emails, 1);
  });
}
test('an email exception does not misreport a committed cancellation as failed', async () => {
  const r = await setup({ emailError: true }).request(); assert.equal(r.code, 200); assert.equal(r.body.email_status, 'failed');
});
test('missing email is made explicit', async () => {
  const r = await setup({ rpcData: { changed: true, reference: 'FSB-test' } }).request();
  assert.equal(r.emails, 0); assert.equal(r.body.email_status, 'no_email');
});
