const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

const contentLink = '        <a href="/admin/content.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Site Content (CMS)</a>\n';

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (file === 'content.html' || file === 'login.html') {
    continue; // content.html already has it active, login.html has no sidebar
  }

  if (!content.includes('href="/admin/content.html"')) {
    const lines = content.split('\n');
    const newLines = [];
    let injected = false;

    for (const line of lines) {
      newLines.push(line);
      // Insert after Blog link
      if (line.includes('href="/admin/blog.html"') && !injected) {
        newLines.push(contentLink.trimEnd());
        injected = true;
      }
    }

    if (injected) {
      fs.writeFileSync(filePath, newLines.join('\n'));
      console.log(`Injected into ${file}`);
    } else {
      console.log(`Failed to inject into ${file}`);
    }
  } else {
    console.log(`${file} already has it.`);
  }
}
