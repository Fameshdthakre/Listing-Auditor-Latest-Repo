/**
 * notifier.js - Handles chrome.notifications for critical audit findings.
 */

export class AuditNotifier {
    /**
     * Triggers a system notification for a critical change.
     * @param {string} asin - The affected ASIN.
     * @param {string} issueType - Short description of the issue.
     * @param {string} details - Detailed message.
     */
    static notify(asin, issueType, details) {
        if (!chrome.notifications) {
            console.warn("Notifications API not available.");
            return;
        }
        chrome.notifications.create(`audit_alert_${asin}_${Date.now()}`, {
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: `🚨 ${issueType}: ${asin}`,
            message: details,
            priority: 2,
            buttons: [
                { title: 'View Report' },
                { title: 'Remediate' }
            ]
        });
    }
}

// Handle notification button clicks (Safely)
if (chrome.notifications && chrome.notifications.onButtonClicked) {
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
        const parts = notificationId.split('_');
        const asin = parts[2];

        if (buttonIndex === 0) {
            // View Report
            chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?asin=${asin}`) });
        } else if (buttonIndex === 1) {
            // Remediate (Open sidepanel to remediation section if possible, or just focus)
            chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        }
    });
}
