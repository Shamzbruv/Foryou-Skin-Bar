const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update desktop nav
  const searchQuiz = '<a href="quiz.html" class="hover:text-amber-800 transition">Skin Quiz</a>';
  const replaceQuiz = '<a href="quiz.html" class="hover:text-amber-800 transition">Skin Quiz</a>\n      <a href="reviews.html" class="hover:text-amber-800 transition">Reviews</a>';
  
  const searchQuiz2 = '<a href="quiz.html" class="text-amber-800 transition">Skin Quiz</a>';
  const replaceQuiz2 = '<a href="quiz.html" class="text-amber-800 transition">Skin Quiz</a>\n      <a href="reviews.html" class="hover:text-amber-800 transition">Reviews</a>';

  // Update mobile nav
  const searchMobileQuiz = '<a href="quiz.html">Skin Quiz</a>';
  const replaceMobileQuiz = '<a href="quiz.html">Skin Quiz</a>\n        <a href="reviews.html">Reviews</a>';

  let changed = false;

  if (content.includes('href="quiz.html"') && !content.includes('href="reviews.html"')) {
    if (content.includes(searchQuiz)) {
      content = content.replace(searchQuiz, replaceQuiz);
      changed = true;
    } else if (content.includes(searchQuiz2)) {
      content = content.replace(searchQuiz2, replaceQuiz2);
      changed = true;
    }
    
    if (content.includes(searchMobileQuiz)) {
      content = content.replace(searchMobileQuiz, replaceMobileQuiz);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${file}`);
      modifiedCount++;
    }
  }
}

console.log(`Finished. Updated ${modifiedCount} files.`);
