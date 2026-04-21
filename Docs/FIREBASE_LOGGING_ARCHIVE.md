# Archived Firebase Error Logging Architecture

This document preserves the architecture, structure, and code snippets used for logging application errors to Firebase Firestore via a backend Cloud Function. This feature was previously active but has been archived and removed from the active codebase.

## Rationale
To ensure the security of the Chrome Extension, sensitive API keys (like the Firebase Web API Key) should not be hardcoded in the frontend code (`src/utils/firebaseConfig.js` or `manifest.json`). Instead, a "Backend-for-Frontend" (BFF) approach was designed using Firebase Cloud Functions to securely execute writes to the Firestore database.

---

## 1. The Backend: Firebase Cloud Function

A Node.js serverless function was created in the `functions/` directory. This function initialized the Firebase Admin SDK (which does not require a public API key when running within Google's cloud infrastructure) and accepted HTTP POST requests from the extension.

### `functions/package.json`
```json
{
  "name": "listing-auditor-functions",
  "description": "Firebase Cloud Functions for Listing Auditor Extension",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  },
  "engines": {
    "node": "20"
  },
  "main": "index.js"
}
```

### `functions/index.js`
```javascript
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.logError = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const payload = req.body;

    // Validate payload minimally
    if (!payload || !payload.message) {
      res.status(400).send("Bad Request: Missing error message");
      return;
    }

    const errorDoc = {
      message: payload.message,
      stack: payload.stack || "none",
      url: payload.url || "unknown",
      version: payload.version || "unknown",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: payload.userAgent || "unknown",
      action: payload.action || "unknown"
    };

    await db.collection("extension_errors").add(errorDoc);

    res.status(200).json({ success: true, message: "Error logged successfully." });
  } catch (error) {
    console.error("Error writing to Firestore", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});
```

---

## 2. The Frontend: Chrome Extension Client

The client-side logger was responsible for gathering error context (stack traces, URLs, actions) and sending a POST request to the deployed Cloud Function.

### `src/utils/firebaseConfig.js`
```javascript
export const FIREBASE_CONFIG = {
  cloudFunctionUrl: "https://<REGION>-<PROJECT_ID>.cloudfunctions.net/logError"
};
```

### `src/utils/logger.js`
```javascript
import { FIREBASE_CONFIG } from './firebaseConfig.js';

export async function logErrorToFirebase(error, context = {}) {
  if (!FIREBASE_CONFIG.cloudFunctionUrl || FIREBASE_CONFIG.cloudFunctionUrl.includes("<REGION>")) {
    console.warn("Firebase logging skipped: Configuration missing.");
    return;
  }

  const API_URL = FIREBASE_CONFIG.cloudFunctionUrl;

  try {
    const errorMsg = (error instanceof Error) ? error.message : String(error);
    let stack = (error instanceof Error) ? error.stack : "none";

    const version = chrome.runtime.getManifest().version;

    const payload = {
      message: errorMsg,
      stack: stack,
      url: context.url || "unknown",
      version: version,
      userAgent: navigator.userAgent,
      action: context.action || "unknown"
    };

    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

  } catch (e) {
    console.warn("Failed to log error to Firebase:", e);
  }
}
```

---

## 3. Chrome Extension Manifest

To allow the extension to communicate with the Cloud Function endpoint, the host permissions in `manifest.json` needed to be updated.

### `manifest.json`
```json
{
  "host_permissions": [
    "https://*.cloudfunctions.net/*",
    "*://*.amazon.com/*"
  ]
}
```

## How to Re-Integrate
If logging needs to be restored:
1. Re-add the `logErrorToFirebase` module.
2. Initialize and deploy the Cloud Function using the Firebase CLI (`firebase init functions` and `firebase deploy --only functions`).
3. Update `firebaseConfig.js` with the active deployment URL.
4. Add the Cloud Function domain to `host_permissions` in `manifest.json`.
5. Import and utilize `logErrorToFirebase(error, { action: "ERROR_TYPE" })` inside `try...catch` blocks across the codebase.
