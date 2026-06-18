import os

admin_dir = 'admin'
files = [f for f in os.listdir(admin_dir) if f.endswith('.html')]

replacements = {
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
}

for file in files:
    file_path = os.path.join(admin_dir, file)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changed = False
    for search, replace in replacements.items():
        if search in content:
            content = content.replace(search, replace)
            changed = True
            
    if changed:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {file}')
