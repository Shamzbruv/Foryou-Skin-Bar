const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

const loyaltyLink = '        <a href="/admin/loyalty.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Loyalty Program</a>\n';

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (file === 'loyalty.html' || file === 'login.html') {
    continue; // loyalty.html already has it active, login.html has no sidebar
  }

  if (!content.includes('href="/admin/loyalty.html"')) {
    const lines = content.split('\n');
    const newLines = [];
    let injected = false;

    for (const line of lines) {
      newLines.push(line);
      // Insert after Discounts link
      if (line.includes('href="/admin/discounts.html"') && !injected) {
        newLines.push(loyaltyLink.trimEnd()); // trimEnd to maintain formatting properly if needed, but actually I'll just push the exact line
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
