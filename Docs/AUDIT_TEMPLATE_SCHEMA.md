# Amazon Listing Auditor - Custom Audit Templates Schema

**Status:** DRAFT (Architecture Planning)
**Purpose:** Transitioning the Auditor from hardcoded functions (`auditContent()`, `auditImages()`) to a purely declarative, user-customizable rules engine capable of performing Multi-Context Audits (Live PDP vs. VC Portal vs. Catalog CSV).

---

## 1. High-Level Concept

An "Audit Template" is a collection of user-defined "Rules". Each rule specifies two data sources (Source A and Source B) and an operator to compare them.

*   **Contexts:** A source can be extracted from:
    *   `PDP` (The Live Amazon.com product page)
    *   `VC` (Vendor Central backend portal)
    *   `SC` (Seller Central backend portal)
    *   `CATALOG` (The uploaded CSV/Excel file)
    *   `STATIC` (A hardcoded expected value)

## 2. JSON Schema Definition

```json
{
  "templateId": "tmpl_content_strict",
  "templateName": "Strict Content Integrity Audit",
  "description": "Verifies that the Live PDP exactly matches the Vendor Central backend.",
  "rules": [
    {
      "id": "rule_title_match",
      "name": "Title Synchronization",
      "isActive": true,

      // Where do we get the first piece of data?
      "sourceA": {
        "context": "PDP",
        "extraction": {
          "method": "css",
          "selector": "#productTitle",
          "attribute": "text",
          "processing": "remove_line_breaks"
        }
      },

      // Where do we get the data to compare it against?
      "sourceB": {
        "context": "VC",
        "extraction": {
          "method": "css",
          "selector": "input[name='item_name']",
          "attribute": "value",
          "processing": "none"
        }
      },

      // How do we compare them?
      "operator": "fuzzy_equals",

      // What happens if it fails?
      "onFail": {
        "severity": "CRITICAL",
        "message": "Title is stuck in Vendor Central and has not published to Live PDP."
      }
    },
    {
      "id": "rule_price_check",
      "name": "MAP Pricing Violation",
      "isActive": true,
      "sourceA": {
        "context": "PDP",
        "extraction": {
          "method": "css",
          "selector": ".a-price-whole",
          "attribute": "text",
          "processing": "numbers_only"
        }
      },
      "sourceB": {
        "context": "STATIC",
        "value": "29.99"
      },
      "operator": "gte",
      "onFail": {
        "severity": "WARNING",
        "message": "Live price is below MAP ($29.99)."
      }
    },
    {
      "id": "rule_bullet_check",
      "name": "Catalog Bullet Sync",
      "isActive": true,
      "sourceA": {
        "context": "PDP",
        "extraction": {
          "method": "css",
          "selector": "#feature-bullets li span",
          "attribute": "text",
          "multiple": true
        }
      },
      "sourceB": {
        "context": "CATALOG",
        "columnName": "Target Bullets"
      },
      "operator": "contains_all",
      "onFail": {
        "severity": "ERROR",
        "message": "Live PDP is missing bullet points from the Golden Record."
      }
    }
  ]
}
```

## 3. Supported Operators

To make this engine powerful, the `Comparator.js` module will expose the following generic operators:

*   **String Matching:**
    *   `equals` (Exact match)
    *   `fuzzy_equals` (Ignores punctuation, casing, stop-words)
    *   `contains` (Source A contains Source B)
    *   `regex_match` (Evaluates a regex pattern against Source A)
*   **Numeric Logic:**
    *   `gt`, `gte`, `lt`, `lte` (Greater/Less than)
    *   `delta_percent` (Fails if Source A differs from Source B by more than X%)
*   **Array Logic (For Multiple Elements like Bullets/Images):**
    *   `contains_all` (Every item in Source B exists in Source A)
    *   `exact_order` (Arrays match perfectly in value and sequence)
    *   `count_equals` (Length of Array A matches Length/Number B)
*   **Existence:**
    *   `exists` (Source A was found/extracted successfully)
    *   `not_exists` (Fails if Source A is present)

## 4. Execution Flow (The "Three-Way Match" Pipeline)

1.  **The Runner (`background.js`):** Reads the active Template.
2.  **Context Resolution:**
    *   If a rule requires `PDP`, it injects `content.js` into the live Amazon tab.
    *   If a rule requires `VC`, it opens a hidden tab to `vendorcentral.amazon.com`, injects `content.js`, and extracts the data.
    *   If a rule requires `CATALOG`, it reads the uploaded CSV row.
3.  **The Comparator (`auditorEngine.js`):** Receives the resolved data from all contexts and executes the defined `operator`.
4.  **The Output:** Generates a unified JSON report detailing every rule execution, its Pass/Fail status, and the raw extracted values for debugging.
