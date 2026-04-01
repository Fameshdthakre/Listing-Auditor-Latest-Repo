# Chrome Web Store Listing Updates

Use these text blocks to update your Chrome Web Store listing. They are optimized for transparency, user trust, and compliance with Chrome's Single Purpose policy.

---

## 1. Single Purpose Description
*This field tells the user (and the reviewer) exactly what the extension does in one sentence.*

**Draft:**
> "Automate Amazon product data extraction, audit listing quality scores (LQS), and detect content discrepancies between your catalogue and the live site."

---

## 2. Updated Privacy & Security Section
*Replace your existing "Privacy" block in the Store Description with this updated version. It discloses the error logging while emphasizing security.*

**🔒 PRIVACY & SECURITY**

*   **Local Data Processing:** Your scraped product data lives in your browser. We do not store your product leads, pricing strategies, or catalogue data on our servers.
*   **Anonymous Error Telemetry:** To ensure the scraper works reliably when Amazon updates their layout, we collect **anonymous error reports** (containing only the technical error and the specific URL where it failed). This allows us to fix broken selectors instantly. These logs **never** contain personal information.
*   **Secure Login:** We use official Google and Microsoft Authentication (OAuth2) to verify Pro users. We never see or store your passwords.
*   **Transparent Permissions:** We only request permissions necessary to scan the Amazon tabs you actively navigate to.

---

## 3. Justification for Permissions (Internal)
*If asked by the reviewer why you need "Host Permissions" or "Remote Code" (you don't use remote code, but for context):*

*   **"Why do you collect 'User Activity'?"**
    *   *Answer:* "We log technical errors (e.g., 'Scraper failed to find Title element') to monitor the health of our parsing logic. This is critical because the target website changes frequently."
