import { generateTextDiff } from './src/utils/diffEngine.js';
import { generateFlatFile, generateSupportPrompt } from './src/remediationAgent.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Theme setup
    const themeToggle = document.getElementById('themeToggle');
    const getTheme = () => document.body.getAttribute('data-theme') || 'light';
    
    // Default theme based on system
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    }

    themeToggle.addEventListener('click', () => {
        const nextTheme = getTheme() === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', nextTheme);
        themeToggle.textContent = nextTheme === 'light' ? '🌙' : '☀️';
    });

    // 1. Parse ASIN from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetAsin = urlParams.get('asin');

    if (!targetAsin) {
        document.getElementById('reportAsin').textContent = "Error: No ASIN provided";
        return;
    }

    document.getElementById('reportAsin').textContent = targetAsin;

    // 2. Fetch data from storage
    const data = await chrome.storage.local.get('auditorState');
    const results = data.auditorState ? data.auditorState.results : [];

    const result = results.find(r =>
        (r.attributes && r.attributes.mediaAsin === targetAsin) ||
        r.queryASIN === targetAsin
    );

    if (!result) {
        document.getElementById('reportAsin').textContent = `${targetAsin} (Not Found)`;
        return;
    }

    // Determine Overall Status & Score
    const auditReport = result._pendingAuditReport || {};
    let overallPassed = true;
    if (result.error || auditReport.passed === false) {
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

    const scoreEl = document.getElementById('matchScore');
    scoreEl.textContent = auditReport.score !== undefined ? `${auditReport.score}%` : 'N/A';

    // 3. Render Text Audit Section
    const textAuditContent = document.getElementById('textAuditContent');
    let hasTextDiff = false;
    let failedTextProps = [];

    const normalizeDiffInput = (input) => {
        if (Array.isArray(input)) return input.join(' ');
        return String(input || "");
    };

    const addTextDiff = (label, propName, expected, actual, passed) => {
        if (passed) return; // Only show failed fields
        hasTextDiff = true;
        failedTextProps.push(propName);

        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'diff-field';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'diff-field-header';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'diff-field-label';
        labelDiv.textContent = label;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'diff-field-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary btn-small';
        copyBtn.textContent = 'Copy Expected';
        copyBtn.addEventListener('click', () => {
             navigator.clipboard.writeText(normalizeDiffInput(expected));
             copyBtn.textContent = 'Copied!';
             setTimeout(() => copyBtn.textContent = 'Copy Expected', 2000);
        });
        
        actionsDiv.appendChild(copyBtn);
        headerDiv.appendChild(labelDiv);
        headerDiv.appendChild(actionsDiv);

        const diffBox = document.createElement('div');
        diffBox.className = 'diff-box';
        diffBox.innerHTML = generateTextDiff(normalizeDiffInput(expected), normalizeDiffInput(actual));

        fieldDiv.appendChild(headerDiv);
        fieldDiv.appendChild(diffBox);
        textAuditContent.appendChild(fieldDiv);
    };

    // Extract expected from comparisonData or expected object
    const expTitle = result.expected?.title || result.comparisonData?.expected_title;
    const actTitle = result.attributes?.metaTitle;
    const titlePassed = auditReport.results?.content?.details?.find(d => d.label === 'Title')?.passed;
    if (titlePassed === false || (normalizeDiffInput(expTitle) !== normalizeDiffInput(actTitle) && !titlePassed)) {
        addTextDiff("Title", "title", expTitle, actTitle, false);
    }

    const expBullets = result.expected?.bullets || result.comparisonData?.expected_bullets;
    const actBullets = result.attributes?.bullets;
    const bulletsPassed = auditReport.results?.content?.details?.find(d => d.label === 'Bullets')?.passed;
    if (bulletsPassed === false || (normalizeDiffInput(expBullets) !== normalizeDiffInput(actBullets) && !bulletsPassed)) {
        addTextDiff("Bullets", "bullets", expBullets, actBullets, false);
    }

    const expDesc = result.expected?.description || result.comparisonData?.expected_description;
    const actDesc = result.attributes?.description;
    const descPassed = auditReport.results?.content?.details?.find(d => d.label === 'Description')?.passed;
    if (descPassed === false || (normalizeDiffInput(expDesc) !== normalizeDiffInput(actDesc) && !descPassed)) {
        addTextDiff("Description", "description", expDesc, actDesc, false);
    }

    if (hasTextDiff) {
        document.getElementById('textAuditSection').style.display = 'block';
        document.getElementById('heroActions').style.display = 'flex';
        
        // Wire up Remediation Actions
        document.getElementById('generateFlatFileBtn').addEventListener('click', async () => {
            try {
                // xlsx relies on window.XLSX being available. Assuming xlsx.full.min.js is injected or available
                if (typeof XLSX === 'undefined') {
                    // Try dynamically importing if it exists
                    await import('./xlsx.full.min.js').catch(e => console.warn('Dynamic import failed, relying on global XLSX'));
                }
                const { blob, fileName } = generateFlatFile(result, failedTextProps);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (err) {
                alert(`Remediation Error: ${err.message}. Make sure xlsx is loaded.`);
            }
        });

        document.getElementById('autoFillSellerCentralBtn').addEventListener('click', () => {
            // Trigger background to open seller central and auto-fill
            chrome.runtime.sendMessage({
                action: 'triggerRPA',
                flowType: 'fix_listing',
                data: {
                    asin: targetAsin,
                    failedFields: failedTextProps,
                    expectedData: {
                        title: normalizeDiffInput(expTitle),
                        bullets: normalizeDiffInput(expBullets),
                        description: normalizeDiffInput(expDesc)
                    }
                }
            });
            alert("RPA Triggered! Opening Seller Central in a new tab...");
        });
    }

    // 4. Render Visual Audit Section
    const visualAuditContent = document.getElementById('visualAuditContent');
    let hasVisualDiff = false;

    // Use Visual Details from pendingAuditReport if available
    const visualReport = auditReport.results?.visuals;
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
