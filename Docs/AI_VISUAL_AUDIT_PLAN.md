# AI-Powered Visual Audit & Local Image Analysis Plan

## 1. Executive Summary
This document outlines the architecture, workflow, and implementation strategy for the **Visual Audit Automation (AI-Powered)** feature in the Amazon Listing Auditor extension. 

The core challenge is the "Three-Way Match" (Agency/Target vs. Vendor Central vs. Live Amazon PDP) when Target images are stored in secure environments (like corporate SharePoints or local hard drives) that standard scrapers cannot access. 

**The Solution:** A "Human-in-the-Loop" workflow augmented by a Multimodal AI. The user securely uploads their local "Golden Record" images directly into the browser extension. The extension scrapes the Live PDP images (and Vendor Central images if authenticated). These image sets are sent to a secure Cloud Function, which utilizes an AI Vision Model (e.g., GPT-4o, Gemini 1.5 Pro) to visually analyze and compare them, returning actionable discrepancy reports.

---

## 2. Architecture: "The Trusted Middleware Pattern"

To maintain security and prevent exposing sensitive API keys within the Chrome Extension, we will use a Backend-for-Frontend (BFF) architecture via Cloud Functions (e.g., Firebase Cloud Functions or AWS Lambda).

### System Components:
1.  **Chrome Extension (Client):**
    *   **UI:** Provides a drag-and-drop interface in the Side Panel for users to upload local reference images.
    *   **Data Collection:** Reads local files and converts them to Base64 strings. Scrapes Live PDP image URLs (and VC image URLs) via content scripts.
    *   **Authentication:** Authenticates the user via existing OAuth flows to ensure only authorized users access the AI backend.
    *   **API Caller:** Sends the Base64 Target images and scraped Live/VC image URLs to the secure Cloud Function. Displays results to the user.

2.  **Cloud Function (Server / Middleware):**
    *   **Security:** Holds the secrets (OpenAI/Gemini API Keys) securely using Secret Manager. Validates the User Auth Token.
    *   **Processing:** Receives the payload (Base64 local images + Live/VC URLs). 
    *   **AI Invocation:** Constructs the prompt and sends the image data to the Multimodal AI.
    *   **Response:** Parses the AI's response and returns structured JSON (Pass/Fail, reason) back to the extension.

3.  **Multimodal AI (Vision Model):**
    *   GPT-4o or Gemini 1.5 Pro, capable of processing multiple images and understanding visual nuances (logos, badges, text, product variations).

---

## 3. Workflow: Visual "Three-Way Match"

### The User Journey
1.  **Input:** The user opens the Auditor Mode in the Side Panel.
2.  **Upload:** The user clicks a new "Visual Audit" button and drag-and-drops a folder of images (or selects specific files) corresponding to a specific ASIN. These are the **Target Images (Golden Record)**.
3.  **Initiate:** The user clicks "Run Visual Audit".
4.  **Extraction:** The extension silently opens the Live Amazon PDP (and Vendor Central, if configured) and extracts the active image URLs.
5.  **Processing:** The extension displays a loading state ("AI analyzing images..."). Behind the scenes, the Cloud Function runs the comparison.
6.  **Results:** The UI updates with a visual dashboard indicating:
    *   **🟢 MATCH (Synced):** Live matches Target.
    *   **🔴 UPLOAD REQUIRED (Gap in Backend):** Live and VC do not match Target. Action: Agency must upload the new images.
    *   **🟠 STUCK / PENDING (Amazon Delay):** VC matches Target, but Live does *not*. Action: The images are stuck in Amazon's publishing queue. Do not re-upload.

---

## 4. Technical Implementation Steps

### Phase 1: Client-Side UI & Image Handling
*   **Update `sidepanel.html`:** Add a dedicated "Visual Audit" section or modal with a drag-and-drop zone (`<input type="file" multiple accept="image/*">`).
*   **Update `sidepanel.js`:** 
    *   Add event listeners for file drops/selections.
    *   Implement a `FileReader` loop to read selected files and convert them to optimized Base64 data URLs.
    *   *Optimization Note:* Compress/resize images client-side before sending to the Cloud Function to save bandwidth and AI token costs (e.g., scale down to max 1024px width while maintaining aspect ratio).

### Phase 2: Cloud Function Middleware
*   **Setup:** Create a new endpoint (e.g., `visualAuditCompare`).
*   **Input Validation:** Ensure payload contains `targetImages` (Base64), `liveImages` (URLs), and optionally `vcImages` (URLs).
*   **AI Integration:** Implement the API call to OpenAI (GPT-4o) or Google Gemini.

### Phase 3: The AI Prompt Logic
The AI must act as a meticulous QA auditor. 

**Example System Prompt:**
> You are an expert Amazon Listing Quality Auditor. Your job is to perform a strict visual comparison between a set of "Target" reference images and sets of "Live" and "Backend" images.
> 
> You will receive three sets of images:
> 1. Set A: TARGET (The Golden Record)
> 2. Set B: LIVE (Currently on Amazon PDP)
> 3. Set C: BACKEND (Currently in Vendor Central) - *Optional*
> 
> Instructions:
> 1. Compare Set B to Set A. Are they visually identical in content, order, and graphical elements (badges, text overlays)?
> 2. If Set C is provided, compare Set C to Set A. Are they visually identical?
> 3. Identify specific discrepancies (e.g., "Image 2 in Live is missing the 'New' badge present in Target", "Image order is swapped", "Live is showing an older packaging version").
> 
> Output Format (Strict JSON):
> {
>   "liveMatch": boolean,
>   "backendMatch": boolean,
>   "liveDiscrepancies": ["string", "string"],
>   "backendDiscrepancies": ["string"],
>   "status": "SYNCED" | "UPLOAD_REQUIRED" | "STUCK"
> }

### Phase 4: Integration & Display
*   **Update `auditorEngine.js`:** Create a new function `auditVisuals(localImages, liveImages, vcImages)` that calls the Cloud Function.
*   Merge the AI results into the existing `runAuditComparison` report structure.
*   **Update `sidepanel.js`:** Render the AI feedback in the UI, highlighting discrepancies with thumbnail previews if possible.

---

## 5. Security & Privacy Considerations
1.  **No Local Storage Persistance:** Base64 representations of local files should be kept in memory only for the duration of the audit and not permanently saved to `chrome.storage` to prevent bloating the extension data limits.
2.  **Auth Guard:** The Cloud Function MUST verify the user's OAuth token before processing the images to prevent unauthorized API usage and token draining.
3.  **Data Retention:** The Cloud Function should not store the images; it should act only as a pass-through to the AI API.

## 6. Future Enhancements
*   **A+ Content Auditing:** Expand the prompt to analyze A+ content layout and images against local design files.
*   **Text/Copy Extraction (OCR):** Ask the AI to read text off the packaging in the image and verify it matches the textual 'Golden Record' data (e.g., ensuring the ingredients list on the back-of-pack image matches the text in the description).