# Chrome Web Store Submission & Privacy Guide

This document contains the specific text and justifications needed for your Chrome Web Store submission, ensuring compliance with the latest policies regarding Proxies and User Data.

---

## 1. Permission Justifications (For Store Dashboard)

When asked "Why does your extension require this permission?", use these precise explanations:

### `proxy`
> "This extension includes a 'Scraper Mode' that allows users to audit their Amazon listings. To prevent rate-limiting and ensure reliable data retrieval during bulk audits, the extension allows users to configure and rotate their own custom proxy servers. The proxy permission is used strictly to route these audit requests through the user's provided proxies during an active scan. Control is released immediately when the scan stops."

### `declarativeNetRequest`
> "This permission is used for two purposes: 
> 1. To rotate the User-Agent header during bulk audits, ensuring the scraper mimics diverse browser traffic.
> 2. To inject 'Proxy-Authorization' headers for the user's custom proxies, enabling seamless authentication without interrupting the user with login prompts. 
> These rules are applied only to traffic targeting Amazon domains and are cleared when the audit is finished."

### `storage`
> "Used to store the user's preferences, including their saved proxy list, audit templates, and temporary scrape results. All data is stored locally on the device."

### `identity`
> "Used to authenticate users via Google or Microsoft OAuth for access to premium features (like Cloud Export). No personal data is stored beyond the session token."

---

## 2. Privacy Policy Addendum (To Add to Your Site)

Add these sections to your existing Privacy Policy to cover the new features:

### **Network Settings & Proxies**
We value your control over your browsing experience. Our extension includes features to modify your network settings (specifically Proxy and User-Agent configuration) **only** under the following strict conditions:
*   **User Action Required:** Network modifications are only active when you explicitly click "Start Scan" or "Audit".
*   **Local Storage:** Any proxy credentials (IP, Port, Username, Password) you enter are stored **locally** on your device using Chrome's secure storage API. We do not transmit these credentials to our servers or any third party.
*   **Automatic Cleanup:** The extension is designed to automatically revert your Proxy and User-Agent settings to the system default immediately after a task completes or when you click "Stop".

### **Data Handling (Scraping)**
*   **Local Processing:** Data extracted from Amazon product pages is processed locally within your browser.
*   **No Remote Collection:** We do not harvest or collect the scraped product data on our servers unless you explicitly choose to use a "Cloud Export" feature (e.g., Google Sheets/Drive), in which case the data is transmitted directly to the respective service provider via secure APIs.

---

## 3. Store Listing "Best Practices"

To avoid rejection for "Misleading Functionality":

1.  **Screenshots:** You **MUST** include a screenshot of the **Settings > Proxy Configuration** page in your Store Listing images. This proves to the reviewer that the proxy feature is a visible, user-configurable part of the UI, not hidden malware.
2.  **Description:** Add a bullet point to your store description:
    *   *"Advanced Scraper Options: Configure custom proxies and User-Agent rotation for reliable bulk auditing."*
