# Amazon Listing Auditor & Scraper - AI Developer Guide

## 🚀 Project Overview
This repository contains a **Chrome Extension (Manifest V3)** designed for Amazon Sellers and Agencies. Its primary purpose is to automate the extraction of product data ("Scraper Mode") and verify the accuracy of live listings against a "Golden Record" ("Auditor Mode").

**Tech Stack:**
*   **Vanilla JavaScript (ES6+):** No build steps, no React/Vue/TypeScript. Direct DOM manipulation.
*   **HTML/CSS:** Standard web technologies for the Side Panel UI.
*   **Chrome Extension APIs:** Heavily relies on `chrome.sidePanel`, `chrome.scripting`, `chrome.storage.local`, `chrome.tabs`, `chrome.alarms`, and `chrome.identity`.
*   **External Libs:** `xlsx.full.min.js` (SheetJS) for Excel I/O.

---

## 🏗️ Core Architecture

### 1. `sidepanel.html` & `sidepanel.js` (The Frontend)
*   **Role:** The main UI. It manages user input, file uploads (Excel/CSV), configuration (checkboxes), and results display.
*   **State:** Uses `chrome.storage.local` to persist the application state (`auditState`) so the process continues even if the panel is closed.
*   **Communication:** Sends messages (`START_SCAN`, `STOP_SCAN`) to `background.js`. Receives updates via storage changes or messages.
*   **Catalogue Logic:** Manages the "Auditor Mode" catalogues. A catalogue contains items (ASINs) + Defaults (Marketplace, Zipcode, Language).

### 2. `background.js` (The Orchestrator)
*   **Role:** The brain. It manages the long-running scraping queue (`processBatch`).
*   **Process:**
    1.  Receives a list of URLs/ASINs.
    2.  Create a hidden/inactive tab for each URL (or active if AOD/Portal scraping is required).
    3.  Injects `content.js` to extract data.
    4.  Stores results in `chrome.storage.local`.
    5.  Closes the tab and waits random intervals to behave like a human.
*   **Key Feature - Dual Scraping:** If "Image Audit Source" is set to Vendor/Seller Central, `background.js` will scrape the Live PDP *and* the Portal URL (VC/SC) sequentially for the same item.

### 3. `content.js` (The Worker)
*   **Role:** Runs inside the Amazon page. Scrapes DOM elements.
*   **Key Logic:**
    *   **"Mega GoldMine":** Extracts hidden JSON data (Twister data, ColorImages) from page `<script>` tags to get variation and image details that aren't always in the DOM.
    *   **AOD (All Offers Display):** Logic to click the "See All Buying Options" drawer and scroll through it. **Critical:** This requires the tab to be focused/visible to trigger dynamic loading.
    *   **Portal Scraping:** Detects if it's on `vendorcentral.amazon` or `sellercentral.amazon` and scrapes image grids specifically.

### 4. `auditorEngine.js` (The Logic)
*   **Role:** Pure function logic for comparing "Live Data" (from `content.js`) vs "Source Data" (from Excel/Portal).
*   **Key Algorithms:**
    *   `smartNormalize`: Removes punctuation/stopwords for fuzzy text matching (Title/Desc).
    *   `auditContent`: Checks bullet points individually (detects reordering).
    *   `parseAmazonDate`: Converts "Tomorrow", "Feb 20" into real Dates to calculate delivery delays.

---

## 🔑 Key Features & Logic constraints

### 1. Auditor Mode - Text Matching
*   **Requirement:** Title and Description comparisons must be **"Smart"**. Ignore symbols, punctuation, and common words (a, the, and).
*   **Requirement:** Bullet points must be checked individually. Order changes are "Passed" but noted as "(Reordered)".

### 2. Image Audit Source Switch
*   **Modes:**
    *   **Catalogue:** Compare PDP images against URLs in the Excel file.
    *   **Vendor Central (VC) / Seller Central (SC):** Compare PDP images against what is currently loaded in the user's VC/SC account.
*   **Constraint:** This requires the user to be logged into VC/SC in the browser. The extension creates a tab to the specific image manager URL (`/imaging/manage?asins=...`) to scrape the "truth".

### 3. Catalogue Defaults
*   **Workflow:** When creating a catalogue, the user sets a Default Marketplace, Zipcode, and Language (English/Native).
*   **Usage:**
    *   **URL Construction:** The scraper builds URLs based on these defaults (e.g. `amazon.de/dp/ASIN?language=en_GB` if English is selected).
    *   **Location:** The scraper attempts to set the Zipcode cookie for the specific domain before scanning.

### 4. AOD (All Offers Display)
*   **Constraint:** Amazon Lazy-loads offers in the sidebar.
*   **Mechanism:** `content.js` takes control of the scroll container. `background.js` has a "Focus Queue" mechanism to force the tab to the front because Chrome throttles JS in background tabs, breaking the infinite scroll. **Do not remove the focus logic.**

---

## 🛠️ Developer Tips (For AI Agents)

1.  **Do Not Break the Build:** There is no build step. Ensure `import` statements in `sidepanel.js` / `background.js` are valid for a browser environment (ES Modules).
2.  **Storage Limits:** We use `chrome.storage.local`. Be mindful of quota bytes if storing massive datasets (though `unlimitedStorage` permission is usually active).
3.  **Selectors:** Amazon changes CSS classes often. Prefer ID selectors or stable attributes (`data-cel-widget`, `data-csa-c-slot-id`) over generic classes (`.a-size-small`).
4.  **CSV/Excel Mapping:** In `auditorEngine.js`, the `normalizeSourceData` function has extensive mapping for user column names (e.g. `Reference BSR` vs `ReferenceBSR`). Maintain this robustness if adding new columns.
