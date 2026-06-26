const fs = require('fs');
const path = require('path');
const express = require('express');

const originalStatic = express.static.bind(express);

function injectProductControls(html) {
  const repairedSource = html
    .replace(/\.join\('\r?\n'\)/g, ".join('\\n')")
    .replace(/\.split\('\r?\n'\)/g, ".split('\\n')");

  const productControlScript = `
        // Product actions are added after each rendered row so this remains
        // reliable even when the product table markup changes.
        window.deleteProduct = async function(productId) {
            const product = currentProducts.find(function(item) { return item.id === productId; });
            if (!product) {
                showToast('This product could not be found. Refresh the page and try again.', 'error');
                return;
            }

            const confirmed = window.confirm('Delete "' + product.name + '"? Products tied to past orders will be archived instead to keep order history safe.');
            if (!confirmed) return;

            try {
                const directHistory = await supabase
                    .from('order_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('product_id', productId);
                if (directHistory.error) throw new Error(directHistory.error.message);

                let hasOrderHistory = (directHistory.count || 0) > 0;
                const variantIds = (product.product_variants || []).map(function(variant) { return variant.id; }).filter(Boolean);
                if (!hasOrderHistory && variantIds.length) {
                    const variantHistory = await supabase
                        .from('order_items')
                        .select('id', { count: 'exact', head: true })
                        .in('variant_id', variantIds);
                    if (variantHistory.error) throw new Error(variantHistory.error.message);
                    hasOrderHistory = (variantHistory.count || 0) > 0;
                }

                if (hasOrderHistory) {
                    const archived = await supabase
                        .from('products')
                        .update({ status: 'archived' })
                        .eq('id', productId);
                    if (archived.error) throw new Error(archived.error.message);
                    showToast('This product has past orders, so it was archived instead of deleted.');
                } else {
                    const removed = await supabase.from('products').delete().eq('id', productId);
                    if (removed.error) {
                        const archived = await supabase
                            .from('products')
                            .update({ status: 'archived' })
                            .eq('id', productId);
                        if (archived.error) throw new Error(removed.error.message);
                        showToast('The product could not be safely deleted, so it was archived instead.', 'error');
                    } else {
                        showToast('Product permanently deleted.');
                    }
                }

                await loadProducts();
            } catch (error) {
                showToast('Unable to remove product: ' + error.message, 'error');
            }
        };

        function installProductDeleteControls() {
            const tableBody = $('productsTableBody');
            if (!tableBody) return;

            const addDeleteButtons = function() {
                tableBody.querySelectorAll('button[onclick*="openProductModal"]').forEach(function(editButton) {
                    const actionCell = editButton.closest('td');
                    if (!actionCell || actionCell.querySelector('[data-product-delete]')) return;

                    const action = String(editButton.getAttribute('onclick') || '');
                    const match = action.match(/openProductModal\\('([^']+)'\\)/);
                    if (!match) return;

                    const deleteButton = document.createElement('button');
                    deleteButton.type = 'button';
                    deleteButton.dataset.productDelete = 'true';
                    deleteButton.className = 'ml-2 bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded text-sm font-medium transition';
                    deleteButton.innerHTML = '<i class="fas fa-trash mr-1"></i>Delete';
                    deleteButton.addEventListener('click', function() {
                        window.deleteProduct(match[1]);
                    });
                    actionCell.appendChild(deleteButton);
                });
            };

            new MutationObserver(addDeleteButtons).observe(tableBody, { childList: true, subtree: true });
            addDeleteButtons();
        }

        installProductDeleteControls();
`;

  const finalScriptIndex = repairedSource.lastIndexOf('</script>');
  if (finalScriptIndex === -1 || repairedSource.includes('window.deleteProduct = async function')) return repairedSource;
  return `${repairedSource.slice(0, finalScriptIndex)}${productControlScript}${repairedSource.slice(finalScriptIndex)}`;
}

express.static = function patchedStatic(root, options) {
  const fallback = originalStatic(root, options);

  return function staticWithProductHotfix(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isProductsPage = req.method === 'GET' && (
      pathname === '/admin/products.html' || pathname === '/admin/products'
    );

    if (!isProductsPage) return fallback(req, res, next);

    const productPagePath = path.join(root, 'admin', 'products.html');
    fs.readFile(productPagePath, 'utf8', (error, html) => {
      if (error) return next(error);
      const repaired = injectProductControls(html);
      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(repaired);
    });
  };
};
