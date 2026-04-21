import { generateTextDiff } from './src/utils/diffEngine.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Parse ASIN from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetAsin = urlParams.get('asin');

    if (!targetAsin) {
        document.getElementById('reportAsin').textContent = "Error: No ASIN provided";
        return;
    }

    document.getElementById('reportAsin').textContent = `ASIN: ${targetAsin}`;

    // 2. Fetch data from storage
    const data = await chrome.storage.local.get('auditorState');
    const results = data.auditorState ? data.auditorState.results : [];

    const result = results.find(r =>
        (r.attributes && r.attributes.mediaAsin === targetAsin) ||
        r.queryASIN === targetAsin
    );

    if (!result) {
        document.getElementById('reportAsin').textContent = `ASIN: ${targetAsin} (Not Found in State)`;
        return;
    }

    // Determine Overall Status
    let overallPassed = true;
    if (result.error || (result._pendingAuditReport && !result._pendingAuditReport.passed)) {
         overallPassed = false;
    }

    const statusEl = document.getElementById('overallStatus');
    if (overallPassed) {
        statusEl.textContent = 'PASSED';
        statusEl.className = 'status-badge status-pass';
    } else {
        statusEl.textContent = 'FAILED';
        statusEl.className = 'status-badge status-fail';
    }

    // 3. Render Text Audit Section
    const textAuditContent = document.getElementById('textAuditContent');
    let hasTextDiff = false;

    const normalizeDiffInput = (input) => {
        if (Array.isArray(input)) return input.join(' ');
        return String(input || "");
    };

    const addTextDiff = (label, expected, actual, passed) => {
        if (passed) return; // Only show failed fields
        hasTextDiff = true;

        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'diff-field';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'diff-field-label';
        labelDiv.textContent = label;

        const diffBox = document.createElement('div');
        diffBox.className = 'diff-box';
        diffBox.innerHTML = generateTextDiff(normalizeDiffInput(expected), normalizeDiffInput(actual));

        fieldDiv.appendChild(labelDiv);
        fieldDiv.appendChild(diffBox);
        textAuditContent.appendChild(fieldDiv);
    };

    // Extract expected from comparisonData or expected object
    const expTitle = result.expected?.title || result.comparisonData?.expected_title;
    const actTitle = result.attributes?.metaTitle;
    const titlePassed = result._pendingAuditReport?.results?.content?.details?.find(d => d.label === 'Title')?.passed;
    if (titlePassed === false || (normalizeDiffInput(expTitle) !== normalizeDiffInput(actTitle) && !titlePassed)) {
        addTextDiff("Title", expTitle, actTitle, false);
    }

    const expBullets = result.expected?.bullets || result.comparisonData?.expected_bullets;
    const actBullets = result.attributes?.bullets;
    const bulletsPassed = result._pendingAuditReport?.results?.content?.details?.find(d => d.label === 'Bullets')?.passed;
    if (bulletsPassed === false || (normalizeDiffInput(expBullets) !== normalizeDiffInput(actBullets) && !bulletsPassed)) {
        addTextDiff("Bullets", expBullets, actBullets, false);
    }

    const expDesc = result.expected?.description || result.comparisonData?.expected_description;
    const actDesc = result.attributes?.description;
    const descPassed = result._pendingAuditReport?.results?.content?.details?.find(d => d.label === 'Description')?.passed;
    if (descPassed === false || (normalizeDiffInput(expDesc) !== normalizeDiffInput(actDesc) && !descPassed)) {
        addTextDiff("Description", expDesc, actDesc, false);
    }

    if (hasTextDiff) {
        document.getElementById('textAuditSection').style.display = 'block';
    }

    // 4. Render Visual Audit Section
    const visualAuditContent = document.getElementById('visualAuditContent');
    let hasVisualDiff = false;

    // Use Visual Details from pendingAuditReport if available
    const visualReport = result._pendingAuditReport?.results?.visuals;
    if (visualReport && !visualReport.passed && visualReport.details) {
        visualReport.details.forEach(detail => {
            if (!detail.passed) {
                 hasVisualDiff = true;

                 const row = document.createElement('div');
                 row.className = 'visual-row';

                 // Expected Column
                 const colExp = document.createElement('div');
                 colExp.className = 'visual-col';
                 const titleExp = document.createElement('div');
                 titleExp.className = 'visual-title';
                 titleExp.textContent = `Expected (${detail.label || 'Image'})`;
                 const imgContExp = document.createElement('div');
                 imgContExp.className = 'visual-img-container';
                 const imgExp = document.createElement('img');
                 imgExp.src = detail.expected || ''; // URL or base64
                 imgContExp.appendChild(imgExp);
                 colExp.appendChild(titleExp);
                 colExp.appendChild(imgContExp);

                 // Actual Column
                 const colAct = document.createElement('div');
                 colAct.className = 'visual-col';
                 const titleAct = document.createElement('div');
                 titleAct.className = 'visual-title';
                 titleAct.textContent = `Actual (Live PDP)`;
                 const imgContAct = document.createElement('div');
                 imgContAct.className = 'visual-img-container';
                 const imgAct = document.createElement('img');
                 imgAct.src = detail.actual || '';
                 imgContAct.appendChild(imgAct);
                 colAct.appendChild(titleAct);
                 colAct.appendChild(imgContAct);

                 row.appendChild(colExp);
                 row.appendChild(colAct);
                 visualAuditContent.appendChild(row);
            }
        });
    }

    if (hasVisualDiff) {
        document.getElementById('visualAuditSection').style.display = 'block';
    }
});
