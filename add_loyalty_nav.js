const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let count = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Check if it has the quiz link in the navigation
  if (content.includes('>Skin Quiz</a>')) {
    // Check if it already has Glow Rewards near it
    // We only want to insert it in the main navigation (e.g. between quiz and faq)
    
    // Some pages might have it in the footer, but we are looking for the exact hover:text-amber-800 transition pattern
    const regex = /(<a href="quiz\.html"[^>]*>Skin Quiz<\/a>\s*)(?![\s\S]{0,100}Glow Rewards)/;
    
    if (regex.test(content)) {
      // It doesn't have Glow Rewards immediately after Skin Quiz.
      // Wait, let's just do a simpler string replace. We want to insert after the Quiz link.
      // But we must ensure we don't duplicate it.
      
      const parts = content.split(/(<a href="quiz\.html"[^>]*>Skin Quiz<\/a>)/);
      if (parts.length > 1) {
        let updated = false;
        
        for (let i = 1; i < parts.length; i += 2) {
          const nextText = parts[i + 1] || '';
          // If the next 200 characters don't contain 'loyalty.html' or 'Glow Rewards'
          if (!nextText.substring(0, 200).includes('loyalty.html') && !nextText.substring(0, 200).includes('Glow Rewards')) {
            // Find the indentation of the quiz link
            const precedingText = parts[i - 1];
            const lastNewline = precedingText.lastIndexOf('\n');
            const indent = lastNewline !== -1 ? precedingText.substring(lastNewline + 1) : '      ';
            
            // Insert it
            parts[i] = parts[i] + '\n' + indent + '<a href="loyalty.html" class="hover:text-amber-800 transition">Glow Rewards</a>';
            updated = true;
          }
        }
        
        if (updated) {
          content = parts.join('');
          fs.writeFileSync(file, content, 'utf8');
          console.log(`Updated ${file}`);
          count++;
        }
      }
    }
  }
});

console.log(`Total files updated: ${count}`);
