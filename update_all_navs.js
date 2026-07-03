const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let count = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Regex to find the nav container and extract the bag-shopping color
  // Looks for:
  // <div class="flex items-center gap-4">
  // [anything]
  // <button id="cartIconBtn" class="relative"[^>]*>
  // \s*<i class="fas fa-bag-shopping (text-[^ ]+) text-xl"></i>
  
  const regex = /<div class="flex items-center gap-4">([\s\S]*?)<button id="cartIconBtn" class="relative"(.*?)>\s*<i class="fas fa-bag-shopping (text-[^ ]+) text-xl"><\/i>/;
  
  const match = content.match(regex);
  if (match) {
    const textColor = match[3]; // e.g. text-stone-700 or text-white
    
    // Check if the current file has an aria-label on cartIconBtn (like loyalty.html)
    const cartBtnAttributes = match[2];

    const newNavHtml = `<div class="flex items-center gap-4">
      <a href="customer-login.html" class="${textColor} hover:text-amber-800 transition" title="My Account">
        <i class="fas fa-user text-xl"></i>
      </a>
      <a href="admin/login.html" class="${textColor} hover:text-amber-800 transition" title="Admin Portal">
        <i class="fas fa-user-shield text-xl"></i>
      </a>
      <button id="cartIconBtn" class="relative"${cartBtnAttributes}>
        <i class="fas fa-bag-shopping ${textColor} text-xl"></i>`;

    const newContent = content.replace(regex, newNavHtml);
    if (newContent !== content) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated ${file}`);
      count++;
    }
  }
});

console.log(`Total files updated: ${count}`);
