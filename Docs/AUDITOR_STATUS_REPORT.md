# Auditor Mode Status Report

## 1. Current Capabilities
Currently, the "Auditor Mode" performs a robust **Image Comparison**, but it lacks depth in other areas.

*   **Image Auditing:**
    *   Extracts images from Vendor Central (VC) and Amazon PDP.
    *   Compares them by Image ID (file hash).
    *   Identifies: Matches, Missing on PDP, Extra on PDP, and Duplicates.
    *   Status: **COMPLETE**

*   **Basic Page Checks:**
    *   Detects 404 Page Not Found.
    *   Detects Redirects (ASIN mismatch).
    *   Status: **COMPLETE**

*   **Data Extraction (But Not Comparison):**
    *   `content.js` successfully scrapes a massive amount of data (Title, Bullets, Description, A+, Videos, Price, Stock, BSR).
    *   **However:** `Comparator.js` ignores 90% of this data. It passes it through to the final result, but it does not perform a "Diff" (VC vs PDP) on it.

## 2. Missing Comparisons (The Gaps)
The user wants to "accurately audit all points". The following data is scraped but **NOT audited** (compared):

| Data Point | VC Source (Catalog) | PDP Source (Live) | Current Audit Status |
| :--- | :--- | :--- | :--- |
| **Title** | `item_name` | `metaTitle` | ❌ No Comparison |
| **Description** | `product_description` | `description` | ❌ No Comparison |
| **Bullets** | `bullet_points` (Array) | `bullets` (String/Array) | ❌ No Comparison |
| **Price** | `list_price` | `displayPrice` | ❌ No Comparison |
| **Images Count** | `images.length` | `items.length` | ✅ Done |
| **Videos** | (Not currently scraped in VC) | `videos` | ⚠️ One-sided (Only checks existence on PDP) |
| **A+ Content** | (Not currently scraped in VC) | `aPlusImgs` | ⚠️ One-sided |

## 3. Proposed Roadmap for "Mastering Local Auditor"

To move forward, we need to update `Comparator.js` to perform the following checks:

### Phase 1: Text Comparison (Title & Description)
*   **Logic:** Normalize text (trim, lowercase) and compare VC Title vs PDP Title.
*   **Result:** Add `Title Match` (Boolean) and `Title Diff` (Show differences) to the report.

### Phase 2: Bullet Point Logic
*   **Logic:** Bullet points are tricky because order might change.
*   **Strategy:** Check if *every* VC bullet exists *somewhere* in the PDP bullets (fuzzy match).

### Phase 3: Price & Stock Audit
*   **Logic:** Compare `List Price` (VC) vs `Buybox Price` (PDP).
*   **Logic:** Check if item is `In Stock` on PDP.

### Phase 4: UI Updates
*   The current UI (Side Panel) likely focuses on images. We will need to update the frontend to display these new text discrepancies clearly (e.g., Red/Green text diffs).

## 4. Immediate Action Item
We should start by implementing **Phase 1 (Title/Description)** and **Phase 2 (Bullets)** in `Comparator.js`.
