# Improve Audit Mode & User Journey

The goal of this plan is to significantly enhance the "Audit Mode" experience, making it smoother, more actionable, and visually stunning. The current Audit Report (`report.html`) is basic and lacks actionable remediation steps, forcing the user to return to the cramped sidepanel to fix issues.

## User Review Required
> [!IMPORTANT]
> Please review the proposed changes to the UI and user journey. The redesign will introduce a more premium look for the `report.html` page and integrate remediation actions directly into the report.

## Open Questions
- Do you want to keep the small inline diffs in the `sidepanel.js` Preview Modal, or should we simplify the modal to just list the ASINs and have the user click into the rich `report.html` for details? (The plan assumes keeping a simplified version in the modal, but encouraging the use of the full report).
- Answer:  Simplify the modal to just list the ASINs and have the user click into the rich report.html for details.
## Proposed Changes

---

### Audit Report UI Redesign (`report.html` & `report.css`)
We will completely overhaul the standalone Audit Report to match modern, premium web design aesthetics.
- **Rich Aesthetics**: Implement a clean, modern interface using a sleek color palette, subtle glassmorphism effects, and dynamic hover states.
- **Actionable Header**: The header will display the Overall Score (calculated by `auditorEngine.js`), pass/fail metrics, and the product's main image.
- **Card-Based Layout**: Separate Text Audits, Visual Audits, and Growth Audits into distinct, beautifully styled cards.
- **Interactive Elements**: Add micro-animations for expanding sections and highlighting diffs.

#### [MODIFY] report.html
#### [MODIFY] report.css

---

### Actionable Report Logic (`report.js`)
Currently, remediation actions (Flat File Generation, Support Prompts) are only available in the sidepanel preview. We will bring these actions directly into the detailed report.
- **Import Agents**: Import `generateFlatFile` and `generateSupportPrompt` from `remediationAgent.js`.
- **Action Panel**: Add buttons for "Generate Flat File", "Auto-Fill in Seller Central", and "Copy Support Prompt" directly next to the identified discrepancies in the report.

#### [MODIFY] report.js

---

### Sidepanel User Journey (`sidepanel.js` & `sidepanel.html`)
Smooth out the experience in the extension sidepanel during the audit process.
- **Contextual Dashboard**: When switching to "Auditor Mode", update the Dashboard metrics to show "Avg Match Score" instead of "Avg LQS" (Listing Quality Score is more relevant for Scraper Mode).
- **Agent Console Updates**: Update the scanning status messages to explicitly say "Auditing ASIN..." rather than "Scraping..." when in Audit Mode.
- **Preview Modal Cleanup**: Streamline the preview modal to focus on high-level pass/fail status and provide a clear, prominent button to open the full detailed Diff Report.

#### [MODIFY] sidepanel.js
#### [MODIFY] sidepanel.html

---

## Verification Plan

### Manual Verification
1. **Initiate Audit**: Upload a catalogue template, map columns, and click "Audit Catalogue".
2. **Monitor Process**: Verify that the Agent Console clearly states it is Auditing and the Dashboard updates with relevant metrics (Avg Score).
3. **Open Report**: Click "View Diff Report" for a failed ASIN.
4. **Review UI**: Verify the new `report.html` is visually premium, responsive, and clearly displays diffs.
5. **Test Actions**: Click the new "Generate Flat File" or "Copy Support Prompt" buttons within the report to ensure they trigger the correct remediation logic.
