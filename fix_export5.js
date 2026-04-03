const fs = require('fs');
const code = fs.readFileSync('sidepanel.js', 'utf8');

const startIdx = code.indexOf("const getExportData = async () => {");
const endIdx = startIdx + 1500;
const snippet = code.substring(startIdx, endIdx);
console.log(snippet);
