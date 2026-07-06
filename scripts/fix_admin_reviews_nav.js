const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && f !== 'reviews.html');

const searchStr = `<a href="/admin/content.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Site Content (CMS)</a>`;
const replacementStr = `<a href="/admin/content.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Site Content (CMS)</a>
        <a href="/admin/reviews.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Reviews</a>`;

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes(searchStr) && !content.includes('/admin/reviews.html')) {
    content = content.replace(searchStr, replacementStr);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
    modifiedCount++;
  }
}

console.log(`Finished. Updated ${modifiedCount} files.`);
