const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

const replacements = {
    'href="index.html"': 'href="/admin/index.html"',
    'href="orders.html"': 'href="/admin/orders.html"',
    'href="products.html"': 'href="/admin/products.html"',
    'href="inventory.html"': 'href="/admin/inventory.html"',
    'href="customers.html"': 'href="/admin/customers.html"',
    'href="discounts.html"': 'href="/admin/discounts.html"',
    'href="blog.html"': 'href="/admin/blog.html"',
    'href="settings.html"': 'href="/admin/settings.html"',
    'href="reviews.html"': 'href="/admin/reviews.html"',
    "'./js/supabase-client.js'": "'/admin/js/supabase-client.js'",
    'href="../assets/brand/favicon-32.png"': 'href="/assets/brand/favicon-32.png"',
    'href="../assets/brand/favicon-16.png"': 'href="/assets/brand/favicon-16.png"',
    'href="../assets/brand/apple-touch-icon.png"': 'href="/assets/brand/apple-touch-icon.png"'
};

for (const file of files) {
    const filePath = path.join(adminDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let changed = false;
    for (const [search, replace] of Object.entries(replacements)) {
        if (content.includes(search)) {
            // Replace all occurrences using split/join to avoid regex escaping issues
            content = content.split(search).join(replace);
            changed = true;
        }
    }
    
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}
