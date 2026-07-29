require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ORIGIN = 'https://foryouskinbar.com';

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[character]));
}

function entry(pathname, lastmod, changefreq, priority) {
  const lines = ['  <url>', `    <loc>${escapeXml(new URL(pathname, ORIGIN).href)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  lines.push('  </url>');
  return lines.join('\n');
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const [products, posts] = await Promise.all([
      client.query("select id,updated_at,created_at from public.products where lower(coalesce(status,''))='active' order by created_at desc"),
      client.query("select slug,updated_at,published_at,created_at from public.blog_posts where lower(coalesce(status,''))='published' and slug is not null order by published_at desc nulls last")
    ]);
    const now = new Date().toISOString();
    const urls = [
      entry('/', now, 'weekly', '1.0'),
      entry('/shop.html', now, 'daily', '0.9'),
      entry('/quiz.html', now, 'monthly', '0.8'),
      entry('/ingredients.html', now, 'monthly', '0.8'),
      entry('/blog.html', now, 'weekly', '0.8'),
      entry('/about.html', now, 'monthly', '0.7'),
      entry('/reviews.html', now, 'weekly', '0.7'),
      entry('/faq.html', now, 'monthly', '0.7'),
      entry('/shipping-returns.html', now, 'monthly', '0.6'),
      entry('/loyalty.html', now, 'monthly', '0.6'),
      entry('/contact.html', now, 'yearly', '0.5'),
      ...products.rows.map((product) => entry(`/product.html?id=${encodeURIComponent(product.id)}`, product.updated_at || product.created_at, 'weekly', '0.8')),
      ...posts.rows.map((post) => entry(`/blog-post.html?slug=${encodeURIComponent(post.slug)}`, post.updated_at || post.published_at || post.created_at, 'monthly', '0.7'))
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'), xml, 'utf8');
    console.log(`Generated sitemap.xml with ${urls.length} indexable URLs.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Sitemap generation failed:', error.message);
  process.exit(1);
});
