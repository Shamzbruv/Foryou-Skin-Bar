const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('For You Admin')) {
    content = content.replace(/>For You Admin</g, '>Foryou Admin<');
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
