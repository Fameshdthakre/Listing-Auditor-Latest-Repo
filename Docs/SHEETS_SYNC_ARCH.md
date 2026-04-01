# Google Sheets / Excel Online Sync Architecture

This document defines the architecture for "Option C": Using a Spreadsheet as the backend database for the Catalogue.

---

## 1. Core Principle: "Spreadsheet as Database"

Instead of hiding data in `chrome.storage` or Firestore, the extension treats a specific Google Sheet (or Excel file) as the **Source of Truth**.

*   **The User's View:** They see a file in their Drive named "Amazon Catalogue - Client A". They can edit it manually.
*   **The Extension's View:** It treats rows 2-N as records. Row 1 is the Schema Definition.

---

## 2. Data Structure (The Schema)

The extension relies on **Header Names**, not Column Indexes (A, B, C). This allows the user to rearrange columns without breaking the sync.

### **Required Headers (Strict)**
The extension searches for these exact strings in Row 1. If missing, it alerts the user or re-creates them.

| Header Name | Internal Key | Purpose |
| :--- | :--- | :--- |
| `ASIN` | `asin` | **Primary Key.** Unique Identifier. |
| `Status` | `lastScan.status` | Audit Result (OK, ERROR, ISSUE). |
| `Last Scan` | `lastScan.date` | Timestamp of last audit. |
| `Audit Note` | `lastScan.note` | Human readable result (e.g. "Title Mismatch"). |

### **Attribute Headers (Dynamic)**
Based on the "Audit Configuration", the extension maps columns to expected data.

| Header Name | Internal Key |
| :--- | :--- |
| `Expected Title` | `expected.title` |
| `Expected Price` | `expected.price` |
| `Expected Images` | `expected.images` |
| ... | ... |

---

## 3. Synchronization Logic (The "Hybrid Cache" Model)

Google Sheets API is too slow (500ms - 2s) for real-time UI interactions. We must use a **Local Cache**.

### **A. Storage Model**
*   **`spreadsheetId`**: Saved in `chrome.storage.local`. Links a Catalogue ID to a specific Sheet ID.
*   **`syncToken`**: Timestamp of the last successful sync.

### **B. The "Sync Down" (Read)**
*   **Trigger:** Extension Startup OR User clicks "Refresh".
*   **Action:**
    1.  Call `spreadsheets.values.get(spreadsheetId, 'A1:ZZ')`.
    2.  **Parse Headers:** Find index of `ASIN`, `Title`, etc.
    3.  **Parse Rows:** Convert Row Arrays `['B0...', 'Nike Shoe']` into Objects `{ asin: 'B0...', title: 'Nike Shoe' }`.
    4.  **Update Local:** Overwrite `chrome.storage.local` with this fresh data.
    5.  **Render:** Update UI.

### **C. The "Sync Up" (Write)**
*   **Trigger:** User audits an item (Status changes) OR adds a new item.
*   **Strategy:** **Batching is mandatory.** We cannot call the API 50 times for 50 items.
    *   *Scenario 1 (Single Edit):* User adds 1 ASIN. -> Immediate API call (`spreadsheets.values.append`).
    *   *Scenario 2 (Bulk Audit):* User scans 100 items. -> Wait for scan complete -> **Bulk Update**.
*   **Action (Bulk Update):**
    1.  Read current Sheet Data (to map ASINs to Row Numbers).
    2.  Construct a `batchUpdate` payload.
    3.  Send one large HTTP POST.

---

## 4. Conflict Resolution

**Scenario:** User changes Title in Sheet. User also changes Title in Extension. Who wins?

**Policy: "Sheet is King"**
Since the Sheet is the "Database", external edits are treated as the truth during a Sync Down.
*   *Exception:* If the user just finished a Scan in the extension, the Extension forces a Sync Up to update the "Status" columns in the sheet.

---

## 5. Implementation Steps (Developer Guide)

### **Phase 1: Authentication & Permissions**
1.  **Google:** Ensure `manifest.json` has `oauth2` scopes:
    *   `https://www.googleapis.com/auth/spreadsheets` (Read/Write).
    *   `https://www.googleapis.com/auth/drive.file` (Create/Organize).
2.  **Microsoft:** Ensure Entra ID App has `Files.ReadWrite`.

### **Phase 2: The `SheetManager` Class**
Create `src/utils/SheetManager.js`. This class handles the complexity.

```javascript
class SheetManager {
  constructor(token) { this.token = token; }

  async createCatalogue(name) {
    // 1. Create Spreadsheet
    // 2. Add Header Row
    // 3. Return spreadsheetId
  }

  async fetchRows(spreadsheetId) {
    // 1. Get values
    // 2. Map Headers -> Indexes
    // 3. Return Array of Objects
  }

  async updateRows(spreadsheetId, updates) {
    // updates = [{ asin: 'B0...', status: 'OK' }]
    // 1. Fetch current Sheet (to find Row # for each ASIN)
    // 2. Construct 'A1' notation ranges
    // 3. Call batchUpdate
  }
}
```

### **Phase 3: UI Integration**
1.  **"New Catalogue" Modal:**
    *   Add Option: "Type: Local (Guest)" vs "Type: Google Sheet (Pro)".
2.  **Catalogue Header:**
    *   Show "🟢 Linked" status.
    *   Add "🔗 Open Sheet" button.
    *   Add "🔄 Force Sync" button.

---

## 6. Input Required from You (User)

1.  **Project Setup:** You must enable the **Google Sheets API** in your Google Cloud Console project (where you got the OAuth Client ID).
2.  **Quota Check:** Verify your project has standard quotas enabled (usually 60 requests/min/user is default and sufficient).
