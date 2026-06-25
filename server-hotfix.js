/**
 * Runtime compatibility fix for the Products admin page.
 *
 * A malformed newline in the currently deployed product editor script prevents
 * the browser from parsing the entire module. This intercepts the static
 * products page, repairs the two malformed string literals before sending it,
 * and adds a protected delete control until the product editor is refactored.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');

const originalStatic = express.static.bind(express);

function injectProductDeleteControl(html) {
  const deleteButton = "<button class=\"ml-2 bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded text-sm font-medium transition\" onclick=\"window.deleteProduct('${p.id}')\"><i class=\"fas fa-trash mr-1\"></i>Delete</button>";
  const actionCell = /(<td class="p-4 text-right">\s*<button[^>]*onclick="window\.openProductModal\('\$\{p\.id\}'\)"[^>]*>[\s\S]*?<\/button>)(\s*<\/td>)/;
  const withDelete = html.replace(actionCell, `$1${deleteButton}$2`);

  const handler = `
        // Safely remove products that have never appeared in an order. Products
        // with order history are archived instead so historical order records stay intact.
        window.deleteProduct = async function(productId) {
            const product = currentProducts.find(p => p.id === productId);
            if (!product) return;
            const confirmed = window.confirm('Permanently delete "' + product.name + '"? Products in past orders will be archived instead.');
            if (!confirmed) return;

            try {
                const direct = await supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', productId);
                if (direct.error) throw new Error(direct.error.message);

                let hasOrderHistory = (direct.count || 0) > 0;
                const variantIds = (product.product_variants || []).map(v => v.id).filter(Boolean);
                if (!hasOrderHistory && variantIds.length) {
                    const variants = await supabase.from('order_items').select('id', { count: 'exact', head: true }).in('variant_id', variantIds);
                    if (variants.error) throw new Error(variants.error.message);
                    hasOrderHistory = (variants.count || 0) > 0;
                }

                if (hasOrderHistory) {
                    const archived = await supabase.from('products').update({ status: 'archived' }).eq('id', productId);
                    if (archived.error) throw new Error(archived.error.message);
                    showToast('This product is part of order history, so it was archived instead.');
                } else {
                    const removed = await supabase.from('products').delete().eq('id', productId);
                    if (removed.error) {
                        const archived = await supabase.from('products').update({ status: 'archived' }).eq('id', productId);
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
`;

  const marker = '\n        loadProducts();\n    </script>';
  const index = withDelete.lastIndexOf(marker);
  return index === -1
    ? withDelete
    : `${withDelete.slice(0, index)}\n${handler}${withDelete.slice(index)}`;
}

express.static = function patchedStatic(root, options) {
  const fallback = originalStatic(root, options);

  return function staticWithProductHotfix(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    if (req.method !== 'GET' || pathname !== '/admin/products.html') {
      return fallback(req, res, next);
    }

    const productPagePath = path.join(root, 'admin', 'products.html');
    fs.readFile(productPagePath, 'utf8', (error, html) => {
      if (error) return next(error);

      const repaired = injectProductDeleteControl(
        html
          .replace(/\.join\('\r?\n'\)/g, ".join('\\n')")
          .replace(/\.split\('\r?\n'\)/g, ".split('\\n')")
      );

      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(repaired);
    });
  };
};
