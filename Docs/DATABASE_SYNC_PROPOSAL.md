# Proposal: User Catalog Sync with Firebase Firestore

Yes, you **can** set up a database to save and sync User Dynamic Catalog Data. This allows users to access their audit history and catalogs from any computer where they are signed into Chrome.

However, unlike the Error Logging system (which is "Anonymous Write-Only"), this feature requires **Authentication**. You cannot simply open the database; you need to ensure User A can only read User A's data, not User B's.

## 1. The Architecture

We can continue using the **Firebase Firestore REST API** to keep the extension lightweight (avoiding the heavy Firebase JS SDK), but we must add an Authentication layer.

*   **Frontend (Extension):** Uses `chrome.identity` to get the user's Google Account token.
*   **Auth Bridge:** Exchanges the Google Token for a Firebase Auth Token using the Google Identity Toolkit API (REST).
*   **Database (Firestore):** Stores data in a structure like `users/{userId}/catalogs/{catalogId}`.
*   **Security:** Firestore Rules enforce ownership.

## 2. Setup Details

### A. Firebase Console Setup
1.  **Authentication:** Go to Firebase Console > Authentication. Enable **Google** as a sign-in provider.
2.  **Firestore:** You already have this. We will create a new collection strategy (conceptually).

### B. The Authentication Flow (The Hard Part)
Since we are avoiding the heavy SDK, we must implement the "Auth Dance" manually:

1.  **Get Chrome Token:**
    Call `chrome.identity.getAuthToken({ interactive: true }, ...)` to get an OAuth2 token from the browser.
2.  **Exchange for Firebase Token:**
    Send a POST request to:
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=[YOUR_API_KEY]`
    Body: `{ postBody: "access_token=[CHROME_TOKEN]&providerId=google.com", ... }`
3.  **Receive ID Token:**
    Firebase returns an `idToken`. This is your "Key" to the database.
4.  **Access Database:**
    When calling the Firestore REST API (like we do for logging), we append the header:
    `Authorization: Bearer [FIREBASE_ID_TOKEN]`

### C. Database Structure
We should structure the data to prevent monolithic documents (Firestore has a 1MB limit per doc).

**Collection: `users`**
*   **Document:** `{userId}` (The unique ID from Firebase)
    *   **Sub-Collection: `catalogs`**
        *   **Document:** `{catalogId}` (e.g., "Batch-2023-10-25")
            *   `createdAt`: Timestamp
            *   `name`: "My Amazon Audit"
            *   `items`: [ ...Array of ASIN data... ]

### D. Security Rules (Crucial)
You must update your Firestore Rules to protect user data.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Existing Error Logs (Public Write-Only)
    match /extension_errors/{document=**} {
      allow create: if true;
      allow read, update, delete: if false;
    }

    // NEW: User Catalogs (Private Read/Write)
    match /users/{userId}/{document=**} {
      // Only allow access if the requesting user's ID matches the document ID
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 3. Chrome Store Compliance

This feature moves your extension into a new category of data collection.

1.  **Permissions:** You need `"identity"` in `manifest.json` (already present).
2.  **Privacy Practices:**
    *   **Data Collected:** You must check **"Personally Identifiable Information (PII)"** (because you handle Auth IDs) and **"User Content"** (the catalogs).
    *   **Justification:** "We collect user ID and catalog data to enable cross-device synchronization and cloud backup features."
3.  **Privacy Policy:**
    *   Your policy **must** explicitly state: "If you choose to sync your data, we store your catalog information on our secure servers (Firebase). This data is linked to your account but is not shared with third parties."

## 4. Pros, Cons, and Challenges

| Feature | Description |
| :--- | :--- |
| **Pros** | • **Cloud Backup:** Users never lose data if they uninstall.<br>• **Cross-Device:** Start audit on work PC, finish on home PC.<br>• **Professional Value:** Justifies a "Pro" tier if you monetize later. |
| **Cons** | • **Complexity:** Authentication flows are tricky to debug (token expiration, network errors).<br>• **Cost:** While free initially, extensive syncing of large catalogs consumes Firestore "Write" quotas (20k/day free).<br>• **Data Liability:** You are now responsible for storing user data securely. |
| **Challenges** | • **The 1MB Limit:** Firestore documents cannot exceed 1MB. If a catalog has 1000 items with images, it **will fail**. <br> *Solution:* You must split large catalogs into multiple documents or store only metadata in Firestore and heavy JSON in **Firebase Storage** (Blob storage). |

## 5. Recommendation

If you proceed, start **simple**.
1.  Don't sync the *entire* scraped result (images, descriptions) initially.
2.  Sync the **Configuration** (ASIN list + Status).
3.  If that works, consider using **Firebase Storage** for the heavy JSON blobs (cheaper and no 1MB limit) and just use Firestore for the index/list of files.

## 6. Capacity Planning (Crucial Update)

We performed a size analysis on a "Fully Audited" ASIN result (containing large descriptions, 10+ images, A+ content metadata, and video links).

*   **Average Size per ASIN:** ~15 KB
*   **Firestore Document Limit:** 1 MB (1,048,576 bytes)
*   **Safe Buffer Limit:** ~900 KB

### **Recommended Hard Limit: 50 ASINs per Document**

To avoid "Document too large" errors, you cannot store an unlimited array of items in a single document.

### **Strategy: Pagination / Sub-collections**

If a user creates a catalog with 200 items, you should split it:

1.  **Catalog Metadata (The "Folder"):**
    *   `users/{uid}/catalogs/{catalogId}`
    *   Contains: `name`, `createdAt`, `totalItems: 200`, `pageCount: 4`

2.  **Catalog Pages (The Data):**
    *   `users/{uid}/catalogs/{catalogId}/pages/1` (Items 1-50)
    *   `users/{uid}/catalogs/{catalogId}/pages/2` (Items 51-100)
    *   `users/{uid}/catalogs/{catalogId}/pages/3` (Items 101-150)
    *   ...

**Why this helps:**
*   **Performance:** Loading the list of catalogs is fast (only fetching metadata).
*   **Scalability:** You can support catalogs with 5,000+ items without hitting limits.
*   **Cost:** You only read the specific "page" of data the user is viewing.
