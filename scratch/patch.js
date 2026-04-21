const fs = require('fs');
let code = fs.readFileSync('sidepanel.js', 'utf8');
let normalizedCode = code.replace(/\r\n/g, '\n');

const updateDashOld = `  function updateDashboard(results) {
      let totalLqs = 0; let issueCount = 0; let mismatchCount = 0;
      results.forEach(item => {
          if (item.attributes && item.attributes.lqs) {
              const score = parseInt(item.attributes.lqs.split('/')[0]);
              if (!isNaN(score)) totalLqs += score;
              if (score < 70) issueCount++;
          }
          if (item.expected && item.attributes.metaTitle !== item.expected.title) mismatchCount++;
      });
      const avg = results.length ? Math.round(totalLqs / results.length) : 0;
      statTotal.textContent = results.length;
      statLqs.textContent = avg + '/100';
      statIssues.textContent = mismatchCount > 0 ? \`\${mismatchCount} Diff\` : issueCount;

      // Duration is updated in renderState now using persistent storage

      resultsPlaceholder.style.display = 'none';
      dashboardView.style.display = 'grid';
  }`;

const updateDashNew = `  function updateDashboard(results) {
      let totalLqs = 0; let issueCount = 0; let mismatchCount = 0;
      results.forEach(item => {
          if (MEGA_MODE === 'auditor') {
               const score = item._pendingAuditReport ? item._pendingAuditReport.score : 0;
               if (!isNaN(score)) totalLqs += score;
               if (item.error || (item._pendingAuditReport && item._pendingAuditReport.passed === false)) issueCount++;
          } else {
              if (item.attributes && item.attributes.lqs) {
                  const score = parseInt(item.attributes.lqs.split('/')[0]);
                  if (!isNaN(score)) totalLqs += score;
                  if (score < 70) issueCount++;
              }
              if (item.expected && item.attributes.metaTitle !== item.expected.title) mismatchCount++;
          }
      });
      const avg = results.length ? Math.round(totalLqs / results.length) : 0;
      statTotal.textContent = results.length;
      
      const statLqsLabel = document.querySelector('#dashboardView .dash-card:nth-child(2) .dash-label');
      if (MEGA_MODE === 'auditor') {
          if (statLqsLabel) statLqsLabel.textContent = 'Avg Score';
          statLqs.textContent = avg + '%';
          statIssues.textContent = issueCount + ' Fails';
      } else {
          if (statLqsLabel) statLqsLabel.textContent = 'Avg LQS';
          statLqs.textContent = avg + '/100';
          statIssues.textContent = mismatchCount > 0 ? \`\${mismatchCount} Diff\` : issueCount;
      }

      // Duration is updated in renderState now using persistent storage

      resultsPlaceholder.style.display = 'none';
      dashboardView.style.display = 'grid';
  }`;

if (!normalizedCode.includes(updateDashOld)) {
    console.error("Failed to find old dashboard update code.");
} else {
    normalizedCode = normalizedCode.replace(updateDashOld, updateDashNew);
    console.log("Dashboard update replaced successfully.");
}

// Now the previewBtn replacement
// Use string index finding to get the chunk
const previewStartStr = "      if (MEGA_MODE === 'auditor') {\n          // Auditor Mode Detailed Diff View";
const previewEndStr = "          if (modalBody.childNodes.length === 0) {\n              modalBody.textContent = 'No text mismatches to preview or missing expected data.';\n          }\n\n      } else {\n          // Standard Scraper View";

const startIdx = normalizedCode.indexOf(previewStartStr);
const endIdx = normalizedCode.indexOf(previewEndStr);

if (startIdx !== -1 && endIdx !== -1) {
    const endTotalIdx = endIdx + previewEndStr.length;
    
    const newPreviewStr = `      if (MEGA_MODE === 'auditor') {
          // Auditor Mode Simplified View
          results.forEach(r => {
              const card = document.createElement('div');
              card.className = 'diff-card';
              card.style.border = '1px solid var(--border)';
              card.style.marginBottom = '8px';
              card.style.borderRadius = '6px';
              card.style.padding = '12px';
              card.style.display = 'flex';
              card.style.justifyContent = 'space-between';
              card.style.alignItems = 'center';

              const asin = r.attributes?.mediaAsin || r.queryASIN || 'Unknown ASIN';
              
              let passed = true;
              if (r.error || (r._pendingAuditReport && r._pendingAuditReport.passed === false)) passed = false;

              const infoDiv = document.createElement('div');
              const header = document.createElement('div');
              header.style.fontWeight = 'bold';
              header.textContent = \`ASIN: \${asin}\`;
              
              const statusBadge = document.createElement('span');
              statusBadge.textContent = passed ? 'PASSED' : 'FAILED';
              statusBadge.style.fontSize = '10px';
              statusBadge.style.padding = '2px 6px';
              statusBadge.style.borderRadius = '12px';
              statusBadge.style.marginLeft = '8px';
              statusBadge.style.backgroundColor = passed ? 'var(--success-bg)' : 'var(--danger-bg)';
              statusBadge.style.color = passed ? 'var(--success)' : 'var(--danger)';
              
              header.appendChild(statusBadge);
              infoDiv.appendChild(header);

              const viewDiffBtn = document.createElement('button');
              viewDiffBtn.className = 'view-diff-btn btn btn-primary';
              viewDiffBtn.textContent = '🔍 View Full Report';
              viewDiffBtn.style.padding = '6px 12px';
              viewDiffBtn.style.fontSize = '11px';
              viewDiffBtn.style.cursor = 'pointer';
              viewDiffBtn.style.backgroundColor = 'var(--primary)';
              viewDiffBtn.style.color = '#fff';
              viewDiffBtn.style.border = 'none';
              viewDiffBtn.style.borderRadius = '4px';
              viewDiffBtn.addEventListener('click', () => {
                  chrome.tabs.create({ url: chrome.runtime.getURL(\`report.html?asin=\${asin}\`) });
              });

              card.appendChild(infoDiv);
              card.appendChild(viewDiffBtn);
              modalBody.appendChild(card);
          });

          if (modalBody.childNodes.length === 0) {
              modalBody.textContent = 'No audit results to preview.';
          }

      } else {
          // Standard Scraper View`;
          
    normalizedCode = normalizedCode.substring(0, startIdx) + newPreviewStr + normalizedCode.substring(endTotalIdx);
    console.log("Preview modal replaced successfully.");
} else {
    console.error("Failed to find preview modal code.");
}

fs.writeFileSync('sidepanel.js', normalizedCode);
