const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.startsWith('.'));

const desktopLinks = [
  { href: 'index.html', text: 'Home' },
  { href: 'shop.html', text: 'Shop' },
  { href: 'about.html', text: 'About' },
  { href: 'blog.html', text: 'Blog' },
  { href: 'ingredients.html', text: 'Ingredients' },
  { href: 'quiz.html', text: 'Skin Quiz' },
  { href: 'reviews.html', text: 'Reviews' },
  { href: 'loyalty.html', text: 'Glow Rewards' },
  { href: 'faq.html', text: 'FAQ' },
  { href: 'contact.html', text: 'Contact' }
];

const mobileLinks = [
  { href: 'index.html', icon: 'fas fa-home w-5', text: 'Home' },
  { href: 'shop.html', icon: 'fas fa-bag-shopping w-5', text: 'Shop' },
  { href: 'about.html', icon: 'fas fa-heart w-5', text: 'About' },
  { href: 'blog.html', icon: 'fas fa-newspaper w-5', text: 'Blog' },
  { href: 'ingredients.html', icon: 'fas fa-leaf w-5', text: 'Ingredients' },
  { href: 'quiz.html', icon: 'fas fa-magic w-5', text: 'Skin Quiz' },
  { href: 'reviews.html', icon: 'fas fa-star w-5', text: 'Reviews' },
  { href: 'loyalty.html', icon: 'fas fa-gift w-5', text: 'Glow Rewards' },
  { href: 'faq.html', icon: 'fas fa-question-circle w-5', text: 'FAQ' },
  { href: 'contact.html', icon: 'fas fa-envelope w-5', text: 'Contact' }
];

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Sync Desktop Nav
  const desktopRegex = /(<div class="hidden md:flex items-center gap-7 text-sm font-medium (text-stone-700|text-white)"[^>]*>)([\s\S]*?)(<\/div>)/i;
  
  const match = content.match(desktopRegex);
  if (match) {
    const isDarkText = match[2] === 'text-stone-700'; // Light background means dark text
    let newDesktopHtml = match[1] + '\n';
    for (const link of desktopLinks) {
      const isActive = link.href === file;
      let classes = 'hover:text-amber-800 transition';
      if (isActive) {
        classes = isDarkText ? 'text-amber-800 transition' : 'text-white font-bold transition';
      }
      newDesktopHtml += `      <a href="${link.href}" class="${classes}">${link.text}</a>\n`;
    }
    newDesktopHtml += '    ' + match[4];
    content = content.replace(desktopRegex, newDesktopHtml);
  }

  // 2. Sync Mobile Nav
  // The mobile nav container is either <div class="flex flex-col gap-5 text-stone-700 font-medium"> 
  // or <div class="flex flex-col gap-6 text-lg font-medium text-stone-800" id="mobileNavLinks">
  const mobileRegex1 = /(<div class="flex flex-col gap-[56] text-(?:stone-700|lg) font-medium[^>]*>)([\s\S]*?)(<\/div>)/i;
  const matchMobile = content.match(mobileRegex1);
  if (matchMobile) {
    let newMobileHtml = matchMobile[1] + '\n';
    for (const link of mobileLinks) {
      const isActive = link.href === file;
      let classes = 'text-lg hover:text-amber-800 transition flex items-center gap-3';
      if (isActive) classes += ' text-amber-800 font-bold';
      newMobileHtml += `      <a href="${link.href}" class="${classes}"><i class="${link.icon}"></i>${link.text}</a>\n`;
    }
    newMobileHtml += '    ' + matchMobile[3];
    content = content.replace(mobileRegex1, newMobileHtml);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    modifiedCount++;
    console.log(`Updated nav in ${file}`);
  }
}

console.log(`Finished. Updated ${modifiedCount} files.`);
