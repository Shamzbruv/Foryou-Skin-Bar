const fs = require('fs');
const html = fs.readFileSync('reviews.html', 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('temp_test.js', script);
