(function () {
  const POLICY_TABS = [
    { id: 'return-policy', label: 'Return & Refund Policy' },
    { id: 'terms-conditions', label: 'Terms & Conditions' },
    { id: 'privacy-policy', label: 'Privacy Policy' },
    { id: 'shipping-policy', label: 'Shipping Policy' },
    { id: 'product-disclaimer', label: 'Product Disclaimer' },
    { id: 'skincare-disclaimer', label: 'Skincare Results Disclaimer' },
    { id: 'checkout-consent', label: 'Checkout Consent' }
  ];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function cleanHtml(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html);
    template.content.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
    template.content.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || '').trim().toLowerCase();
        if (name.startsWith('on') || (['href', 'src'].includes(name) && value.startsWith('javascript:'))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  async function fetchPolicyDocuments() {
    if (!window.supabase || typeof window.supabase.from !== 'function') return null;
    const { data, error } = await window.supabase
      .from('store_settings')
      .select('value')
      .eq('key', 'policy_documents')
      .maybeSingle();
    if (error) {
      console.warn('Policy CMS content could not be loaded.', error);
      return null;
    }
    return data && data.value ? data.value : null;
  }

  function renderPolicyDocuments(documents) {
    const items = documents && documents.items && typeof documents.items === 'object' ? documents.items : {};
    POLICY_TABS.forEach((policy) => {
      const saved = items[policy.id];
      if (!saved) return;
      const tab = document.querySelector(`.policy-nav a[data-target="${policy.id}"]`);
      const content = document.getElementById(policy.id);
      const title = String(saved.title || policy.label).trim();
      const bodyHtml = cleanHtml(saved.bodyHtml || saved.body || '');

      if (tab && title) tab.textContent = title;
      if (content && bodyHtml) {
        content.innerHTML = `<h2>${escapeHtml(title)}</h2>${bodyHtml}`;
      }
    });
  }

  async function initPolicyCms() {
    const documents = await fetchPolicyDocuments();
    if (documents) renderPolicyDocuments(documents);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPolicyCms, { once: true });
  } else {
    initPolicyCms();
  }
})();
