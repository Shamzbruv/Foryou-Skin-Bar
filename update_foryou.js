const fs = require('fs');
const filePath = 'c:/Users/Shamz/Desktop/For you skin bar/For you skin bar/loyalty.html';
let content = fs.readFileSync(filePath, 'utf8');

// Replace variations of "For You Skin Bar" with "ForYou Skin Bar"
content = content.replace(/For You Skin Bar/g, 'ForYou Skin Bar');
content = content.replace(/Foryou Skin Bar/g, 'ForYou Skin Bar');
content = content.replace(/For you Skin Bar/g, 'ForYou Skin Bar');

fs.writeFileSync(filePath, content);
console.log('Updated ForYou Skin Bar in loyalty.html');
