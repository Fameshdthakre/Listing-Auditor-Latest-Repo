# Enhanced Safe Browsing Warning Guide

## The Issue
Users with "Enhanced Safe Browsing" enabled in Chrome may see a warning when installing or running the extension:
> "This extension is not trusted by Enhanced Safe Browsing."

## Why This Happens
This warning is **not** an indication of malicious code. It appears for extensions published by developers who have not yet established a sufficient "reputation" history with the Chrome Web Store.

Key triggers include:
1.  **New Developer Account:** The account is less than a few months old.
2.  **Low Install Count:** The extension has fewer than ~1,000 active users.
3.  **No History:** The developer has no other trusted extensions published.

## How to Improve Trust & Remove Warning

There is no "code fix" for this. Trust is earned over time. However, you can accelerate the process:

### 1. Complete Developer Verification
Ensure your CWS Developer Account is fully verified.
- Go to the **Chrome Web Store Developer Dashboard**.
- Ensure you have paid the registration fee.
- Verify your email and phone number.
- Ideally, verify a **Group Publisher** identity (Organization) rather than an individual email, as organizations build trust faster.

### 2. Update Privacy Practices
- Ensure your **Privacy Policy** link in the Store Listing is active and compliant.
- Ensure the **"Privacy practices"** tab in the Dashboard accurately reflects your permissions (e.g., `activeTab`, `scripting`). Over-requesting permissions delays trust.

### 3. Build User Base
- The warning usually disappears automatically once you reach a certain threshold of active users (varies, but typically 100-500) without policy violations.
- Encourage internal team usage first to build this history safely.

### 4. Featured Badge (Long Term)
- Aiming for the "Featured" or "Established Publisher" badge requires a clean history and high adherence to CWS policies. Once achieved, these warnings never appear.

## Immediate Workaround for Users
If users are blocked from installing:
1.  They can temporarily lower Safe Browsing to "Standard Protection" (not recommended).
2.  Or, simply click "Continue to Install" / "Proceed" if the option is presented (Chrome often allows override after a warning).
