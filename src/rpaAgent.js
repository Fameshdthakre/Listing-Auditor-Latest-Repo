// src/rpaAgent.js - Content script for RPA Auto-Fill on Seller Central

/**
 * Smartly injects data into a given input/textarea element and triggers framework events.
 * @param {string} selector - The CSS selector for the target input.
 * @param {string} value - The value to inject.
 */
function injectRpaData(selector, value) {
    const el = document.querySelector(selector);
    if (el) {
        // Handle React 15/16 value tracker bypass
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;

        if (el.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
            nativeTextAreaValueSetter.call(el, value);
        } else if (el.tagName === 'INPUT' && nativeInputValueSetter) {
            nativeInputValueSetter.call(el, value);
        } else {
            el.value = value;
        }

        // Dispatch events to notify the framework
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Add visual confirmation of the edit
        el.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        el.style.border = '1px solid #00FF00';
    } else {
        console.warn(`RPA Agent: Could not find target element for selector: ${selector}`);
    }
}

/**
 * Highlights the submit button and injects the human-in-the-loop warning.
 * @param {string} buttonSelector - The CSS selector for the submit button.
 */
function highlightSubmitButton(buttonSelector) {
    const btn = document.querySelector(buttonSelector);
    if (!btn) {
        console.warn(`RPA Agent: Could not find submit button: ${buttonSelector}`);
        return;
    }

    // Apply pulsing CSS outline
    btn.style.border = "3px solid #00FF00";
    btn.style.boxShadow = "0 0 15px #00FF00";
    btn.style.position = "relative";

    // Add pulsing animation if not already present
    if (!document.getElementById('rpa-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'rpa-pulse-style';
        style.textContent = `
            @keyframes rpaPulse {
                0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }
                70% { box-shadow: 0 0 0 15px rgba(0, 255, 0, 0); }
                100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); }
            }
        `;
        document.head.appendChild(style);
    }
    btn.style.animation = 'rpaPulse 2s infinite';

    // Inject warning div
    const warningDiv = document.createElement('div');
    warningDiv.innerHTML = '<strong>🤖 AI Auto-Filled:</strong> Please review the changes and click submit manually.';
    warningDiv.style.position = 'absolute';
    warningDiv.style.bottom = '100%';
    warningDiv.style.left = '50%';
    warningDiv.style.transform = 'translate(-50%, -10px)';
    warningDiv.style.backgroundColor = '#000';
    warningDiv.style.color = '#00FF00';
    warningDiv.style.padding = '8px 12px';
    warningDiv.style.borderRadius = '4px';
    warningDiv.style.fontSize = '12px';
    warningDiv.style.whiteSpace = 'nowrap';
    warningDiv.style.zIndex = '9999';
    warningDiv.style.pointerEvents = 'none';

    // To ensure it doesn't get hidden by overflow, we might need to attach to body
    // but positioned relative to the button
    const rect = btn.getBoundingClientRect();
    warningDiv.style.position = 'fixed';
    warningDiv.style.top = `${rect.top - 40}px`;
    warningDiv.style.left = `${rect.left + (rect.width / 2)}px`;
    warningDiv.style.transform = 'translate(-50%, 0)';

    document.body.appendChild(warningDiv);

    // Update position on scroll
    window.addEventListener('scroll', () => {
        const newRect = btn.getBoundingClientRect();
        warningDiv.style.top = `${newRect.top - 40}px`;
        warningDiv.style.left = `${newRect.left + (newRect.width / 2)}px`;
    });
}

// Ensure the page has loaded sufficiently
window.addEventListener('load', () => {
    // Give Seller Central SPA a bit of time to render
    setTimeout(() => {
        chrome.storage.local.get(['rpaPayload'], (data) => {
            const payload = data.rpaPayload;
            if (payload && payload.fields) {
                console.log("RPA Agent: Payload found. Beginning Auto-Fill...", payload);

                // Seller Central uses varying dynamic IDs, so we use heuristic selectors.
                // We will attempt multiple common selectors.

                const { title, bullets, description } = payload.fields;

                if (title) {
                    // Example selectors for Title (Item Name)
                    injectRpaData('input[name="item_name"], input[name="title"], input[id*="item_name"]', title);
                }

                if (bullets) {
                    // Example selectors for Bullets
                    // Bullets are often split into multiple inputs, or a single textarea
                    // For a basic implementation, we target the first bullet input or a generic bullet textarea
                    const bulletLines = bullets.split(/\r?\n/).filter(line => line.trim().length > 0);
                    bulletLines.forEach((line, index) => {
                         injectRpaData(`input[name="bullet_point[${index}]"], input[id*="bullet_point_${index}"]`, line.replace(/^-\s*/, ''));
                    });
                }

                if (description) {
                    // Example selectors for Product Description
                    injectRpaData('textarea[name="product_description"], textarea[id*="product_description"]', description);
                }

                // Highlight submit button
                // Target common "Save and finish" or "Submit" buttons
                highlightSubmitButton('button[type="submit"], input[type="submit"][value="Save and finish"], .a-button-input[type="submit"]');

                // Optionally, clear the payload after successful run to prevent re-triggering on normal reloads
                chrome.storage.local.remove(['rpaPayload']);
            }
        });
    }, 3000); // 3s delay for SPA frameworks
});
