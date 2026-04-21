# Privacy Policy Updates for Error Logging

To ensure compliance with the Chrome Web Store Developer Program Policies, you must disclose the error logging functionality in two places:

---

## 1. Chrome Web Store Dashboard (Privacy Practices Tab)

When submitting your extension update, go to the **Privacy Practices** tab and update the following sections:

### **A. Data Collection**
You will be asked: *"Does your extension collect any user data?"*
*   **Answer:** Yes

**Select the following data types:**

1.  **Website Content** (Because you log the URL where the error happened)
2.  **User Activity** (Because you log that an action failed)

### **B. Justification**
For each data type selected above, you must provide a justification. Use this text:

> "We collect anonymous technical error logs (specifically the URL and the error message) when the extension fails to parse a webpage correctly. This allows us to identify when the target website (Amazon) has changed its layout, ensuring we can release a fix quickly. These logs contain no personal user information and are used solely for debugging and maintaining the functionality of the scraping tool."

---

## 2. Public Privacy Policy Document

Add the following section to your existing Privacy Policy (the URL linked in your store listing):

### **Error Logging and Telemetry**
To maintain the reliability of the Amazon Listing Auditor & Scraper, this extension may collect anonymous error reports when a technical failure occurs.

**What we collect:**
*   **Technical Error Messages:** Descriptions of internal code failures (e.g., "Selector #title not found").
*   **Contextual URLs:** The specific Amazon URL where the error occurred, to help us reproduce the issue.
*   **Extension Version:** To determine if the issue is specific to an older version.

**How we use this data:**
This data is sent securely to our private logging server (Firebase). It is used exclusively by our development team to identify bugs, fix broken scrapers, and improve software stability.

**What we do NOT collect:**
*   We do **not** log your browsing history outside of the specific pages where you actively use the extension.
*   We do **not** log any personally identifiable information (PII) such as names, email addresses, or shipping addresses in these error reports.
