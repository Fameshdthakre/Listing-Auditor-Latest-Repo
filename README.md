# Amazon Listing Auditor & Scraper

## 🚀 Overview
**Amazon Listing Auditor & Scraper** is a powerful Chrome Extension designed for Amazon Sellers, Aggregators, and Agencies. It automates the process of extracting detailed product data and auditing listing quality at scale. Whether you need to scrape thousands of ASINs for competitive intelligence or audit your own catalog for brand compliance, this tool provides a robust, browser-based solution.

---

## ✨ Key Capabilities

### 1. 🔎 Advanced Bulk Scraper
Turn Amazon pages into structured data instantly.
- **Bulk Input:** Paste a list of ASINs/URLs or upload a CSV file.
- **Multi-Marketplace Support:** Works across all major Amazon domains (.com, .co.uk, .de, .ca, .co.jp, and more) with zip-code localization.
- **Deep Extraction:** Captures over 50+ data points including:
  - **Identity:** ASIN, Title, Brand, URL.
  - **Pricing & Stock:** Buy Box Price, Stock Status, Basis Price (RRP).
  - **Content:** Bullet Points, Description, A+ Content presence.
  - **Media:** High-res Image Links, Video Counts, Brand Story presence.
  - **Variations:** Family structure, Themes, Child ASIN counts.
  - **Performance:** Ratings, Review Counts, BSR.
- **AOD (All Offers Display) Scraping:** Optional deep-dive to extract *all* sellers on a listing, not just the Buy Box winner.

### 2. 🛡️ Catalogue Auditor (Pro)
Ensure your listings match your "Golden Record".
- **Automated Auditing:** Import your expected product data (Title, Images, Variations, etc.) and let the tool compare it against live Amazon pages.
- **Detailed Discrepancy Reports:** Instantly spot:
  - Title or Bullet Point changes.
  - Missing Images or Videos.
  - Broken Variation Families (missing child ASINs).
  - Incorrect Buy Box winners or unauthorized sellers.
  - Delivery promise violations.
- **Visual Feedback:** Color-coded status indicators (🟢 Pass / 🔴 Fail / 🟠 Issue) for quick analysis.

### 3. 📊 Listing Quality Score (LQS)
Automatically grade every listing on a 0-100 scale based on best practices:
- **Title Length:** Checks for optimal SEO length (80-200 chars).
- **Image Count:** Verifies minimum of 7 images.
- **Content Depth:** Checks for 5+ bullet points and description length.
- **Rich Media:** Rewards A+ Content and Video presence.
- **Social Proof:** Factors in Rating (4.0+) and Review counts.

---

## 🛠️ Feature Highlights

*   **Smart Variation Analysis:**
    *   Extracts the full Variation Family structure.
    *   Identifies the Variation Theme (e.g., "Color", "Size").
    *   Verifies if your specific target ASIN exists within the family.
    *   Reports the total count of variations.

*   **Flexible Export Options:**
    *   **CSV / Excel (XLSX):** Download formatted reports directly.
    *   **Google Sheets Integration:** Push results to a Google Sheet with one click.
    *   **Excel Online (OneDrive):** Push results directly to your Microsoft OneDrive.

*   **User-Friendly UI:**
    *   **Side Panel Interface:** Browse Amazon while the tool works alongside you.
    *   **Dark/Light Mode:** Toggle themes for comfortable viewing.
    *   **Dynamic Panels:** Smart UI that expands/collapses based on your workflow.

---

## 🚀 How to Use

### Installation
1.  Download or Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer Mode** (toggle in the top-right).
4.  Click **Load Unpacked** and select the folder containing these files.

### Using Scraper Mode
1.  Click the extension icon to open the Side Panel.
2.  Select **Scraper Mode**.
3.  **Input:** Paste ASINs/URLs or click "Upload CSV".
4.  **Configure:** Choose your Marketplace (e.g., Amazon.com) and optionally set a Zip Code.
5.  **Select Attributes:** Check the data points you want (or "Select All").
6.  Click **Start Bulk Scraping**.
7.  **Export:** Once finished, download the CSV/Excel or push to Cloud.

### Using Auditor Mode
1.  Switch to **Auditor Mode** (requires login).
2.  **Create Catalogue:** Upload a template file containing your "Expected" data (Golden Record).
3.  **Audit:** The tool will scan the live pages and compare them against your catalogue.
4.  **Review:** Check the "Results" section for discrepancies and export the Audit Report.

---

## 🔒 Privacy & Security
*   **Local Processing:** All scraping logic runs locally in your browser.
*   **No External Database:** Your product data is stored in your browser's local storage, not sent to a third-party server (unless you explicitly use the Google Drive/OneDrive export features).
*   **Authentication:** Uses standard Google/Microsoft OAuth for cloud export features only.

---

## 📝 Feedback
Enjoying the app? We'd love to hear from you!
[Rate us 5 🌟 stars & leave a review!](https://chromewebstore.google.com/detail/listing-auditor-for-amazo/eaafadfoabnnmbbgciiikcngpmmlglkh)
