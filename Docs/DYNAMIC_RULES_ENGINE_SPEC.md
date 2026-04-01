# Dynamic Rules Engine: Specification & Architecture

## 1. Executive Summary
The **Dynamic Rules Engine** is a core upgrade to the Amazon Listing Auditor, transitioning it from a static "Hardcoded Check" system to a flexible, user-defined **Standard Operating Procedure (SOP) Compliance Platform**.

This engine empowers users—specifically Agencies and Aggregators—to define their own "Golden Standards" for listing quality, rather than relying solely on generic best practices. It answers the question: *"Does this listing meet MY specific criteria?"*

---

## 2. Core Terminology & Concepts

To ensure clarity for both developers and users, we standardize the following terms:

| Term | Definition | Example |
| :--- | :--- | :--- |
| **Rule** | A single unit of logic that evaluates a specific attribute. | "Title must be < 200 chars" |
| **Rule Set (Profile)** | A collection of Rules grouped for a specific purpose. | "Nike Brand Guidelines", "Launch Phase Audit" |
| **Trigger (Scope)** | Conditions under which a Rule Set is active. | "Apply only to Category: Shoes" |
| **Field (Target)** | The data point being evaluated (from the Scraper). | `product_title`, `price`, `image_count` |
| **Operator** | The logic applied to the Field. | `equals`, `contains`, `greater_than`, `regex_match` |
| **Reference (Value)** | The benchmark value to compare against. | `200`, `"Official Store"`, `true` |
| **Action** | The outcome if a Rule fails. | `Warn` (Yellow), `Fail` (Red), `Auto-Fix` (Future) |

---

## 3. User Experience: Flexibility & Standardization

### A. Standardization (System Presets)
We provide "Out-of-the-Box" value immediately. These are **Read-Only Rule Sets** maintained by us:
*   **"Amazon SEO Basics":** Title length (80-200), 5+ Bullets, White Background Main Image.
*   **"Retail Readiness":** 15+ Reviews, Rating > 4.0, In Stock.

### B. Flexibility (Custom User Rules)
Users can create their own Rule Sets via a "No-Code" builder UI:
1.  **Brand Compliance:** "Title must start with [Brand Name]".
2.  **Content Strategy:** "Description must contain 'Warranty'".
3.  **Negative Keywords:** "Bullets must NOT contain 'Cheap', 'Best'".
4.  **Media Requirements:** "Image Count must be >= 7".

### C. Advanced Logic (The "Power User" Features)
*   **Regex Support:** For advanced pattern matching (e.g., ASIN format validation).
*   **Cross-Field Logic:** "If Price > $50, Then Image Count must be > 5".
*   **Global Variables:** Define `{{BrandName}}` once and use it across 50 rules.

---

## 4. Technical Architecture

### A. Technology Stack
*   **Core Logic:** Vanilla JavaScript (ES6 Modules). No heavy external libraries required.
*   **Storage:** `chrome.storage.local` for saving User Rule Sets.
*   **Validation:** Simple schema validation for import/export of rules (JSON).

### B. Data Schema (The "Rule Object")
Every rule is stored as a JSON object. This allows for easy sharing (Export/Import JSON) between team members.

```json
{
  "id": "rule_12345",
  "name": "Title Length Check",
  "description": "Ensure title is optimized for mobile (under 200 chars)",
  "enabled": true,
  "severity": "error", // "warning", "error", "info"
  "target": "title.length",
  "operator": "lte", // Less Than or Equal
  "value": 200,
  "category": "content" // grouping for UI
}
```

### C. The Logic Engine (`RuleEvaluator`)
A dedicated class `RuleEvaluator` will process the rules.

```javascript
// Pseudo-code for the Engine
class RuleEvaluator {
  constructor(rules) {
    this.rules = rules;
  }

  evaluate(productData) {
    const results = [];
    
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const actualValue = this.getValue(productData, rule.target);
      const passed = this.compare(actualValue, rule.operator, rule.value);

      results.push({
        ruleId: rule.id,
        passed: passed,
        actual: actualValue,
        expected: rule.value,
        severity: rule.severity
      });
    }
    return results;
  }

  compare(actual, op, expected) {
    switch (op) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'gt': return actual > expected;
      case 'contains': return actual.includes(expected);
      case 'regex': return new RegExp(expected).test(actual);
      // ... more operators
    }
  }
}
```

### D. UI Components (The "Rule Builder")
We will implement a reactive UI in the Side Panel (or a separate Options Page) to manage these rules.
1.  **Rule List View:** Toggle ON/OFF, Drag-to-Reorder.
2.  **Edit Modal:** Dropdowns for Field, Operator, Severity. Input for Value.
3.  **Test Bench:** A "Run Test" button to validate the rule against the *current* active tab's product data instantly.

---

## 5. Implementation Roadmap

### Phase 1: The Foundation (JSON Logic)
*   Define the `Rule` schema.
*   Implement `RuleEvaluator.js` class.
*   Migrate existing hardcoded checks (LQS) into this JSON format (System Presets).

### Phase 2: The UI (Read-Only)
*   Display the active System Rules in the Auditor interface.
*   Show Pass/Fail status based on the Engine's output (replacing current hardcoded logic).

### Phase 3: User Customization (CRUD)
*   Build the "Add New Rule" form.
*   Implement Storage (Save/Load from `chrome.storage`).
*   Add "Export to JSON" / "Import from JSON" for sharing.

### Phase 4: Advanced Features
*   Regex support.
*   "Global Variables" (e.g., Define Brand Name once).

---

## 6. Strategic Value
This architecture transforms the extension from a **"Tool"** (single-purpose utility) into a **"Platform"** (customizable workflow solution). It directly addresses the needs of Agencies who manage diverse clients with varying requirements.
