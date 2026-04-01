# Future Development Roadmap & Feature Architecture

This document summarizes the strategic discussions and agreed-upon architectures for future features of the Amazon Listing Auditor extension.

---

## 1. Advanced Auditing Strategy: "Three-Way Match"

**Objective:** Solve the "Agency vs. Amazon" synchronization problem by determining exactly where an update is stuck.

**The Three States:**
1.  **Target State (SharePoint/Input):** The "Golden Record" (what the listing *should* look like).
2.  **Backend State (Vendor Central):** What is currently uploaded/loaded in Amazon's backend system.
3.  **Live State (PDP):** What the customer actually sees on Amazon.com.

### The "Traffic Light Protocol" (Decision Logic)
We will implement logic to classify discrepancies into actionable statuses:

| Target vs. Live (PDP) | Target vs. Backend (VC) | **Diagnosis** | **Action Required** |
| :--- | :--- | :--- | :--- |
| ✅ Match | (Ignored) | **Synced** | None. |
| ❌ Mismatch | ❌ Mismatch | **Gap in Backend** | **UPLOAD.** The new content isn't in Vendor Central yet. |
| ❌ Mismatch | ✅ Match | **Stuck / Pending** | **MONITOR.** Content is uploaded but Amazon hasn't published it. Do not re-upload. |

---

## 2. Visual Audit Automation (AI-Powered)

**Problem:** Standard scrapers cannot access private SharePoint links to get "Target Images" for comparison.
**Solution:** A "Human-in-the-Loop" workflow augmented by AI, bypassing the SharePoint API complexity.

### Architecture: "AI Traffic Controller"

#### A. Input Method (Bypassing SharePoint API)
*   **Batch File Input:** Instead of CSV links, the user drags & drops a folder of "New Images" (Golden Record) directly into the Extension UI.
*   *Why:* This is secure, instant, and requires no complex authentication with corporate SharePoint.

#### B. The Process
1.  **User Action:** Drag & Drop reference images into the Auditor tab.
2.  **Automated Scrape:** Extension scrapes current **VC Images** and **PDP Images**.
3.  **Cloud Analysis:**
    *   The extension sends the 3 sets of images (Target, VC, PDP) to our secure **Cloud Function**.
    *   **AI Vision Model (e.g., GPT-4o, Gemini 1.5):** The function sends the images to a Multimodal AI.

#### C. The Prompt Logic
The AI will be asked to perform the "Visual Three-Way Match":
> *"Compare Image A (Target) with Image B (Backend) and Image C (Live).
> 1. Is C visually identical to A? (Yes/No)
> 2. Is B visually identical to A? (Yes/No)
> 3. If No, describe the specific difference (e.g., 'Old logo', 'Missing badge')."*

#### D. The Output
The extension displays a dashboard with:
*   **🟢 PASS**
*   **🔴 UPLOAD REQUIRED** (Backend mismatch)
*   **🟠 STUCK** (Backend matches Target, but Live is old)

---

## 3. Security Architecture (Backend-for-Frontend)

**Principle:** Never store secrets (API Keys, Service Accounts) in the Chrome Extension.

### The "Trusted Middleware" Pattern
To support AI features and Database logging securely:

1.  **The Extension (Client):**
    *   Holds **zero secrets**.
    *   Authenticates the user via **Google/Microsoft OAuth**.
    *   Sends an HTTP POST request to our **Cloud Function** with the User Token + Data (e.g., images to analyze).

2.  **The Cloud Function (Server):**
    *   Holds the **OpenAI API Key** and **Firebase Admin Credentials** (stored in Google Secret Manager or Environment Variables).
    *   Verifies the User Token.
    *   Calls the third-party API (OpenAI/Firestore).
    *   Returns only the *result* to the extension.

**Status:** A Firebase Cloud Function logging architecture was previously implemented and has been archived (See `Docs/FIREBASE_LOGGING_ARCHIVE.md`). Future AI features will simply add new Cloud Functions following this same pattern.

---

## 4. Dynamic "Audit Rules Engine"

**Objective:** Move away from hardcoded audit types (e.g., "Content Audit") to a flexible, user-defined logic builder. This allows users to create their own Standard Operating Procedures (SOPs).

### The Concept: "If This Then That" (IFTTT) for Amazon
Users define rules using natural language selectors in the UI.

#### A. UI Design
*   **Target:** `[ Dropdown: Live Field ]` (e.g., Title, Price, Image Count, Sold By)
*   **Operator:** `[ Dropdown: Comparison ]` (e.g., Equals, Contains, Greater Than, Is Not Empty)
*   **Source:** `[ Dropdown: Reference ]` (e.g., Expected Value, Static Value '7', Backend Value)

#### B. Storage Structure
Instead of boolean flags (`auditContent: true`), we store a JSON array of rule objects:

```json
"activeRules": [
  { "field": "metaTitle", "op": "equals", "ref": "expected.title", "name": "Title Check" },
  { "field": "imageCount", "op": "gte", "ref": 7, "name": "Image Compliance" },
  { "field": "soldBy", "op": "contains", "ref": "Amazon", "name": "Sold By Amazon" }
]
```

#### C. Architectural Shift
*   **Current State:** `auditorEngine.js` has static functions like `auditContent()`, `auditImages()`.
*   **Future State:**
    *   `auditorEngine.js` will contain a generic iterator: `evaluateRules(liveData, rules)`.
    *   `Comparator.js` will export a library of operators: `Ops.equals(a, b)`, `Ops.contains(a, b)`.
    *   This decouples the *Check Logic* from the *Business Logic*.

### Benefit
*   **Scalability:** Agencies can create "Preset Profiles" (e.g., "Client A Strict Audit", "Client B Loose Audit").
*   **Agility:** If Amazon adds a new field (e.g., "Sustainability Badge"), we update the Scraper, and the user can immediately create a rule for it without waiting for a code update to the Auditor logic.

---

## 5. Competitive Strategy: The "Audit" Niche

**Context:** Tools like **Hopted** successfully connect Amazon Seller/Vendor APIs to Google Sheets, providing robust operational data (Sales, Inventory).

**Our Strategic Positioning:**
We do NOT compete on "Operational Reporting". We compete on **"Integrity & Compliance Auditing"**.

### Hopted vs. Listing Auditor

| Feature | Hopted (The Competitor) | Listing Auditor (Us) |
| :--- | :--- | :--- |
| **Data Source** | **API Only** (Backend Truth) | **Hybrid** (API + **Scraping**) |
| **Primary User** | Operations / Finance Manager | Brand Manager / Content Agency |
| **Problem Solved** | "I need to restock inventory." | "Why is my image broken on the site?" |
| **Blind Spot** | ❌ Cannot see what the customer sees (PDP). Assumes API is correct. | ✅ **Scrapes the PDP** to validate the live customer experience. |

### The "Killer Feature": Validation
We position ourselves as the **Quality Control Layer** that validates the data from other tools.

*   **The Workflow:**
    1.  **Fetch Backend (API):** We (eventually) pull the "Intended Data" from Seller Central via API (like Hopted).
    2.  **Scrape Frontend (Live):** We scrape the actual PDP.
    3.  **Detect "Silent Killers":** We flag discrepancies that APIs miss (e.g., Search Suppression, Glitched Images, Lost BuyBox due to unauthorized sellers).

**Conclusion:** We adopt the "Spreadsheet Sync" architecture (see `SHEETS_SYNC_ARCH.md`) to match their convenience, but we differentiate by solving the **Content & Sync** problems that pure API tools cannot see.
