# Firebase Error Logging Setup Guide

This guide explains how to set up the Firebase Cloud Function required to receive error logs from the extension.

## 1. Firebase Project Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **Create a project** (e.g., `amazon-auditor-logs`).
3.  Navigate to **Firestore Database** in the sidebar.
    *   Click **Create database**.
    *   Choose a location (e.g., `nam5 (us-central)`).
    *   Start in **Production mode**.
4.  Navigate to **Functions** in the sidebar.
    *   Click **Upgrade project** if prompted (Functions require the Blaze / Pay-as-you-go plan, but the free tier is generous).

## 2. Deploy the Cloud Function

You need to deploy a simple Node.js function that receives the error logs and writes them to Firestore.

### A. Prerequisites
*   Install Node.js.
*   Install Firebase Tools: `npm install -g firebase-tools`
*   Login: `firebase login`

### B. Initialize Functions
1.  Create a folder `server-functions` outside your extension repository.
2.  Run `firebase init functions`.
3.  Select your project.
4.  Choose **JavaScript**.
5.  Install dependencies: `cd functions && npm install`

### C. The Function Code (`functions/index.js`)
Replace the contents of `index.js` with this:

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.logClientError = functions.https.onRequest(async (req, res) => {
  // 1. CORS Headers (Allow all origins or restrict to your extension ID)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  // Handle Preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // 2. Parse Data
  const { message, url, version, action, userAgent } = req.body;

  if (!message) {
    res.status(400).send("Missing message");
    return;
  }

  // 3. Create Unique Error ID (Group by Message + Version)
  // Simple sanitizer to make valid Doc ID
  const sanitizedMsg = (message || "").substring(0, 50).replace(/[^a-z0-9]/gi, "_");
  const errorId = `${sanitizedMsg}_${(version || "unknown").replace(/\./g, "_")}`;

  const docRef = db.collection("extension_errors").doc(errorId);

  try {
    // 4. Atomic Increment & Update
    await docRef.set({
      message: message,
      version: version || "unknown",
      lastOccurred: admin.firestore.FieldValue.serverTimestamp(),
      count: admin.firestore.FieldValue.increment(1),
      exampleUrl: url || "unknown",
      action: action || "unknown",
      latestUserAgent: userAgent || "unknown"
    }, { merge: true });

    res.status(200).send({ status: "logged" });
  } catch (e) {
    console.error("Write Error", e);
    res.status(500).send("Internal Error");
  }
});
```

### D. Deploy
Run: `firebase deploy --only functions`

After deployment, Firebase will give you a **Function URL**. It looks like:
`https://us-central1-your-project.cloudfunctions.net/logClientError`

## 3. Configure the Extension

1.  Copy the **Function URL** from step 2D.
2.  Open `src/utils/logger.js` in your extension code.
3.  Replace the placeholder `LOG_API_URL` with your real URL.

```javascript
const LOG_API_URL = "https://us-central1-your-project.cloudfunctions.net/logClientError";
```

## 4. Chrome Web Store Compliance

When you submit your extension, you must declare this data collection:

1.  **Privacy Practices Tab:**
    *   **Data Collected:** Check "Website Content" (URL) and "User Activity" (Errors).
    *   **Purpose:** Check "Debugging or Troubleshooting".
2.  **Justification:**
    *   "The extension collects anonymous error logs (stack traces and URLs where the scraper failed) to identify and fix parsing issues caused by changes in the target website's layout."
3.  **Privacy Policy:**
    *   Update your policy to state: "We collect technical error logs to improve stability. These logs do not contain personal user data."
