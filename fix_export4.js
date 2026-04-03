const fs = require('fs');
const code = fs.readFileSync('sidepanel.js', 'utf8');

const startIdx = code.indexOf('row["Match Comparison ASINs"] = "ERROR";');
const endIdx = startIdx + 8000;
const snippet = code.substring(startIdx, endIdx);
console.log(snippet);
