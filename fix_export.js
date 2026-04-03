// Read the getExportData function to see how it constructs the columns for Auditor Mode
// and see why it might be failing.

const fs = require('fs');

const code = fs.readFileSync('sidepanel.js', 'utf8');

// Find the start of getExportData
const startIdx = code.indexOf('const getExportData = async () => {');
if (startIdx === -1) {
    console.log("Could not find getExportData");
    process.exit(1);
}

// Extract a chunk
const snippet = code.substring(startIdx, startIdx + 8000);
console.log(snippet);
