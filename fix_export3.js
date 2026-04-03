const fs = require('fs');
const code = fs.readFileSync('sidepanel.js', 'utf8');

const startIdx = code.indexOf("if (id === 'IsBuyBoxOwner') {");
const endIdx = startIdx + 8000;
const snippet = code.substring(startIdx, endIdx);
console.log(snippet);
